const pool = require('../../config/database');
const { normalizarTelefono, ultimosDigitos } = require('./whatsapp.utils');

// ============================================================
//  Capa de acceso a datos del módulo WhatsApp.
//  Todas las queries son parametrizadas (anti SQL injection).
//  No contiene lógica de negocio; solo lee/escribe.
// ============================================================

// ---------- Conversaciones ----------

const obtenerOCrearConversacion = async (phoneNumber, contactName) => {
  const phone = normalizarTelefono(phoneNumber);

  const existente = await pool.query(
    `SELECT * FROM whatsapp_conversations WHERE phone_number = $1`,
    [phone]
  );

  if (existente.rows.length > 0) {
    const conv = existente.rows[0];
    // Actualiza nombre y last_message_at sin pisar el estado actual.
    const actualizada = await pool.query(
      `
      UPDATE whatsapp_conversations
      SET contact_name = COALESCE($2, contact_name),
          last_message_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [conv.id, contactName || null]
    );
    return actualizada.rows[0];
  }

  const creada = await pool.query(
    `
    INSERT INTO whatsapp_conversations
      (phone_number, contact_name, current_state, last_message_at)
    VALUES ($1, $2, 'NEW', NOW())
    RETURNING *
    `,
    [phone, contactName || null]
  );
  return creada.rows[0];
};

const actualizarConversacion = async (id, campos = {}) => {
  const permitidos = ['current_state', 'compra_id', 'evento_id', 'needs_human', 'contact_name'];
  const sets = [];
  const valores = [];
  let i = 1;

  for (const key of permitidos) {
    if (Object.prototype.hasOwnProperty.call(campos, key)) {
      sets.push(`${key} = $${i++}`);
      valores.push(campos[key]);
    }
  }

  if (sets.length === 0) return null;

  valores.push(id);
  const result = await pool.query(
    `UPDATE whatsapp_conversations
     SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${i}
     RETURNING *`,
    valores
  );
  return result.rows[0] || null;
};

// ---------- Mensajes ----------

const guardarMensaje = async ({
  conversationId,
  whatsappMessageId,
  direction,
  messageType,
  body,
  mediaId,
  mediaUrl,
  status,
  rawPayload
}) => {
  const result = await pool.query(
    `
    INSERT INTO whatsapp_messages
      (conversation_id, whatsapp_message_id, direction, message_type,
       body, media_id, media_url, status, raw_payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
    `,
    [
      conversationId,
      whatsappMessageId || null,
      direction,
      messageType,
      body || null,
      mediaId || null,
      mediaUrl || null,
      status || null,
      rawPayload ? JSON.stringify(rawPayload) : null
    ]
  );
  return result.rows[0];
};

const existeMensajeEntrante = async (whatsappMessageId) => {
  if (!whatsappMessageId) return false;
  const result = await pool.query(
    `SELECT 1 FROM whatsapp_messages
     WHERE whatsapp_message_id = $1 AND direction = 'INBOUND' LIMIT 1`,
    [whatsappMessageId]
  );
  return result.rows.length > 0;
};

const actualizarStatusMensaje = async (whatsappMessageId, status) => {
  await pool.query(
    `UPDATE whatsapp_messages SET status = $2 WHERE whatsapp_message_id = $1`,
    [whatsappMessageId, status]
  );
};

// ---------- Compras (lookup para asociar la conversación) ----------

/**
 * Busca una compra por "código". El sistema real usa id_compra (entero),
 * así que si el código es numérico se busca por id. Devuelve datos
 * enriquecidos con evento y tier.
 */
const buscarCompraPorCodigo = async (codigo) => {
  const limpio = String(codigo || '').trim();
  if (!/^\d+$/.test(limpio)) return null;

  const result = await pool.query(
    `
    SELECT c.*, e.nombre AS evento, t.nombre AS entrada, t.precio
    FROM compras_entradas c
    INNER JOIN eventos e ON e.id_evento = c.id_evento
    INNER JOIN entrada_tiers t ON t.id_tier = c.id_tier
    WHERE c.id_compra = $1
    `,
    [Number(limpio)]
  );
  return result.rows[0] || null;
};

/**
 * Busca la compra pendiente/reciente más probable para un teléfono,
 * comparando los últimos 8 dígitos (tolerante a formatos).
 */
const buscarCompraPorTelefono = async (telefono) => {
  const sufijo = ultimosDigitos(telefono, 8);
  if (!sufijo) return null;

  const result = await pool.query(
    `
    SELECT c.*, e.nombre AS evento, t.nombre AS entrada, t.precio
    FROM compras_entradas c
    INNER JOIN eventos e ON e.id_evento = c.id_evento
    INNER JOIN entrada_tiers t ON t.id_tier = c.id_tier
    WHERE RIGHT(regexp_replace(c.telefono_comprador, '\\D', '', 'g'), 8) = $1
    ORDER BY
      CASE c.estado WHEN 'PENDIENTE' THEN 0 ELSE 1 END,
      c.fecha_creacion DESC
    LIMIT 1
    `,
    [sufijo]
  );
  return result.rows[0] || null;
};

/**
 * Busca una compra por correo (fallback de matching).
 */
const buscarCompraPorCorreo = async (correo) => {
  const limpio = String(correo || '').trim().toLowerCase();
  if (!limpio) return null;

  const result = await pool.query(
    `
    SELECT c.*, e.nombre AS evento, t.nombre AS entrada, t.precio
    FROM compras_entradas c
    INNER JOIN eventos e ON e.id_evento = c.id_evento
    INNER JOIN entrada_tiers t ON t.id_tier = c.id_tier
    WHERE LOWER(c.correo_comprador) = $1
    ORDER BY
      CASE c.estado WHEN 'PENDIENTE' THEN 0 ELSE 1 END,
      c.fecha_creacion DESC
    LIMIT 1
    `,
    [limpio]
  );
  return result.rows[0] || null;
};

// ---------- Comprobantes ----------

const crearComprobante = async (datos) => {
  const {
    compraId, conversationId, whatsappMessageId,
    fileData, fileType, fileName, fileSize, fileSha256,
    validationStatus
  } = datos;

  const result = await pool.query(
    `
    INSERT INTO payment_receipts
      (compra_id, conversation_id, whatsapp_message_id,
       file_data, file_type, file_name, file_size, file_sha256, validation_status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id, compra_id, conversation_id, whatsapp_message_id,
              file_type, file_name, file_size, file_sha256, validation_status, created_at
    `,
    [
      compraId || null,
      conversationId || null,
      whatsappMessageId || null,
      fileData || null,
      fileType || null,
      fileName || null,
      fileSize || null,
      fileSha256 || null,
      validationStatus || 'RECEIVED'
    ]
  );
  return result.rows[0];
};

const actualizarComprobanteOcr = async (id, campos = {}) => {
  const permitidos = [
    'ocr_text', 'detected_amount', 'detected_date', 'detected_time',
    'detected_reference', 'detected_bank', 'detected_destination',
    'detected_recipient', 'confidence_score', 'validation_status', 'validation_notes'
  ];
  const sets = [];
  const valores = [];
  let i = 1;

  for (const key of permitidos) {
    if (Object.prototype.hasOwnProperty.call(campos, key)) {
      sets.push(`${key} = $${i++}`);
      valores.push(campos[key]);
    }
  }
  if (sets.length === 0) return null;

  valores.push(id);
  const result = await pool.query(
    `UPDATE payment_receipts SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    valores
  );
  return result.rows[0] || null;
};

const marcarComprobanteRevisado = async (id, { validationStatus, reviewedBy, notes }) => {
  const result = await pool.query(
    `
    UPDATE payment_receipts
    SET validation_status = $2,
        reviewed_by = $3,
        reviewed_at = NOW(),
        validation_notes = COALESCE($4, validation_notes)
    WHERE id = $1
    RETURNING *
    `,
    [id, validationStatus, reviewedBy || null, notes || null]
  );
  return result.rows[0] || null;
};

/**
 * Cuenta comprobantes previos con la misma referencia detectada
 * (para detección de duplicados). Excluye el propio comprobante.
 */
const contarReferenciaRepetida = async (referencia, excluirId) => {
  if (!referencia) return 0;
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n FROM payment_receipts
     WHERE detected_reference = $1 AND id <> $2`,
    [referencia, excluirId || 0]
  );
  return result.rows[0].n;
};

const obtenerBinarioComprobante = async (id) => {
  const result = await pool.query(
    `SELECT file_data, file_type, file_name FROM payment_receipts WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = {
  obtenerOCrearConversacion,
  actualizarConversacion,
  guardarMensaje,
  existeMensajeEntrante,
  actualizarStatusMensaje,
  buscarCompraPorCodigo,
  buscarCompraPorTelefono,
  buscarCompraPorCorreo,
  crearComprobante,
  actualizarComprobanteOcr,
  marcarComprobanteRevisado,
  contarReferenciaRepetida,
  obtenerBinarioComprobante
};
