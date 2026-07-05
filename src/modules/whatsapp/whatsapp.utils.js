const crypto = require('crypto');

// ============================================================
//  Utilidades compartidas del módulo de WhatsApp.
//  Sin dependencias externas, funciones pequeñas y puras.
// ============================================================

/**
 * Normaliza un número de teléfono a solo dígitos (formato E.164 sin '+').
 * Ej: "+506 8888-8888" -> "50688888888".
 */
const normalizarTelefono = (valor) => {
  if (!valor) return '';
  return String(valor).replace(/\D+/g, '');
};

/**
 * Devuelve los últimos N dígitos de un teléfono para comparar números
 * guardados con distinto formato (local vs internacional).
 * Ej: comprar guardó "88888888", WhatsApp manda "50688888888".
 */
const ultimosDigitos = (valor, n = 8) => {
  const digitos = normalizarTelefono(valor);
  return digitos.slice(-n);
};

/**
 * Verifica la firma X-Hub-Signature-256 que envía Meta en el webhook.
 * Usa comparación en tiempo constante para evitar timing attacks.
 *
 * @param {Buffer|string} rawBody  Cuerpo crudo del request (sin parsear).
 * @param {string} signatureHeader Valor del header 'x-hub-signature-256'.
 * @param {string} appSecret       WHATSAPP_APP_SECRET.
 * @returns {boolean}
 */
const verificarFirmaMeta = (rawBody, signatureHeader, appSecret) => {
  if (!appSecret) {
    // Sin secreto configurado no se puede validar; el llamador decide.
    return false;
  }
  if (!signatureHeader || !rawBody) return false;

  const esperado =
    'sha256=' +
    crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(esperado);

  if (a.length !== b.length) return false;

  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

/**
 * Enmascara datos sensibles para logs (tokens, teléfonos).
 * Ej: "50688888888" -> "5068****888".
 */
const enmascarar = (valor) => {
  if (!valor) return '';
  const s = String(valor);
  if (s.length <= 6) return '****';
  return `${s.slice(0, 4)}****${s.slice(-3)}`;
};

/**
 * Logger con prefijo, que nunca imprime tokens. Uso interno del módulo.
 */
const log = {
  info: (...args) => console.log('[whatsapp]', ...args),
  warn: (...args) => console.warn('[whatsapp]', ...args),
  error: (...args) => console.error('[whatsapp]', ...args)
};

/**
 * Convierte de forma segura un valor a número; null si no es válido.
 */
const aNumero = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
};

module.exports = {
  normalizarTelefono,
  ultimosDigitos,
  verificarFirmaMeta,
  enmascarar,
  log,
  aNumero
};
