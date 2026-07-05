const pool = require('../../config/database');
const templates = require('./whatsapp.templates');

// ============================================================
//  Asistente básico por reglas (sin IA externa).
//  Responde consultas frecuentes usando SIEMPRE datos reales de la
//  base de datos. Si no sabe, marca la conversación para atención
//  humana en lugar de inventar información.
//
//  Multi-evento: cuando la conversación está asociada a una compra/
//  evento usa ese contexto; si no, responde de forma genérica.
// ============================================================

const money = (v) => `₡${Number(v || 0).toLocaleString('es-CR')}`;

/**
 * Responde una intención. Devuelve { texto } si el bot puede contestar,
 * o { requiereHumano: true } si debe escalar a una persona.
 *
 * @param {object} ctx
 * @param {string} ctx.intencion
 * @param {object|null} ctx.compra    Compra asociada (si existe).
 * @param {number|null} ctx.eventoId  Evento de contexto (si existe).
 */
const responder = async ({ intencion, compra, eventoId }) => {
  const idEvento = eventoId || compra?.id_evento || null;

  switch (intencion) {
    case 'SALUDO':
      return { texto: templates.saludoGenerico() };

    case 'PRECIO':
      return await responderPrecios(idEvento);

    case 'DISPONIBILIDAD':
      return await responderDisponibilidad(idEvento);

    case 'UBICACION':
      return await responderUbicacion(idEvento);

    case 'ESTADO':
      return responderEstado(compra);

    case 'NO_LLEGO_CORREO':
      return {
        texto:
          'Si ya confirmamos tu pago, tu entrada se envió al correo registrado. 📩\n\n' +
          'Revisá spam y promociones. Si no la encontrás, escribinos tu código de compra ' +
          'y lo revisamos.',
        requiereHumano: true
      };

    case 'COMPRAR':
      return {
        texto:
          '¡Genial! 🎟️ Podés comprar tus entradas desde nuestra página oficial. ' +
          'Cuando completes la compra, enviá tu comprobante a este chat para confirmarla.'
      };

    default:
      // No sabemos responder con certeza: escalar a humano.
      return { requiereHumano: true };
  }
};

const responderPrecios = async (idEvento) => {
  if (!idEvento) {
    return {
      texto:
        'Con gusto te ayudo con los precios. 🎟️ ¿A cuál evento te referís? ' +
        'Podés enviar tu código de compra para darte el detalle exacto.',
      requiereHumano: true
    };
  }

  const result = await pool.query(
    `SELECT nombre, precio FROM entrada_tiers
     WHERE id_evento = $1
     ORDER BY precio ASC`,
    [idEvento]
  );

  if (result.rows.length === 0) return { requiereHumano: true };

  const lineas = result.rows.map((t) => `• ${t.nombre}: ${money(t.precio)}`).join('\n');
  return { texto: `Estos son los precios disponibles: 🎟️\n\n${lineas}` };
};

const responderDisponibilidad = async (idEvento) => {
  if (!idEvento) return { requiereHumano: true };

  // Cuenta tiers activos por ventana de fechas (si aplica).
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n FROM entrada_tiers
     WHERE id_evento = $1
       AND (fecha_fin IS NULL OR fecha_fin >= NOW())`,
    [idEvento]
  );

  if (result.rows[0].n > 0) {
    return { texto: 'Sí, todavía tenemos entradas disponibles. 🎉 ¿Querés que te ayude a comprarlas?' };
  }
  return { requiereHumano: true };
};

const responderUbicacion = async (idEvento) => {
  if (!idEvento) return { requiereHumano: true };

  const result = await pool.query(
    `SELECT ubicacion, ubicacion_envio_habilitado, ubicacion_visible_publicamente
     FROM eventos WHERE id_evento = $1`,
    [idEvento]
  );

  const evento = result.rows[0];
  if (!evento) return { requiereHumano: true };

  // Regla del evento: si la ubicación aún no es pública, se envía por correo.
  if (evento.ubicacion_visible_publicamente && evento.ubicacion) {
    return { texto: `📍 La ubicación del evento es: ${evento.ubicacion}` };
  }

  return {
    texto:
      'La ubicación exacta se enviará al correo registrado unos días antes del evento. 📩🌿\n\n' +
      'Es parte de la experiencia ZAIRO, ¡mantené el ojo en tu bandeja de entrada!'
  };
};

const responderEstado = (compra) => {
  if (!compra) {
    return {
      texto:
        'Para revisar tu estado necesito tu *código de compra*. 🔎 ' +
        'Enviámelo y te digo cómo va tu compra.'
    };
  }

  const estados = {
    PENDIENTE: 'Tu compra está *pendiente de pago*. Enviá tu comprobante a este chat para confirmarla. 🕓',
    PAGADA: 'Tu compra ya está *confirmada y pagada*. ✅ Tu entrada fue enviada al correo registrado.',
    RECHAZADA: 'Tu compra figura como *rechazada*. Si creés que es un error, respondé este mensaje. ⚠️'
  };

  return {
    texto: estados[compra.estado] || 'Estoy revisando el estado de tu compra. Un momento por favor.',
    requiereHumano: compra.estado === 'RECHAZADA'
  };
};

module.exports = { responder };
