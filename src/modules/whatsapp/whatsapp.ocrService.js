const { log, aNumero } = require('./whatsapp.utils');

// ============================================================
//  Servicio de OCR modular.
//
//  Expone una interfaz limpia (extraerTexto) desacoplada del
//  proveedor. Por defecto usa Tesseract.js si está instalado; si no,
//  cae a un stub que devuelve texto vacío (todo pasa a NEEDS_REVIEW).
//  Enchufable a Google Vision / AWS Textract cambiando el provider.
//
//  Selección de proveedor por env: WHATSAPP_OCR_PROVIDER (tesseract|stub).
// ============================================================

// ---------- Proveedores ----------

const proveedorStub = {
  nombre: 'stub',
  async extraerTexto() {
    return { ok: true, text: '', confidence: 0 };
  }
};

const proveedorTesseract = {
  nombre: 'tesseract',
  async extraerTexto(buffer) {
    let Tesseract;
    try {
      // Carga perezosa: si el paquete no está instalado no rompe el arranque.
      Tesseract = require('tesseract.js');
    } catch {
      log.warn('tesseract.js no está instalado; usando stub OCR (revisión manual).');
      return proveedorStub.extraerTexto(buffer);
    }

    try {
      const lang = process.env.WHATSAPP_OCR_LANG || 'spa+eng';
      const { data } = await Tesseract.recognize(buffer, lang);
      return {
        ok: true,
        text: data?.text || '',
        confidence: Math.round(data?.confidence || 0)
      };
    } catch (error) {
      log.error('Error en OCR Tesseract:', error.message);
      return { ok: false, text: '', confidence: 0, error: error.message };
    }
  }
};

const seleccionarProveedor = () => {
  const nombre = (process.env.WHATSAPP_OCR_PROVIDER || 'tesseract').toLowerCase();
  if (nombre === 'stub') return proveedorStub;
  return proveedorTesseract;
};

// ---------- Extractores de datos del texto OCR ----------
//  Heurísticas para comprobantes de bancos de Costa Rica (SINPE,
//  transferencias). Todo es "best effort": lo que no se detecte queda
//  null y el motor de validación lo marca para revisión.

const BANCOS_CR = [
  'BAC', 'BAC Credomatic', 'Banco Nacional', 'BN', 'BNCR', 'Banco de Costa Rica',
  'BCR', 'Banco Popular', 'Popular', 'Scotiabank', 'Davivienda', 'Coopenae',
  'Promerica', 'Lafise', 'Mucap', 'Cathay', 'SINPE', 'SINPE Móvil'
];

const extraerMonto = (texto) => {
  if (!texto) return null;
  // Busca patrones de monto: ₡10,000 / CRC 10000 / 10.000,00 / 10,000.00
  const regex = /(?:₡|crc|colones|monto|total)[\s:]*([\d.,]+)/gi;
  const candidatos = [];
  let m;
  while ((m = regex.exec(texto)) !== null) {
    const num = normalizarNumero(m[1]);
    if (num !== null) candidatos.push(num);
  }
  if (candidatos.length === 0) {
    // Fallback: cualquier número "grande" con separadores de miles.
    const generico = texto.match(/\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?\b/g);
    if (generico) {
      for (const g of generico) {
        const num = normalizarNumero(g);
        if (num !== null) candidatos.push(num);
      }
    }
  }
  if (candidatos.length === 0) return null;
  // El monto del comprobante suele ser el mayor valor detectado.
  return Math.max(...candidatos);
};

const normalizarNumero = (raw) => {
  if (!raw) return null;
  let s = String(raw).trim();
  // Elimina separadores de miles conservando el decimal.
  if (s.includes(',') && s.includes('.')) {
    // El último separador es el decimal.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    // Coma sola: si hay exactamente 2 decimales tras la coma es decimal.
    s = /,\d{2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else {
    // Punto solo: si son miles (3 dígitos), quitarlo.
    s = /\.\d{3}(\D|$)/.test(s) ? s.replace(/\./g, '') : s;
  }
  return aNumero(s);
};

const extraerFecha = (texto) => {
  if (!texto) return null;
  const m = texto.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/);
  return m ? m[1] : null;
};

const extraerHora = (texto) => {
  if (!texto) return null;
  const m = texto.match(/\b(\d{1,2}:\d{2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?|AM|PM)?)\b/);
  return m ? m[1].trim() : null;
};

const extraerReferencia = (texto) => {
  if (!texto) return null;
  const m =
    texto.match(/(?:referencia|comprobante|documento|n[úu]mero|no\.?|ref\.?)[\s:#]*([A-Z0-9\-]{5,})/i);
  return m ? m[1] : null;
};

const extraerBanco = (texto) => {
  if (!texto) return null;
  const upper = texto.toUpperCase();
  for (const banco of BANCOS_CR) {
    if (upper.includes(banco.toUpperCase())) return banco;
  }
  return null;
};

const extraerDestino = (texto) => {
  if (!texto) return null;
  // IBAN CR, teléfono SINPE, o cuenta destino.
  const iban = texto.match(/\bCR\d{20}\b/i);
  if (iban) return iban[0].toUpperCase();
  const m = texto.match(/(?:destino|cuenta|para|beneficiario)[\s:]*([A-Z0-9\-\s]{6,40})/i);
  return m ? m[1].trim() : null;
};

const extraerDatos = (texto) => ({
  detected_amount: extraerMonto(texto),
  detected_date: extraerFecha(texto),
  detected_time: extraerHora(texto),
  detected_reference: extraerReferencia(texto),
  detected_bank: extraerBanco(texto),
  detected_destination: extraerDestino(texto),
  detected_recipient: null
});

/**
 * Procesa un comprobante: corre OCR y extrae datos estructurados.
 * @returns {Promise<{ text: string, confidence: number, datos: object, provider: string }>}
 */
const analizarComprobante = async (buffer) => {
  const proveedor = seleccionarProveedor();
  const resultado = await proveedor.extraerTexto(buffer);
  const texto = resultado.text || '';

  return {
    text: texto,
    confidence: resultado.confidence || 0,
    datos: extraerDatos(texto),
    provider: proveedor.nombre
  };
};

module.exports = {
  analizarComprobante,
  extraerDatos,
  // exportados para pruebas
  _internos: { extraerMonto, extraerFecha, extraerReferencia, extraerBanco, normalizarNumero }
};
