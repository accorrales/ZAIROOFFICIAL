const pool = require('../config/database');
const emailService = require('./emailService');

// Costa Rica no usa horario de verano: el offset UTC-6 es fijo todo el año.
const CR_UTC_OFFSET_HOURS = 6;

const diasAntesEnvio = () => Number(process.env.LOCATION_SEND_DAYS_BEFORE || 3);
const horaEnvioCR = () => {
  const hora = Number(process.env.LOCATION_SEND_HOUR);
  return Number.isFinite(hora) && hora >= 0 && hora <= 23 ? hora : 10;
};

// Instante (UTC) en el que corresponde enviar la ubicación de un evento:
// "N días antes de la fecha del evento, a las H:00 hora Costa Rica".
const calcularEnvioProgramado = (fechaEvento) => {
  const fecha = new Date(fechaEvento);
  const objetivo = new Date(fecha.getTime() - diasAntesEnvio() * 24 * 60 * 60 * 1000);
  const horaUTC = (horaEnvioCR() + CR_UTC_OFFSET_HOURS) % 24;
  objetivo.setUTCHours(horaUTC, 0, 0, 0);
  return objetivo;
};

const tieneUbicacionConfigurada = (evento) =>
  !!(evento.ubicacion_secreta_nombre?.trim() && evento.ubicacion_secreta_direccion?.trim());

// Eventos activos, con envío habilitado, con ubicación configurada y cuyo
// momento de envío (programado manualmente o calculado por defecto) ya pasó.
// Esto cubre el caso de "servidor apagado": si el cron vuelve a correr y el
// evento ya está dentro del rango, se envía en cuanto corre, sin esperar
// a la próxima ejecución exacta.
const obtenerEventosElegibles = async () => {
  const result = await pool.query(
    `
    SELECT *
    FROM eventos
    WHERE estado = true
      AND ubicacion_envio_habilitado = true
      AND ubicacion_secreta_nombre IS NOT NULL AND ubicacion_secreta_nombre <> ''
      AND ubicacion_secreta_direccion IS NOT NULL AND ubicacion_secreta_direccion <> ''
      AND fecha > NOW()
    `
  );

  const ahora = new Date();

  return result.rows.filter((evento) => {
    const programado = evento.ubicacion_envio_programado_at
      ? new Date(evento.ubicacion_envio_programado_at)
      : calcularEnvioProgramado(evento.fecha);

    return programado <= ahora;
  });
};

const obtenerCompradoresPagados = async (idEvento) => {
  const result = await pool.query(
    `
    SELECT id_compra, correo_comprador, telefono_comprador
    FROM compras_entradas
    WHERE id_evento = $1
      AND estado = 'PAGADA'
    ORDER BY id_compra
    `,
    [idEvento]
  );

  return result.rows;
};

// Una compra puntual del evento, solo si está PAGADA (para el envío
// individual desde el panel admin).
const obtenerCompraPagada = async (idEvento, idCompra) => {
  const result = await pool.query(
    `
    SELECT id_compra, correo_comprador, telefono_comprador
    FROM compras_entradas
    WHERE id_evento = $1
      AND id_compra = $2
      AND estado = 'PAGADA'
    `,
    [idEvento, idCompra]
  );

  return result.rows[0] || null;
};

// Crea (si no existe) el registro PENDIENTE para una compra. Gracias al
// UNIQUE (id_evento, id_compra) nunca se duplica: si ya existe, no hace nada
// y devuelve la fila existente para saber si ya fue ENVIADO.
const asegurarNotificacionPendiente = async (idEvento, compra, canal = 'EMAIL') => {
  const result = await pool.query(
    `
    INSERT INTO notificaciones_ubicacion_evento
      (id_evento, id_compra, correo_destino, telefono_destino, estado_envio, canal)
    VALUES ($1, $2, $3, $4, 'PENDIENTE', $5)
    ON CONFLICT (id_evento, id_compra) DO NOTHING
    RETURNING *
    `,
    [idEvento, compra.id_compra, compra.correo_comprador, compra.telefono_comprador, canal]
  );

  if (result.rows[0]) return result.rows[0];

  const existente = await pool.query(
    `SELECT * FROM notificaciones_ubicacion_evento WHERE id_evento = $1 AND id_compra = $2`,
    [idEvento, compra.id_compra]
  );

  return existente.rows[0];
};

const marcarEnviado = async (idNotificacion) => {
  await pool.query(
    `
    UPDATE notificaciones_ubicacion_evento
    SET estado_envio = 'ENVIADO', enviado_at = NOW(), error_mensaje = NULL, updated_at = NOW()
    WHERE id = $1
    `,
    [idNotificacion]
  );
};

const marcarError = async (idNotificacion, mensaje) => {
  await pool.query(
    `
    UPDATE notificaciones_ubicacion_evento
    SET estado_envio = 'ERROR', error_mensaje = $2, updated_at = NOW()
    WHERE id = $1
    `,
    [idNotificacion, String(mensaje).slice(0, 500)]
  );
};

// Envía (o reintenta) la ubicación a una sola compra. Es la unidad básica
// que reutilizan tanto el envío masivo del evento como el envío individual.
const enviarUbicacionACompra = async (evento, compra, canal = 'EMAIL') => {
  const notificacion = await asegurarNotificacionPendiente(evento.id_evento, compra, canal);

  if (notificacion.estado_envio === 'ENVIADO') {
    return { estado: 'OMITIDO', notificacion };
  }

  try {
    await emailService.enviarUbicacion({
      correo: compra.correo_comprador,
      evento: evento.nombre,
      fechaEvento: evento.fecha,
      ubicacionNombre: evento.ubicacion_secreta_nombre,
      ubicacionDireccion: evento.ubicacion_secreta_direccion,
      googleMapsUrl: evento.ubicacion_secreta_google_maps_url,
      wazeUrl: evento.ubicacion_secreta_waze_url
    });

    await marcarEnviado(notificacion.id);

    await pool.query(
      `
      UPDATE eventos
      SET ubicacion_enviada_at = COALESCE(ubicacion_enviada_at, NOW())
      WHERE id_evento = $1
      `,
      [evento.id_evento]
    );

    return { estado: 'ENVIADO', notificacion };
  } catch (error) {
    console.error(`ERROR ENVIANDO UBICACION (evento ${evento.id_evento}, compra ${compra.id_compra}):`, error);
    await marcarError(notificacion.id, error.message || 'Error desconocido enviando el correo');
    return { estado: 'ERROR', notificacion, error: error.message };
  }
};

// Envía (o reintenta) la ubicación a todas las compras PAGADAS del evento
// que todavía no la recibieron. Se usa tanto desde el cron como desde el
// envío masivo manual del admin.
const enviarUbicacionEvento = async (evento, { canal = 'EMAIL' } = {}) => {
  if (!tieneUbicacionConfigurada(evento)) {
    throw new Error('El evento no tiene ubicación secreta configurada');
  }

  const compradores = await obtenerCompradoresPagados(evento.id_evento);

  const resumen = { enviados: 0, errores: 0, omitidos: 0, total: compradores.length };

  for (const compra of compradores) {
    const { estado } = await enviarUbicacionACompra(evento, compra, canal);

    if (estado === 'ENVIADO') resumen.enviados += 1;
    else if (estado === 'ERROR') resumen.errores += 1;
    else resumen.omitidos += 1;
  }

  return resumen;
};

// Envío individual: manda la ubicación a un único comprador seleccionado por
// el admin, sin tocar al resto de compras del evento.
const enviarUbicacionAUnaCompra = async (evento, idCompra, canal = 'MANUAL') => {
  if (!tieneUbicacionConfigurada(evento)) {
    throw new Error('El evento no tiene ubicación secreta configurada');
  }

  const compra = await obtenerCompraPagada(evento.id_evento, idCompra);

  if (!compra) {
    throw new Error('La compra no existe o no está pagada para este evento');
  }

  const resultado = await enviarUbicacionACompra(evento, compra, canal);

  if (resultado.estado === 'ERROR') {
    throw new Error(resultado.error || 'Error enviando la ubicación a esta compra');
  }

  return { ...resultado, compra };
};

// Recorre todos los eventos elegibles (llamado por el cron cada cierto tiempo).
const procesarEventosPendientes = async () => {
  if (String(process.env.LOCATION_NOTIFICATIONS_ENABLED).toLowerCase() !== 'true') {
    return { habilitado: false, eventosProcesados: 0 };
  }

  const eventos = await obtenerEventosElegibles();
  const resultados = [];

  for (const evento of eventos) {
    try {
      const resumen = await enviarUbicacionEvento(evento, { canal: 'EMAIL' });
      resultados.push({ id_evento: evento.id_evento, nombre: evento.nombre, ...resumen });
    } catch (error) {
      console.error(`ERROR PROCESANDO UBICACION DEL EVENTO ${evento.id_evento}:`, error);
      resultados.push({ id_evento: evento.id_evento, nombre: evento.nombre, error: error.message });
    }
  }

  return { habilitado: true, eventosProcesados: resultados.length, resultados };
};

// Estadísticas para el panel admin: cuántas compras pagadas recibirían la
// ubicación, cuántas ya la recibieron y cuántas faltan.
const obtenerPreview = async (idEvento) => {
  const eventoResult = await pool.query(`SELECT * FROM eventos WHERE id_evento = $1`, [idEvento]);

  if (eventoResult.rows.length === 0) {
    throw new Error('Evento no encontrado');
  }

  const evento = eventoResult.rows[0];

  const totalPagadas = await pool.query(
    `SELECT COUNT(*) AS total FROM compras_entradas WHERE id_evento = $1 AND estado = 'PAGADA'`,
    [idEvento]
  );

  const enviadas = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM notificaciones_ubicacion_evento
    WHERE id_evento = $1 AND estado_envio = 'ENVIADO'
    `,
    [idEvento]
  );

  const conError = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM notificaciones_ubicacion_evento
    WHERE id_evento = $1 AND estado_envio = 'ERROR'
    `,
    [idEvento]
  );

  const total = Number(totalPagadas.rows[0].total);
  const yaEnviadas = Number(enviadas.rows[0].total);

  const compradores = await obtenerCompradoresConEstado(idEvento);

  return {
    ubicacion: {
      ubicacion_secreta_nombre: evento.ubicacion_secreta_nombre,
      ubicacion_secreta_direccion: evento.ubicacion_secreta_direccion,
      ubicacion_secreta_google_maps_url: evento.ubicacion_secreta_google_maps_url,
      ubicacion_secreta_waze_url: evento.ubicacion_secreta_waze_url,
      ubicacion_envio_habilitado: evento.ubicacion_envio_habilitado,
      ubicacion_enviada_at: evento.ubicacion_enviada_at,
      ubicacion_envio_programado_at: evento.ubicacion_envio_programado_at,
      ubicacion_visible_publicamente: evento.ubicacion_visible_publicamente,
      configurada: tieneUbicacionConfigurada(evento)
    },
    compradores_pagados: total,
    ya_recibieron: yaEnviadas,
    faltan_por_recibir: Math.max(total - yaEnviadas, 0),
    con_error: Number(conError.rows[0].total),
    compradores
  };
};

// Lista de compradores PAGADOS del evento con su estado de envío de
// ubicación (o null si nunca se intentó), para que el admin pueda elegir
// a quién enviarle individualmente desde el panel.
const obtenerCompradoresConEstado = async (idEvento) => {
  const result = await pool.query(
    `
    SELECT
      c.id_compra,
      c.correo_comprador,
      c.telefono_comprador,
      c.cantidad,
      c.total,
      c.fecha_creacion,
      n.estado_envio,
      n.enviado_at,
      n.error_mensaje
    FROM compras_entradas c
    LEFT JOIN notificaciones_ubicacion_evento n
      ON n.id_evento = c.id_evento AND n.id_compra = c.id_compra
    WHERE c.id_evento = $1
      AND c.estado = 'PAGADA'
    ORDER BY c.fecha_creacion
    `,
    [idEvento]
  );

  return result.rows;
};

const obtenerHistorial = async (idEvento) => {
  const result = await pool.query(
    `
    SELECT n.*, c.total AS total_compra, c.cantidad
    FROM notificaciones_ubicacion_evento n
    INNER JOIN compras_entradas c ON c.id_compra = n.id_compra
    WHERE n.id_evento = $1
    ORDER BY n.updated_at DESC
    `,
    [idEvento]
  );

  return result.rows;
};

// Exporta la lista de compradores PAGADOS con teléfono, para envío manual
// por WhatsApp (no hay integración oficial de WhatsApp Business en el
// proyecto, así que no se inventa un envío automático por ese canal).
const exportarCompradoresConTelefono = async (idEvento) => {
  const result = await pool.query(
    `
    SELECT id_compra, correo_comprador, telefono_comprador, cantidad, total, estado, fecha_creacion
    FROM compras_entradas
    WHERE id_evento = $1 AND estado = 'PAGADA'
    ORDER BY fecha_creacion
    `,
    [idEvento]
  );

  return result.rows;
};

module.exports = {
  calcularEnvioProgramado,
  tieneUbicacionConfigurada,
  obtenerEventosElegibles,
  obtenerCompraPagada,
  enviarUbicacionEvento,
  enviarUbicacionAUnaCompra,
  procesarEventosPendientes,
  obtenerPreview,
  obtenerCompradoresConEstado,
  obtenerHistorial,
  exportarCompradoresConTelefono
};
