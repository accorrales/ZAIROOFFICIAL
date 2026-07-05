const { log, enmascarar } = require('./whatsapp.utils');

// ============================================================
//  Cliente de la WhatsApp Cloud API (Meta / Graph API).
//  Usa fetch nativo de Node (ya usado en walletService).
//  NO registra tokens en logs.
// ============================================================

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v20.0';
const GRAPH_BASE = `https://graph.facebook.com/${API_VERSION}`;

const getToken = () => process.env.WHATSAPP_ACCESS_TOKEN;
const getPhoneNumberId = () => process.env.WHATSAPP_PHONE_NUMBER_ID;

const estaConfigurado = () => Boolean(getToken() && getPhoneNumberId());

/**
 * Envía un mensaje de texto a un número por la Cloud API.
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
 */
const enviarTexto = async (to, body) => {
  if (!estaConfigurado()) {
    log.warn('WhatsApp no configurado (faltan token/phone_number_id). Mensaje no enviado a', enmascarar(to));
    return { ok: false, error: 'not_configured' };
  }

  try {
    const url = `${GRAPH_BASE}/${getPhoneNumberId()}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body }
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      log.error('Error enviando texto a', enmascarar(to), '-', data?.error?.message || response.status);
      return { ok: false, error: data?.error?.message || `HTTP ${response.status}` };
    }

    const messageId = data?.messages?.[0]?.id;
    log.info('Mensaje enviado a', enmascarar(to), '- id', messageId);
    return { ok: true, messageId };
  } catch (error) {
    log.error('Excepción enviando texto:', error.message);
    return { ok: false, error: error.message };
  }
};

/**
 * Obtiene la URL temporal de descarga de un media a partir de su id.
 */
const obtenerUrlMedia = async (mediaId) => {
  if (!estaConfigurado()) return { ok: false, error: 'not_configured' };

  try {
    const response = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.url) {
      return { ok: false, error: data?.error?.message || `HTTP ${response.status}` };
    }
    return { ok: true, url: data.url, mimeType: data.mime_type, sha256: data.sha256, fileSize: data.file_size };
  } catch (error) {
    log.error('Excepción obteniendo url media:', error.message);
    return { ok: false, error: error.message };
  }
};

/**
 * Descarga el binario de un media desde la URL temporal de Meta.
 * @returns {Promise<{ ok: boolean, buffer?: Buffer, error?: string }>}
 */
const descargarMedia = async (mediaUrl) => {
  if (!estaConfigurado()) return { ok: false, error: 'not_configured' };

  try {
    const response = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    return { ok: true, buffer: Buffer.from(arrayBuffer) };
  } catch (error) {
    log.error('Excepción descargando media:', error.message);
    return { ok: false, error: error.message };
  }
};

module.exports = {
  estaConfigurado,
  enviarTexto,
  obtenerUrlMedia,
  descargarMedia,
  API_VERSION
};
