const repository = require('./whatsapp.repository');

// ============================================================
//  Motor de validación de comprobantes (revisión asistida).
//
//  Compara los datos detectados por OCR contra la compra asociada y
//  produce { validation_status, confidence_score, validation_notes }.
//
//  IMPORTANTE: NO confirma automáticamente. El objetivo es asistir al
//  admin; la decisión final es siempre un botón manual en el panel.
// ============================================================

// Tolerancia de monto (colones) y de fecha (días) configurable.
const TOLERANCIA_MONTO = Number(process.env.WHATSAPP_MONTO_TOLERANCIA) || 1;
const TOLERANCIA_DIAS = Number(process.env.WHATSAPP_FECHA_TOLERANCIA_DIAS) || 3;

const parseFechaFlexible = (valor) => {
  if (!valor) return null;
  // Soporta dd/mm/yyyy, dd-mm-yyyy, dd.mm.yy, etc.
  const m = String(valor).match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!m) {
    const d = new Date(valor);
    return isNaN(d.getTime()) ? null : d;
  }
  let [, dd, mm, yyyy] = m;
  if (yyyy.length === 2) yyyy = `20${yyyy}`;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
};

const diffDias = (a, b) => Math.abs((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));

/**
 * Valida un comprobante ya con OCR procesado.
 *
 * @param {object} receipt  Registro de payment_receipts (con detected_*).
 * @param {object} compra   Compra asociada (con total, estado, fecha_creacion).
 * @returns {Promise<{ validation_status, confidence_score, validation_notes }>}
 */
const validar = async (receipt, compra) => {
  const notas = [];
  let score = 0;

  // --- Regla: la compra debe existir y no estar ya pagada ---
  if (!compra) {
    return {
      validation_status: 'NEEDS_REVIEW',
      confidence_score: 0,
      validation_notes: 'No hay compra asociada al comprobante.'
    };
  }

  if (compra.estado === 'PAGADA') {
    return {
      validation_status: 'NEEDS_REVIEW',
      confidence_score: 0,
      validation_notes: 'La compra ya estaba marcada como PAGADA.'
    };
  }

  // --- Regla: referencia no repetida (duplicado) ---
  if (receipt.detected_reference) {
    const repetidas = await repository.contarReferenciaRepetida(receipt.detected_reference, receipt.id);
    if (repetidas > 0) {
      return {
        validation_status: 'POSSIBLE_DUPLICATE',
        confidence_score: 20,
        validation_notes: `La referencia ${receipt.detected_reference} ya fue usada en otro comprobante.`
      };
    }
  }

  // --- Legibilidad (OCR devolvió texto útil) ---
  const tieneTexto = Boolean(receipt.ocr_text && receipt.ocr_text.trim().length > 15);
  if (!tieneTexto) {
    return {
      validation_status: 'NEEDS_REVIEW',
      confidence_score: 30,
      validation_notes: 'No se pudo leer el comprobante automáticamente (OCR vacío o ilegible). Requiere revisión manual.'
    };
  }
  score += 20;

  // --- Comparación de monto ---
  const esperado = Number(compra.total);
  const detectado = receipt.detected_amount !== null ? Number(receipt.detected_amount) : null;
  let montoCoincide = false;

  if (detectado === null) {
    notas.push('No se detectó el monto en el comprobante.');
  } else if (Math.abs(detectado - esperado) <= TOLERANCIA_MONTO) {
    montoCoincide = true;
    score += 45;
  } else {
    notas.push(`Monto detectado (${detectado}) no coincide con el esperado (${esperado}).`);
  }

  // --- Comparación de fecha ---
  const fechaComprobante = parseFechaFlexible(receipt.detected_date);
  const fechaCompra = compra.fecha_creacion ? new Date(compra.fecha_creacion) : null;

  if (fechaComprobante && fechaCompra) {
    const dias = diffDias(fechaComprobante, fechaCompra);
    if (dias <= TOLERANCIA_DIAS) {
      score += 20;
    } else {
      notas.push(`La fecha del comprobante difiere ${Math.round(dias)} días de la compra.`);
      score += 5;
    }
  } else {
    notas.push('No se detectó una fecha clara en el comprobante.');
  }

  // --- Referencia detectada (aporta confianza) ---
  if (receipt.detected_reference) {
    score += 10;
  } else {
    notas.push('No se detectó número de referencia.');
  }

  // --- Banco / destino detectado ---
  if (receipt.detected_bank || receipt.detected_destination) {
    score += 5;
  }

  score = Math.max(0, Math.min(score, 99));

  // --- Decisión de estado ---
  let status;
  if (montoCoincide && score >= 90) {
    status = 'LIKELY_VALID';
    score = Math.max(score, 95);
  } else if (montoCoincide) {
    status = 'NEEDS_REVIEW';
    score = Math.max(60, Math.min(score, 80));
  } else {
    status = 'NEEDS_REVIEW';
    score = Math.min(score, 60);
  }

  return {
    validation_status: status,
    confidence_score: score,
    validation_notes: notas.length ? notas.join(' ') : 'Todos los datos principales coinciden.'
  };
};

module.exports = { validar };
