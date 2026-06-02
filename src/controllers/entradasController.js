const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { enviarEntradaPorCorreo } = require('../services/emailService');

// Crear entrada pendiente
const crearEntrada = async (req, res) => {
  const {
    id_evento,
    id_tier,
    id_usuario,
    nombre_comprador,
    correo_comprador
  } = req.body;

  try {
    if (!id_evento || !id_tier) {
      return res.status(400).json({
        error: 'El evento y el tipo de entrada son obligatorios'
      });
    }

    const tierResult = await pool.query(
      `
      SELECT *
      FROM entrada_tiers
      WHERE id_tier = $1
        AND id_evento = $2
        AND estado = true
        AND (fecha_inicio IS NULL OR NOW() >= fecha_inicio)
        AND (fecha_fin IS NULL OR NOW() <= fecha_fin)
        AND (cantidad_disponible IS NULL OR cantidad_disponible > 0)
      `,
      [id_tier, id_evento]
    );

    if (tierResult.rows.length === 0) {
      return res.status(400).json({
        error: 'Este tipo de entrada no está disponible en este momento'
      });
    }

    const tier = tierResult.rows[0];
    const codigo_qr = `ZAIRO-${uuidv4()}`;

    const result = await pool.query(
      `INSERT INTO entradas
       (id_evento, id_tier, id_usuario, nombre_comprador, correo_comprador, codigo_qr, precio_pagado)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        id_evento,
        id_tier,
        id_usuario || null,
        nombre_comprador || null,
        correo_comprador || null,
        codigo_qr,
        tier.precio
      ]
    );

    await pool.query(
      `
      UPDATE entrada_tiers
      SET cantidad_disponible = cantidad_disponible - 1
      WHERE id_tier = $1
        AND cantidad_disponible IS NOT NULL
      `,
      [id_tier]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear entrada' });
  }
};

// Confirmar entrada y enviar correo
const confirmarEntrada = async (req, res) => {
  const { id } = req.params;

  try {
    const entradaResult = await pool.query(
      `
      SELECT 
        e.id_entrada,
        e.codigo_qr,
        e.estado,
        e.correo_comprador,
        e.nombre_comprador,
        e.precio_pagado,
        ev.nombre AS nombre_evento,
        ev.fecha AS fecha_evento,
        t.nombre AS nombre_tier
      FROM entradas e
      INNER JOIN eventos ev ON e.id_evento = ev.id_evento
      LEFT JOIN entrada_tiers t ON e.id_tier = t.id_tier
      WHERE e.id_entrada = $1
      `,
      [id]
    );

    if (entradaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entrada no encontrada' });
    }

    const entrada = entradaResult.rows[0];

    if (entrada.estado === 'CONFIRMADA') {
      return res.status(400).json({ error: 'La entrada ya está confirmada' });
    }

    if (entrada.estado === 'USADA') {
      return res.status(400).json({ error: 'La entrada ya fue utilizada' });
    }

    if (!entrada.correo_comprador) {
      return res.status(400).json({
        error: 'La entrada no tiene correo asociado'
      });
    }

    await pool.query(
      `UPDATE entradas
       SET estado = 'CONFIRMADA'
       WHERE id_entrada = $1`,
      [id]
    );

    const qrBase64 = await QRCode.toDataURL(entrada.codigo_qr);

    await enviarEntradaPorCorreo({
      para: entrada.correo_comprador,
      nombreEvento: entrada.nombre_evento,
      fechaEvento: new Date(entrada.fecha_evento).toLocaleString('es-CR'),
      codigoQR: entrada.codigo_qr,
      qrBase64
    });

    res.json({
      mensaje: 'Entrada confirmada y enviada por correo correctamente'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al confirmar entrada' });
  }
};

module.exports = {
  crearEntrada,
  confirmarEntrada
};