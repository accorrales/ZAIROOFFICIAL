const pool = require('../config/database');

// ============================================================
//  Dashboard de entradas confirmadas por evento (solo admin).
//  No modifica el flujo de compra/confirmación/QR existente.
// ============================================================

// Detalle de todas las entradas de compras PAGADAS de un evento,
// más los totales (entradas vendidas, dinero y desglose por tier).
const obtenerEntradasPorEvento = async (req, res) => {
  const { id_evento } = req.params;

  try {
    const entradas = await pool.query(
      `
      SELECT
        d.id_detalle,
        d.uuid_entrada,
        d.nombre_completo,
        d.fecha_nacimiento,
        d.estado,
        d.fecha_ingreso,
        c.id_compra,
        c.correo_comprador,
        c.telefono_comprador,
        c.total      AS total_compra,
        c.cantidad,
        c.fecha_creacion AS fecha_compra,
        t.id_tier,
        t.nombre     AS tier,
        t.precio
      FROM compra_entrada_detalles d
      INNER JOIN compras_entradas c ON c.id_compra = d.id_compra
      INNER JOIN entrada_tiers t    ON t.id_tier  = c.id_tier
      WHERE c.id_evento = $1
        AND c.estado = 'PAGADA'
      ORDER BY c.fecha_creacion DESC, d.id_detalle
      `,
      [id_evento]
    );

    // Dinero total: se calcula sobre las compras (no sobre los detalles)
    // para no multiplicar el total por la cantidad de personas.
    const dinero = await pool.query(
      `
      SELECT COALESCE(SUM(c.total), 0) AS total_dinero
      FROM compras_entradas c
      WHERE c.id_evento = $1
        AND c.estado = 'PAGADA'
      `,
      [id_evento]
    );

    const porTier = await pool.query(
      `
      SELECT
        t.id_tier,
        t.nombre AS tier,
        COALESCE(SUM(c.cantidad), 0) AS cantidad,
        COALESCE(SUM(c.total), 0)    AS total
      FROM compras_entradas c
      INNER JOIN entrada_tiers t ON t.id_tier = c.id_tier
      WHERE c.id_evento = $1
        AND c.estado = 'PAGADA'
      GROUP BY t.id_tier, t.nombre
      ORDER BY t.nombre
      `,
      [id_evento]
    );

    res.json({
      entradas: entradas.rows,
      totales: {
        total_entradas: entradas.rows.length,
        total_dinero: Number(dinero.rows[0].total_dinero)
      },
      por_tier: porTier.rows.map((r) => ({
        id_tier: r.id_tier,
        tier: r.tier,
        cantidad: Number(r.cantidad),
        total: Number(r.total)
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las entradas del evento' });
  }
};

// Invalidar una entrada desde el panel. Una entrada INVALIDADA no podrá
// usarse en el kiosko (validarQr ya contempla este estado).
const invalidarEntrada = async (req, res) => {
  const { id_detalle } = req.params;

  try {
    const result = await pool.query(
      `
      UPDATE compra_entrada_detalles
      SET estado = 'INVALIDADA'
      WHERE id_detalle = $1
        AND estado IN ('CONFIRMADA', 'USADA')
      RETURNING *
      `,
      [id_detalle]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: 'La entrada no existe o no se puede invalidar en su estado actual'
      });
    }

    res.json({ mensaje: 'Entrada invalidada correctamente', entrada: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al invalidar la entrada' });
  }
};

// Revertir una invalidación (volver a dejar la entrada como CONFIRMADA).
const revalidarEntrada = async (req, res) => {
  const { id_detalle } = req.params;

  try {
    const result = await pool.query(
      `
      UPDATE compra_entrada_detalles
      SET estado = 'CONFIRMADA'
      WHERE id_detalle = $1
        AND estado = 'INVALIDADA'
      RETURNING *
      `,
      [id_detalle]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: 'La entrada no existe o no está invalidada'
      });
    }

    res.json({ mensaje: 'Entrada reactivada correctamente', entrada: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al reactivar la entrada' });
  }
};

// Reporte CSV (se abre en Excel) con todas las personas que compraron.
const descargarReporteCsv = async (req, res) => {
  const { id_evento } = req.params;

  try {
    const evento = await pool.query(
      `SELECT nombre FROM eventos WHERE id_evento = $1`,
      [id_evento]
    );

    const result = await pool.query(
      `
      SELECT
        d.nombre_completo,
        c.correo_comprador,
        c.telefono_comprador,
        t.nombre   AS tier,
        t.precio,
        d.uuid_entrada,
        d.estado,
        c.fecha_creacion
      FROM compra_entrada_detalles d
      INNER JOIN compras_entradas c ON c.id_compra = d.id_compra
      INNER JOIN entrada_tiers t    ON t.id_tier  = c.id_tier
      WHERE c.id_evento = $1
        AND c.estado = 'PAGADA'
      ORDER BY c.fecha_creacion DESC, d.id_detalle
      `,
      [id_evento]
    );

    const escapar = (valor) => {
      const texto = valor === null || valor === undefined ? '' : String(valor);
      return `"${texto.replace(/"/g, '""')}"`;
    };

    const encabezados = [
      'Nombre',
      'Correo',
      'Telefono',
      'Tipo de entrada',
      'Precio',
      'UUID entrada',
      'Estado',
      'Fecha de compra'
    ];

    const lineas = [encabezados.map(escapar).join(',')];

    for (const fila of result.rows) {
      lineas.push(
        [
          fila.nombre_completo,
          fila.correo_comprador,
          fila.telefono_comprador,
          fila.tier,
          Number(fila.precio || 0),
          fila.uuid_entrada,
          fila.estado,
          fila.fecha_creacion
            ? new Date(fila.fecha_creacion).toISOString()
            : ''
        ]
          .map(escapar)
          .join(',')
      );
    }

    // BOM UTF-8 para que Excel muestre bien los acentos.
    const csv = '﻿' + lineas.join('\r\n');

    const nombreEvento = (evento.rows[0]?.nombre || 'evento')
      .replace(/[^a-z0-9]+/gi, '_')
      .toLowerCase();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="entradas_${nombreEvento}.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al generar el reporte' });
  }
};

module.exports = {
  obtenerEntradasPorEvento,
  invalidarEntrada,
  revalidarEntrada,
  descargarReporteCsv
};
