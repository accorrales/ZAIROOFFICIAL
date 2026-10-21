const pool = require('../config/database');

// ============================================================
//  Reto 70: cada cliente registra su propio código de descuento.
//  Todos los códigos de la campaña comparten las mismas reglas
//  (10%, misma vigencia, todos los eventos) y quien llegue a 70
//  entradas vendidas gana el premio.
// ============================================================

const CAMPANA = Object.freeze({
  id: 'RETO70_OCT2026',
  nombre: 'Reto 70',
  meta_entradas: 70,
  porcentaje: 10,
  // Hora de Costa Rica (UTC-6, sin horario de verano).
  fecha_inicio: new Date('2026-10-21T08:00:00-06:00'),
  fecha_fin: new Date('2026-10-28T23:59:59-06:00'),
  premio: '1 entrada doble Picnic + 1 entrada doble VIP ZAIRO'
});

const CODIGO_REGEX = /^[A-Z0-9]{4,15}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PALABRAS_RESERVADAS = ['ZAIRO', 'ADMIN', 'CORTESIA', 'GRATIS', 'FREE'];

const normalizarCodigo = (codigo) =>
  (codigo || '').toString().trim().toUpperCase().replace(/[\s-]+/g, '');

// Deja solo dígitos y quita el prefijo de Costa Rica (506) si viene incluido.
const normalizarTelefono = (telefono) => {
  const digitos = (telefono || '').toString().replace(/\D/g, '');
  return digitos.length === 11 && digitos.startsWith('506') ? digitos.slice(3) : digitos;
};

const infoPublica = (ahora = new Date()) => ({
  nombre: CAMPANA.nombre,
  meta_entradas: CAMPANA.meta_entradas,
  porcentaje: CAMPANA.porcentaje,
  fecha_inicio: CAMPANA.fecha_inicio,
  fecha_fin: CAMPANA.fecha_fin,
  premio: CAMPANA.premio,
  registro_abierto: ahora <= CAMPANA.fecha_fin,
  activa: ahora >= CAMPANA.fecha_inicio && ahora <= CAMPANA.fecha_fin
});

const validarRegistro = ({ nombre, email, telefono, codigo }) => {
  const datos = {
    nombre: (nombre || '').toString().trim().replace(/\s+/g, ' '),
    email: (email || '').toString().trim().toLowerCase(),
    telefono: normalizarTelefono(telefono),
    codigo: normalizarCodigo(codigo)
  };

  if (datos.nombre.length < 2 || datos.nombre.length > 80) {
    return { error: 'Ingresá tu nombre completo' };
  }
  if (!EMAIL_REGEX.test(datos.email) || datos.email.length > 160) {
    return { error: 'Ingresá un correo válido' };
  }
  if (datos.telefono.length < 8 || datos.telefono.length > 15) {
    return { error: 'Ingresá un número de teléfono válido' };
  }
  if (!CODIGO_REGEX.test(datos.codigo)) {
    return { error: 'El código debe tener de 4 a 15 letras o números, sin tildes ni símbolos' };
  }
  if (PALABRAS_RESERVADAS.some((palabra) => datos.codigo.includes(palabra))) {
    return { error: 'Ese código no está permitido, probá con otro' };
  }

  return { datos };
};

const obtenerCampana = (req, res) => {
  res.json(infoPublica());
};

const registrarCodigo = async (req, res) => {
  const info = infoPublica();

  if (!info.registro_abierto) {
    return res.status(400).json({ error: 'El Reto 70 ya finalizó' });
  }

  const { error, datos } = validarRegistro(req.body || {});
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const result = await pool.query(
      `INSERT INTO codigos_descuento
       (codigo, descripcion, tipo_descuento, valor, id_evento, fecha_inicio, fecha_fin,
        usos_maximos, estado, origen, campana, contacto_nombre, contacto_email, contacto_telefono)
       VALUES ($1, $2, 'PORCENTAJE', $3, NULL, $4, $5, NULL, true, 'CLIENTE', $6, $7, $8, $9)
       RETURNING codigo, valor, fecha_inicio, fecha_fin`,
      [
        datos.codigo,
        datos.nombre,
        CAMPANA.porcentaje,
        CAMPANA.fecha_inicio,
        CAMPANA.fecha_fin,
        CAMPANA.id,
        datos.nombre,
        datos.email,
        datos.telefono
      ]
    );

    const creado = result.rows[0];
    return res.status(201).json({
      codigo: creado.codigo,
      porcentaje: Number(creado.valor),
      fecha_inicio: creado.fecha_inicio,
      fecha_fin: creado.fecha_fin,
      meta_entradas: CAMPANA.meta_entradas,
      premio: CAMPANA.premio
    });
  } catch (err) {
    if (err.code === '23505') {
      const restriccion = err.constraint || '';
      if (restriccion.includes('email')) {
        return res.status(409).json({ error: 'Ya hay un código registrado con ese correo' });
      }
      if (restriccion.includes('telefono')) {
        return res.status(409).json({ error: 'Ya hay un código registrado con ese teléfono' });
      }
      return res.status(409).json({ error: 'Ese código ya está en uso, probá con otro' });
    }
    console.error(err);
    return res.status(500).json({ error: 'No se pudo registrar el código' });
  }
};

// Avance público de un código de la campaña. No expone datos de contacto,
// solo el primer nombre y las entradas válidas vendidas (pagadas y no invalidadas).
const consultarProgreso = async (req, res) => {
  const codigo = normalizarCodigo(req.params.codigo);

  if (!CODIGO_REGEX.test(codigo)) {
    return res.status(404).json({ error: 'No encontramos ese código en el Reto 70' });
  }

  try {
    const result = await pool.query(
      `SELECT
         c.codigo,
         c.contacto_nombre,
         c.estado,
         COALESCE((
           SELECT COUNT(*)
           FROM compras_entradas ce
           INNER JOIN compra_entrada_detalles d ON d.id_compra = ce.id_compra
           WHERE ce.id_codigo = c.id_codigo
             AND ce.estado = 'PAGADA'
             AND d.fecha_invalidacion IS NULL
         ), 0)::int AS entradas_vendidas
       FROM codigos_descuento c
       WHERE UPPER(c.codigo) = $1 AND c.campana = $2
       LIMIT 1`,
      [codigo, CAMPANA.id]
    );

    const fila = result.rows[0];
    if (!fila) {
      return res.status(404).json({ error: 'No encontramos ese código en el Reto 70' });
    }

    const vendidas = Number(fila.entradas_vendidas || 0);
    return res.json({
      codigo: fila.codigo,
      nombre: (fila.contacto_nombre || '').split(' ')[0],
      activo: fila.estado === true,
      entradas_vendidas: vendidas,
      meta_entradas: CAMPANA.meta_entradas,
      faltan: Math.max(CAMPANA.meta_entradas - vendidas, 0),
      meta_alcanzada: vendidas >= CAMPANA.meta_entradas,
      fecha_inicio: CAMPANA.fecha_inicio,
      fecha_fin: CAMPANA.fecha_fin
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'No se pudo consultar el avance' });
  }
};

module.exports = {
  CAMPANA,
  obtenerCampana,
  registrarCodigo,
  consultarProgreso,
  normalizarTelefono,
  validarRegistro
};
