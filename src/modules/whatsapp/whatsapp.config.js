const { log } = require('./whatsapp.utils');

// ============================================================
//  Configuración y estado del módulo WhatsApp.
//
//  El módulo es OPCIONAL: si faltan las variables requeridas, el
//  backend sigue funcionando normal y el módulo queda desactivado
//  (los endpoints responden de forma segura y no se envía nada).
// ============================================================

// Variables obligatorias para que el módulo esté "activo".
const VARIABLES_REQUERIDAS = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_BUSINESS_ACCOUNT_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET'
];

/**
 * Devuelve las variables requeridas que faltan (vacías o ausentes).
 */
const variablesFaltantes = () =>
  VARIABLES_REQUERIDAS.filter((clave) => {
    const valor = process.env[clave];
    return !valor || !String(valor).trim();
  });

/**
 * true si TODAS las variables requeridas están presentes.
 * Se evalúa en tiempo de ejecución (no se cachea) para no depender del
 * orden de carga de dotenv y facilitar los tests.
 */
const moduloActivo = () => variablesFaltantes().length === 0;

// Evita repetir el mismo warning en cada request.
let yaSeAdvirtio = false;

/**
 * Registra en logs el estado del módulo al arrancar (una sola vez).
 * No lanza errores: solo informa.
 */
const registrarEstado = () => {
  const faltantes = variablesFaltantes();

  if (faltantes.length === 0) {
    log.info('Módulo WhatsApp ACTIVO (todas las variables configuradas).');
    return;
  }

  if (!yaSeAdvirtio) {
    log.warn(
      'Módulo WhatsApp DESACTIVADO. El backend funciona normal, pero no se ' +
        'enviarán ni recibirán mensajes de WhatsApp. Variables faltantes: ' +
        faltantes.join(', ')
    );
    yaSeAdvirtio = true;
  }
};

module.exports = {
  VARIABLES_REQUERIDAS,
  variablesFaltantes,
  moduloActivo,
  registrarEstado
};
