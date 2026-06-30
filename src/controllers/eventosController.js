const pool = require('../config/database');

// Obtener eventos activos
const obtenerEventos = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM eventos
       WHERE estado = true
       ORDER BY fecha`
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
};

// Obtener todos los eventos para admin
const obtenerTodosEventos = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM eventos
       ORDER BY fecha DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener todos los eventos' });
  }
};

// Crear evento
const crearEvento = async (req, res) => {
  const { nombre, descripcion, fecha, ubicacion, precio, imagen } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO eventos
       (nombre, descripcion, fecha, ubicacion, precio, imagen)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [nombre, descripcion, fecha, ubicacion, precio, imagen]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear evento' });
  }
};

// Actualizar evento
const actualizarEvento = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, fecha, ubicacion, precio, imagen, estado } = req.body;

  try {
    const result = await pool.query(
      `UPDATE eventos
       SET nombre = $1,
           descripcion = $2,
           fecha = $3,
           ubicacion = $4,
           precio = $5,
           imagen = $6,
           estado = $7
       WHERE id_evento = $8
       RETURNING *`,
      [nombre, descripcion, fecha, ubicacion, precio, imagen, estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar evento' });
  }
};

// Desactivar evento
const desactivarEvento = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE eventos
       SET estado = false
       WHERE id_evento = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    res.json({
      mensaje: 'Evento desactivado correctamente',
      evento: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al desactivar evento' });
  }
};

// Reactivar evento
const reactivarEvento = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE eventos
       SET estado = true
       WHERE id_evento = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    res.json({
      mensaje: 'Evento reactivado correctamente',
      evento: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al reactivar evento' });
  }
};

// Eliminar evento por completo.
// Política segura: si el evento ya tiene compras asociadas NO se borra
// (se devuelve 409 para que el admin lo desactive/archive en su lugar).
// Si no tiene compras, se eliminan sus tiers y el evento dentro de una
// transacción, respetando las llaves foráneas.
const eliminarEvento = async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();

  try {
    const eventoResult = await client.query(
      `SELECT id_evento, nombre FROM eventos WHERE id_evento = $1`,
      [id]
    );

    if (eventoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    const compras = await client.query(
      `SELECT COUNT(*) AS total FROM compras_entradas WHERE id_evento = $1`,
      [id]
    );

    if (Number(compras.rows[0].total) > 0) {
      return res.status(409).json({
        error:
          'Este evento ya tiene compras asociadas y no se puede eliminar. Desactivalo para archivarlo sin perder el historial de ventas.'
      });
    }

    await client.query('BEGIN');

    // Quitar la referencia de códigos de descuento que apunten al evento.
    // La tabla puede no existir si no se aplicó esa migración, por eso es tolerante.
    try {
      await client.query(
        `UPDATE codigos_descuento SET id_evento = NULL WHERE id_evento = $1`,
        [id]
      );
    } catch (e) {
      // codigos_descuento todavía no existe: se ignora.
    }

    await client.query(`DELETE FROM entrada_tiers WHERE id_evento = $1`, [id]);
    await client.query(`DELETE FROM eventos WHERE id_evento = $1`, [id]);

    await client.query('COMMIT');

    res.json({ mensaje: 'Evento eliminado correctamente' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar el evento' });
  } finally {
    client.release();
  }
};

const obtenerEventoPorId = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT *
       FROM eventos
       WHERE id_evento = $1
       LIMIT 1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener evento' });
  }
};

module.exports = {
  obtenerEventos,
  obtenerTodosEventos,
  crearEvento,
  actualizarEvento,
  desactivarEvento,
  reactivarEvento,
  eliminarEvento,
  obtenerEventoPorId
};