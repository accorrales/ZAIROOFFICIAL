const pool = require('../../config/database');

const repository = require('./whatsapp.repository');
const webhook = require('./whatsapp.webhook');
const templates = require('./whatsapp.templates');
const confirmarCompraService = require('../../services/confirmarCompraService');
const { normalizarTelefono } = require('./whatsapp.utils');

// ============================================================
//  Controlador admin del módulo WhatsApp / Comprobantes.
//  Todos los endpoints van protegidos con JWT + rol admin en las rutas.
//  Queries parametrizadas; errores sin exponer stack traces.
// ============================================================

// ---------- Listar conversaciones ----------
exports.listarConversaciones = async (req, res) => {
  try {
    const { evento, estado, needs_human, telefono } = req.query;
    const filtros = [];
    const valores = [];
    let i = 1;

    if (evento) { filtros.push(`conv.evento_id = $${i++}`); valores.push(Number(evento)); }
    if (estado) { filtros.push(`conv.current_state = $${i++}`); valores.push(estado); }
    if (needs_human === 'true') { filtros.push(`conv.needs_human = true`); }
    if (telefono) {
      filtros.push(`RIGHT(conv.phone_number, 8) = $${i++}`);
      valores.push(normalizarTelefono(telefono).slice(-8));
    }

    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    const result = await pool.query(
      `
      SELECT
        conv.id, conv.phone_number, conv.contact_name, conv.current_state,
        conv.compra_id, conv.evento_id, conv.needs_human, conv.last_message_at,
        e.nombre AS evento, c.correo_comprador, c.estado AS estado_compra, c.total,
        (SELECT COUNT(*) FROM whatsapp_messages m WHERE m.conversation_id = conv.id) AS total_mensajes,
        (SELECT COUNT(*) FROM payment_receipts r WHERE r.conversation_id = conv.id) AS total_comprobantes
      FROM whatsapp_conversations conv
      LEFT JOIN eventos e ON e.id_evento = conv.evento_id
      LEFT JOIN compras_entradas c ON c.id_compra = conv.compra_id
      ${where}
      ORDER BY conv.last_message_at DESC NULLS LAST
      LIMIT 200
      `,
      valores
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error listando conversaciones WhatsApp:', error.message);
    res.status(500).json({ message: 'Error listando conversaciones' });
  }
};

// ---------- Mensajes de una conversación ----------
exports.obtenerMensajes = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT id, direction, message_type, body, media_id, status, created_at
      FROM whatsapp_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      LIMIT 500
      `,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo mensajes:', error.message);
    res.status(500).json({ message: 'Error obteniendo mensajes' });
  }
};

// ---------- Listar comprobantes (con filtros) ----------
exports.listarComprobantes = async (req, res) => {
  try {
    const { evento, estado, compra, telefono, confianza_min, pendientes } = req.query;
    const filtros = [];
    const valores = [];
    let i = 1;

    if (evento) { filtros.push(`c.id_evento = $${i++}`); valores.push(Number(evento)); }
    if (estado) { filtros.push(`r.validation_status = $${i++}`); valores.push(estado); }
    if (compra) { filtros.push(`r.compra_id = $${i++}`); valores.push(Number(compra)); }
    if (telefono) {
      filtros.push(`RIGHT(conv.phone_number, 8) = $${i++}`);
      valores.push(normalizarTelefono(telefono).slice(-8));
    }
    if (confianza_min) { filtros.push(`r.confidence_score >= $${i++}`); valores.push(Number(confianza_min)); }
    if (pendientes === 'true') {
      filtros.push(`r.validation_status IN ('NEEDS_REVIEW','POSSIBLE_DUPLICATE','OCR_PROCESSED','RECEIVED')`);
    }

    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    const result = await pool.query(
      `
      SELECT
        r.id, r.compra_id, r.conversation_id, r.file_type, r.file_name,
        r.detected_amount, r.detected_date, r.detected_time, r.detected_reference,
        r.detected_bank, r.detected_destination, r.confidence_score,
        r.validation_status, r.validation_notes, r.reviewed_by, r.reviewed_at, r.created_at,
        c.total AS monto_esperado, c.estado AS estado_compra,
        c.correo_comprador, c.telefono_comprador,
        e.id_evento, e.nombre AS evento,
        conv.phone_number, conv.contact_name
      FROM payment_receipts r
      LEFT JOIN compras_entradas c ON c.id_compra = r.compra_id
      LEFT JOIN eventos e ON e.id_evento = c.id_evento
      LEFT JOIN whatsapp_conversations conv ON conv.id = r.conversation_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT 200
      `,
      valores
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error listando comprobantes:', error.message);
    res.status(500).json({ message: 'Error listando comprobantes' });
  }
};

// ---------- Servir el binario del comprobante ----------
exports.obtenerArchivoComprobante = async (req, res) => {
  try {
    const { id } = req.params;
    const bin = await repository.obtenerBinarioComprobante(id);

    if (!bin || !bin.file_data) {
      return res.status(404).json({ message: 'Comprobante no encontrado' });
    }

    res.setHeader('Content-Type', bin.file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${bin.file_name || 'comprobante'}"`);
    return res.send(bin.file_data);
  } catch (error) {
    console.error('Error sirviendo comprobante:', error.message);
    res.status(500).json({ message: 'Error obteniendo archivo' });
  }
};

// ---------- Confirmar compra desde un comprobante ----------
exports.confirmarDesdeComprobante = async (req, res) => {
  const { id } = req.params;
  try {
    const receiptResult = await pool.query(
      `SELECT r.*, conv.phone_number
       FROM payment_receipts r
       LEFT JOIN whatsapp_conversations conv ON conv.id = r.conversation_id
       WHERE r.id = $1`,
      [id]
    );

    const receipt = receiptResult.rows[0];
    if (!receipt) return res.status(404).json({ message: 'Comprobante no encontrado' });
    if (!receipt.compra_id) {
      return res.status(400).json({ message: 'El comprobante no está asociado a una compra' });
    }

    const quienConfirma = req.user?.correo || req.user?.usuario || String(req.user?.id || 'admin');

    // Reutiliza el servicio de confirmación (QR + correo + estado PAGADA).
    const resultado = await confirmarCompraService.confirmarCompra(receipt.compra_id, {
      source: 'WHATSAPP',
      createdBy: quienConfirma
    });

    // Marca el comprobante como aprobado.
    await repository.marcarComprobanteRevisado(id, {
      validationStatus: 'APPROVED',
      reviewedBy: quienConfirma,
      notes: 'Confirmado por el administrador.'
    });

    // Envía WhatsApp de confirmación si hay conversación.
    if (receipt.conversation_id && receipt.phone_number) {
      await webhook.enviarYRegistrar(
        { id: receipt.conversation_id, phone_number: receipt.phone_number },
        templates.compraConfirmada()
      );
      await repository.actualizarConversacion(receipt.conversation_id, { current_state: 'CONFIRMADA', needs_human: false });
    }

    return res.json({ message: 'Compra confirmada correctamente', compra: resultado.compra });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({ message: error.message });
    }
    if (error.statusCode === 404) {
      return res.status(404).json({ message: error.message });
    }
    console.error('Error confirmando desde comprobante:', error.message);
    return res.status(500).json({ message: 'Error confirmando la compra' });
  }
};

// ---------- Rechazar comprobante ----------
exports.rechazarComprobante = async (req, res) => {
  const { id } = req.params;
  const { razon } = req.body || {};
  try {
    const receiptResult = await pool.query(
      `SELECT r.*, conv.phone_number
       FROM payment_receipts r
       LEFT JOIN whatsapp_conversations conv ON conv.id = r.conversation_id
       WHERE r.id = $1`,
      [id]
    );
    const receipt = receiptResult.rows[0];
    if (!receipt) return res.status(404).json({ message: 'Comprobante no encontrado' });

    const quien = req.user?.correo || req.user?.usuario || String(req.user?.id || 'admin');

    await repository.marcarComprobanteRevisado(id, {
      validationStatus: 'REJECTED',
      reviewedBy: quien,
      notes: razon || 'Rechazado por el administrador.'
    });

    if (receipt.conversation_id && receipt.phone_number) {
      await webhook.enviarYRegistrar(
        { id: receipt.conversation_id, phone_number: receipt.phone_number },
        templates.comprobanteRechazado()
      );
    }

    return res.json({ message: 'Comprobante rechazado' });
  } catch (error) {
    console.error('Error rechazando comprobante:', error.message);
    return res.status(500).json({ message: 'Error rechazando comprobante' });
  }
};

// ---------- Solicitar nuevo comprobante ----------
exports.solicitarNuevoComprobante = async (req, res) => {
  const { id } = req.params;
  try {
    const receiptResult = await pool.query(
      `SELECT r.conversation_id, conv.phone_number
       FROM payment_receipts r
       LEFT JOIN whatsapp_conversations conv ON conv.id = r.conversation_id
       WHERE r.id = $1`,
      [id]
    );
    const receipt = receiptResult.rows[0];
    if (!receipt || !receipt.phone_number) {
      return res.status(404).json({ message: 'Conversación no encontrada para este comprobante' });
    }

    await webhook.enviarYRegistrar(
      { id: receipt.conversation_id, phone_number: receipt.phone_number },
      templates.solicitarNuevoComprobante()
    );

    return res.json({ message: 'Solicitud enviada al cliente' });
  } catch (error) {
    console.error('Error solicitando nuevo comprobante:', error.message);
    return res.status(500).json({ message: 'Error enviando solicitud' });
  }
};

// ---------- Enviar mensaje manual ----------
exports.enviarMensajeManual = async (req, res) => {
  const { id } = req.params; // conversation id
  const { texto } = req.body || {};
  try {
    if (!texto || !texto.trim()) {
      return res.status(400).json({ message: 'El mensaje no puede estar vacío' });
    }

    const convResult = await pool.query(
      `SELECT id, phone_number FROM whatsapp_conversations WHERE id = $1`,
      [id]
    );
    const conv = convResult.rows[0];
    if (!conv) return res.status(404).json({ message: 'Conversación no encontrada' });

    const envio = await webhook.enviarYRegistrar(conv, texto.trim());
    if (!envio.ok) {
      return res.status(502).json({ message: 'No se pudo enviar el mensaje', detalle: envio.error });
    }

    // Un mensaje manual del admin resuelve la necesidad de atención humana.
    await repository.actualizarConversacion(id, { needs_human: false });

    return res.json({ message: 'Mensaje enviado' });
  } catch (error) {
    console.error('Error enviando mensaje manual:', error.message);
    return res.status(500).json({ message: 'Error enviando mensaje' });
  }
};
