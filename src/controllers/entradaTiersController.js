const pool = require('../config/database');

const obtenerTiersPorEvento = async (req, res) => {
  const { id_evento } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT 
        *,
        CASE
          WHEN estado = false THEN 'DESACTIVADO'
          WHEN cantidad_disponible IS NOT NULL AND cantidad_disponible <= 0 THEN 'AGOTADO'
          WHEN fecha_inicio IS NOT NULL AND NOW() < fecha_inicio THEN 'PROXIMAMENTE'
          WHEN fecha_fin IS NOT NULL AND NOW() > fecha_fin THEN 'CERRADO'
          ELSE 'DISPONIBLE'
        END AS disponibilidad
      FROM entrada_tiers
      WHERE id_evento = $1
      ORDER BY fecha_inicio ASC, precio ASC
      `,
      [id_evento]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener tiers' });
  }
};

const crearTier = async (req, res) => {
  const {
    id_evento,
    nombre,
    descripcion,
    precio,
    fecha_inicio,
    fecha_fin,
    cantidad_disponible
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO entrada_tiers
       (id_evento, nombre, descripcion, precio, fecha_inicio, fecha_fin, cantidad_disponible)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        id_evento,
        nombre,
        descripcion,
        precio,
        fecha_inicio || null,
        fecha_fin || null,
        cantidad_disponible || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear tier' });
  }
};

const actualizarTier = async (req, res) => {
  const { id } = req.params;

  const {
    nombre,
    descripcion,
    precio,
    fecha_inicio,
    fecha_fin,
    cantidad_disponible,
    estado
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE entrada_tiers
       SET nombre = $1,
           descripcion = $2,
           precio = $3,
           fecha_inicio = $4,
           fecha_fin = $5,
           cantidad_disponible = $6,
           estado = $7
       WHERE id_tier = $8
       RETURNING *`,
      [
        nombre,
        descripcion,
        precio,
        fecha_inicio || null,
        fecha_fin || null,
        cantidad_disponible,
        estado,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tier no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar tier' });
  }
};

const eliminarTier = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `DELETE FROM entrada_tiers WHERE id_tier = $1`,
      [id]
    );

    res.json({ mensaje: 'Tier eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar tier' });
  }
};

module.exports = {
  obtenerTiersPorEvento,
  crearTier,
  actualizarTier,
  eliminarTier
};