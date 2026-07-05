// ============================================================
//  Parser de mensajes entrantes de WhatsApp.
//  Extrae: código de compra, correo, teléfono y una "intención"
//  básica para el asistente por reglas. Sin dependencias externas.
// ============================================================

/**
 * Detecta un código de compra en el texto.
 * El mensaje generado desde la web incluye "Código de compra: XXX".
 * El sistema real usa id_compra (entero), así que se prioriza eso,
 * pero también se captura el token tras la etiqueta por si acaso.
 */
const detectarCodigoCompra = (texto = '') => {
  if (!texto) return null;

  // 1) Etiqueta explícita: "Código de compra: 123" / "codigo: ABC123"
  const etiqueta = texto.match(/c[óo]digo(?:\s+de\s+compra)?\s*[:#]?\s*([A-Z0-9\-]{1,20})/i);
  if (etiqueta && etiqueta[1]) {
    return etiqueta[1].trim();
  }

  // 2) "#123" suelto
  const hash = texto.match(/#\s*(\d{1,10})\b/);
  if (hash && hash[1]) return hash[1];

  return null;
};

const detectarCorreo = (texto = '') => {
  const m = texto.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
};

const detectarTelefono = (texto = '') => {
  // Busca una etiqueta "Teléfono: 8888-8888" o un número de 8+ dígitos.
  const etiqueta = texto.match(/tel[ée]fono\s*[:#]?\s*([\d\s\-+()]{8,})/i);
  if (etiqueta && etiqueta[1]) return etiqueta[1].replace(/\D+/g, '');
  return null;
};

// Palabras clave -> intención, para el asistente por reglas.
const INTENCIONES = [
  { intent: 'PRECIO', re: /(cu[áa]nto\s+(vale|cuesta)|precio|valor)\b/i },
  { intent: 'DISPONIBILIDAD', re: /(quedan|hay|disponib|agotad|sold\s*out)\b/i },
  { intent: 'UBICACION', re: /(d[óo]nde|ubicaci[óo]n|lugar|direcci[óo]n|c[óo]mo llego)\b/i },
  { intent: 'ESTADO', re: /(mi\s+estado|estado\s+de\s+mi|ya\s+pagu[ée]|confirmar\s+mi|c[óo]mo\s+va)\b/i },
  { intent: 'NO_LLEGO_CORREO', re: /(no\s+me\s+lleg[óo]|no\s+recib[íi]|sin\s+correo|no\s+aparece)\b/i },
  { intent: 'COMPRAR', re: /(quiero\s+comprar|comprar|adquirir|reservar)\b/i },
  { intent: 'SALUDO', re: /^\s*(hola|buenas|buenos d[íi]as|buenas tardes|buenas noches|hey|hi)\b/i }
];

const detectarIntencion = (texto = '') => {
  for (const { intent, re } of INTENCIONES) {
    if (re.test(texto)) return intent;
  }
  return 'DESCONOCIDA';
};

/**
 * Parsea un mensaje de texto entrante y devuelve la información útil.
 */
const parsearTexto = (texto = '') => ({
  codigo: detectarCodigoCompra(texto),
  correo: detectarCorreo(texto),
  telefono: detectarTelefono(texto),
  intencion: detectarIntencion(texto),
  textoOriginal: texto
});

module.exports = {
  parsearTexto,
  detectarCodigoCompra,
  detectarCorreo,
  detectarTelefono,
  detectarIntencion
};
