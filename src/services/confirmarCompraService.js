const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const emailService = require('./emailService');
const walletService = require('./walletService');

// ============================================================
//  Servicio de confirmación de compra (fuente única de verdad).
//
//  Extrae la lógica que antes vivía dentro de
//  comprasEntradasController.confirmarCompra para que pueda ser
//  reutilizada por:
//    - el botón "Confirmar" del panel de compras (flujo existente),
//    - la confirmación desde el módulo de WhatsApp/comprobantes.
//
//  El comportamiento observable NO cambia: mismos QR, mismo correo,
//  mismo cambio de estado a 'PAGADA'. Se añade, de forma aditiva, el
//  registro en purchase_status_history (si la tabla existe).
// ============================================================

/**
 * Registra un cambio de estado de compra en el historial.
 * Es "best effort": si la tabla aún no existe (migración no corrida)
 * no rompe la confirmación.
 */
const registrarHistorial = async (client, { idCompra, oldStatus, newStatus, reason, source, createdBy }) => {
  try {
    await client.query(
      `
      INSERT INTO purchase_status_history
        (compra_id, old_status, new_status, reason, source, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [idCompra, oldStatus || null, newStatus, reason || null, source || 'SYSTEM', createdBy || null]
    );
  } catch (error) {
    console.warn('purchase_status_history no disponible o falló el insert:', error.message);
  }
};

/**
 * Confirma una compra: genera QR por entrada, envía el correo con las
 * entradas y marca la compra como PAGADA.
 *
 * @param {number|string} idCompra
 * @param {object} [opts]
 * @param {string} [opts.source]     Origen de la acción (PANEL, WHATSAPP, ...).
 * @param {string|number} [opts.createdBy] Identificador de quien confirma.
 * @returns {Promise<{ compra: object, personas: object[], yaConfirmada: boolean }>}
 * @throws {Error} con statusCode 404 si no existe, 409 si ya estaba pagada.
 */
const confirmarCompra = async (idCompra, opts = {}) => {
  const { source = 'PANEL', createdBy = null } = opts;

  const compraResult = await pool.query(
    `
    SELECT
      c.*,
      e.nombre AS evento,
      e.fecha AS fecha_evento,
      e.ubicacion AS ubicacion_evento,
      e.imagen AS imagen_evento,
      t.nombre AS entrada,
      t.precio AS precio_entrada
    FROM compras_entradas c
    INNER JOIN eventos e ON e.id_evento = c.id_evento
    INNER JOIN entrada_tiers t ON t.id_tier = c.id_tier
    WHERE c.id_compra = $1
    `,
    [idCompra]
  );

  if (compraResult.rows.length === 0) {
    const err = new Error('Compra no encontrada');
    err.statusCode = 404;
    throw err;
  }

  const compra = compraResult.rows[0];

  if (compra.estado === 'PAGADA') {
    const err = new Error('Esta compra ya fue confirmada');
    err.statusCode = 409;
    err.yaConfirmada = true;
    throw err;
  }

  const personasResult = await pool.query(
    `
    SELECT *
    FROM compra_entrada_detalles
    WHERE id_compra = $1
    ORDER BY id_detalle
    `,
    [idCompra]
  );

  const personasConQr = [];

  for (const persona of personasResult.rows) {
    const uuidEntrada = persona.uuid_entrada || uuidv4();
    const qrData = walletService.getTicketUrl(uuidEntrada);
    const bebidaCortesia = persona.bebida_cortesia || compra.bebida_cortesia || null;

    await pool.query(
      `
      UPDATE compra_entrada_detalles
      SET
        uuid_entrada = $1,
        qr_data = $2,
        estado = 'CONFIRMADA',
        bebida_cortesia = $3
      WHERE id_detalle = $4
      `,
      [uuidEntrada, qrData, bebidaCortesia, persona.id_detalle]
    );

    const entradaWallet = {
      ...persona,
      uuid_entrada: uuidEntrada,
      qr_data: qrData,
      bebida_cortesia: bebidaCortesia,
      id_evento: compra.id_evento,
      evento: compra.evento,
      fecha_evento: compra.fecha_evento,
      ubicacion_evento: compra.ubicacion_evento,
      imagen_evento: compra.imagen_evento,
      entrada: compra.entrada,
      precio: compra.precio_entrada,
      estado: 'CONFIRMADA'
    };

    const googleWalletUrl = await walletService.generarGoogleWalletUrl(entradaWallet);

    personasConQr.push({
      nombre_completo: persona.nombre_completo,
      bebida_cortesia: bebidaCortesia,
      qr_url: walletService.getQrUrl(uuidEntrada),
      ticket_url: walletService.getTicketUrl(uuidEntrada),
      apple_wallet_url: walletService.getAppleWalletUrl(uuidEntrada),
      google_wallet_url: googleWalletUrl
    });
  }

  await emailService.enviarEntradas({
    correo: compra.correo_comprador,
    evento: compra.evento,
    entrada: compra.entrada,
    personas: personasConQr
  });

  const updateCompra = await pool.query(
    `
    UPDATE compras_entradas
    SET estado = 'PAGADA'
    WHERE id_compra = $1
    RETURNING *
    `,
    [idCompra]
  );

  await registrarHistorial(pool, {
    idCompra,
    oldStatus: compra.estado,
    newStatus: 'PAGADA',
    reason: 'Compra confirmada',
    source,
    createdBy
  });

  return {
    compra: updateCompra.rows[0],
    personas: personasConQr,
    yaConfirmada: false
  };
};

module.exports = {
  confirmarCompra,
  registrarHistorial
};
