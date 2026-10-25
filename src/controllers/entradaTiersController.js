const pool = require('../config/database');
const { validateTier } = require('../utils/ticketPackage');

const obtenerTiersPorEvento = async (req, res) => {
  const { id_evento } = req.params;

  try {
    const eventoResult = await pool.query(
      `SELECT estado FROM eventos WHERE id_evento = $1 LIMIT 1`,
      [id_evento]
    );

    if (eventoResult.rows.length === 0 || (!req.user && eventoResult.rows[0].estado !== true)) {
      return res.status(404).json({ error: 'Evento no disponible' });
    }

    const result = await pool.query(
      `
      SELECT
        id_tier,
        id_evento,
        nombre,
        descripcion,
        precio,
        cantidad_disponible,
        entradas_por_paquete,
        zona,
        beneficios_paquete,
        estado,
        to_char(fecha_inicio AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD"T"HH24:MI') AS fecha_inicio,
        to_char(fecha_fin    AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD"T"HH24:MI') AS fecha_fin,
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

    res.json(result.rows.map(row => {
      if (req.user?.rol?.trim().toLowerCase() === 'admin') return row;
      const { cantidad_disponible, ...publicTier } = row;
      return publicTier;
    }));
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

  let config;
  try { config = validateTier(req.body); } catch(error) { return res.status(400).json({error:error.message}); }
  try {
    const result = await pool.query(
      `INSERT INTO entrada_tiers
       (id_evento, nombre, descripcion, precio, fecha_inicio, fecha_fin, cantidad_disponible, entradas_por_paquete, estado, zona, beneficios_paquete)
       VALUES (
         $1,$2,$3,$4,
         ($5)::timestamp AT TIME ZONE 'America/Costa_Rica',
         ($6)::timestamp AT TIME ZONE 'America/Costa_Rica',
         $7,$8,$9,$10,$11
       )
       RETURNING *`,
      [
        id_evento,
        nombre,
        descripcion,
        precio,
        fecha_inicio || null,
        fecha_fin || null,
        config.stock, config.size, req.body.estado !== false, req.body.zona || 'GENERAL', (req.body.beneficios_paquete || '').trim()
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

  let config;
  try { config = validateTier(req.body); } catch(error) { return res.status(400).json({error:error.message}); }
  try {
    const result = await pool.query(
      `UPDATE entrada_tiers
       SET nombre = $1,
           descripcion = $2,
           precio = $3,
           fecha_inicio = ($4)::timestamp AT TIME ZONE 'America/Costa_Rica',
           fecha_fin = ($5)::timestamp AT TIME ZONE 'America/Costa_Rica',
           cantidad_disponible = $6,
           estado = $7,
           entradas_por_paquete = $9,
           zona = COALESCE($10, zona),
           beneficios_paquete = COALESCE($11, beneficios_paquete)
       WHERE id_tier = $8
         AND ((entradas_por_paquete = $9 AND zona = COALESCE($10, zona) AND beneficios_paquete = COALESCE($11, beneficios_paquete)) OR NOT EXISTS (SELECT 1 FROM compras_entradas WHERE id_tier = $8))
       RETURNING *`,
      [
        nombre,
        descripcion,
        precio,
        fecha_inicio || null,
        fecha_fin || null,
        config.stock,
        estado,
        id, config.size, req.body.zona ?? null, req.body.beneficios_paquete?.trim() ?? null
      ]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Tier no encontrado o el tamaño del paquete tiene compras asociadas; creá otra promoción' });
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
    // Un tier no puede eliminarse si ya tiene ventas asociadas
    // (entradas o compras), porque hay claves foráneas que apuntan a él.
    // Antes esto provocaba un error 23503 de Postgres que terminaba en 500.
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM entradas         WHERE id_tier = $1) AS entradas,
         (SELECT COUNT(*) FROM compras_entradas WHERE id_tier = $1) AS compras`,
      [id]
    );

    const totalRelacionados =
      Number(rows[0].entradas) + Number(rows[0].compras);

    if (totalRelacionados > 0) {
      return res.status(409).json({
        error:
          'No se puede eliminar el tier porque ya tiene entradas o compras asociadas. ' +
          'Desactívalo en su lugar para dejar de venderlo.'
      });
    }

    const result = await pool.query(
      `DELETE FROM entrada_tiers WHERE id_tier = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Tier no encontrado' });
    }

    res.json({ mensaje: 'Tier eliminado correctamente' });
  } catch (error) {
    console.error(error);

    // Respaldo: si aún así se viola una clave foránea, devolvemos un
    // mensaje claro (409) en lugar de un 500 genérico.
    if (error.code === '23503') {
      return res.status(409).json({
        error:
          'No se puede eliminar el tier porque tiene registros asociados. ' +
          'Desactívalo en su lugar para dejar de venderlo.'
      });
    }

    res.status(500).json({ error: 'Error al eliminar tier' });
  }
};

module.exports = {
  obtenerTiersPorEvento,
  crearTier,
  actualizarTier,
  eliminarTier
};