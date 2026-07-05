const crypto = require('crypto');

const whatsappService = require('./whatsapp.service');
const repository = require('./whatsapp.repository');
const { log } = require('./whatsapp.utils');

// ============================================================
//  Descarga y persistencia de comprobantes (media de WhatsApp).
//  Guarda el binario en Postgres (bytea) para no depender del
//  disco efímero de Railway. Valida tipo y tamaño de archivo.
// ============================================================

const MAX_BYTES = Number(process.env.WHATSAPP_MEDIA_MAX_BYTES) || 8 * 1024 * 1024; // 8 MB

const TIPOS_PERMITIDOS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]);

/**
 * Descarga un media de WhatsApp por su id, valida y crea el registro
 * en payment_receipts asociado a la conversación y (si se conoce) a la compra.
 *
 * @returns {Promise<{ ok: boolean, receipt?: object, error?: string }>}
 */
const procesarComprobante = async ({ mediaId, conversationId, compraId, whatsappMessageId, mimeTypeHint, fileName }) => {
  const meta = await whatsappService.obtenerUrlMedia(mediaId);
  if (!meta.ok) {
    log.error('No se pudo obtener url del media', mediaId, '-', meta.error);
    return { ok: false, error: meta.error };
  }

  const mimeType = meta.mimeType || mimeTypeHint || 'application/octet-stream';

  if (!TIPOS_PERMITIDOS.has(mimeType)) {
    log.warn('Tipo de comprobante no permitido:', mimeType);
    return { ok: false, error: `unsupported_type:${mimeType}` };
  }

  if (meta.fileSize && Number(meta.fileSize) > MAX_BYTES) {
    log.warn('Comprobante excede el tamaño máximo:', meta.fileSize);
    return { ok: false, error: 'file_too_large' };
  }

  const descarga = await whatsappService.descargarMedia(meta.url);
  if (!descarga.ok) {
    log.error('No se pudo descargar el media', mediaId, '-', descarga.error);
    return { ok: false, error: descarga.error };
  }

  const buffer = descarga.buffer;

  if (buffer.length > MAX_BYTES) {
    log.warn('Comprobante descargado excede el tamaño máximo:', buffer.length);
    return { ok: false, error: 'file_too_large' };
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const receipt = await repository.crearComprobante({
    compraId,
    conversationId,
    whatsappMessageId,
    fileData: buffer,
    fileType: mimeType,
    fileName: fileName || `comprobante-${mediaId}`,
    fileSize: buffer.length,
    fileSha256: sha256,
    validationStatus: 'RECEIVED'
  });

  return { ok: true, receipt, buffer, mimeType };
};

module.exports = {
  procesarComprobante,
  TIPOS_PERMITIDOS,
  MAX_BYTES
};
