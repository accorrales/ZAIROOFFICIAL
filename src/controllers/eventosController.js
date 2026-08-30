const pool = require('../config/database');

// Home público: incluye eventos con venta activa y eventos publicados como teaser.
// Los teasers no exponen descripción, ubicación ni precio.
const obtenerEventos = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         id_evento,
         nombre,
         descripcion,
         fecha,
         ubicacion,
         precio,
         imagen,
         estado,
         mostrar_en_home
       FROM eventos
       WHERE estado = true
          OR mostrar_en_home = true
       ORDER BY fecha`
    );

    const eventosPublicos = result.rows.map((evento) => {
      if (evento.estado) {
        return evento;
      }

      return {
        id_evento: evento.id_evento,
        nombre: evento.nombre,
        fecha: evento.fecha,
        imagen: evento.imagen,
        estado: false,
        mostrar_en_home: true,
        modo: 'PROXIMAMENTE'
      };
    });

    res.json(eventosPublicos);
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
  const {
    nombre,
    descripcion,
    fecha,
    ubicacion,
    precio,
    imagen,
    estado = true,
    mostrar_en_home = false
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO eventos
       (nombre, descripcion, fecha, ubicacion, precio, imagen, estado, mostrar_en_home)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        nombre,
        descripcion,
        fecha,
        ubicacion,
        precio,
        imagen,
        estado !== false,
        mostrar_en_home === true
      ]
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
  const {
    nombre,
    descripcion,
    fecha,
    ubicacion,
    precio,
    imagen,
    estado,
    mostrar_en_home = false
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE eventos
       SET nombre = $1,
           descripcion = $2,
           fecha = $3,
           ubicacion = $4,
           precio = $5,
           imagen = $6,
           estado = $7,
           mostrar_en_home = $8
       WHERE id_evento = $9
       RETURNING *`,
      [
        nombre,
        descripcion,
        fecha,
        ubicacion,
        precio,
        imagen,
        estado !== false,
        mostrar_en_home === true,
        id
      ]
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
// Si el evento ya tiene compras asociadas no se borra.
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

    try {
      await client.query(
        `UPDATE codigos_descuento SET id_evento = NULL WHERE id_evento = $1`,
        [id]
      );
    } catch (e) {
      // La tabla puede no existir todavía.
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

// La página de detalle solo abre cuando el evento está activo.
// Un evento inactivo puede aparecer en el Home como teaser, sin permitir acceso.
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

    const evento = { ...result.rows[0] };

    if (!evento.estado) {
      return res.status(404).json({ error: 'Evento no disponible' });
    }

    if (!evento.ubicacion_visible_publicamente) {
      delete evento.ubicacion_secreta_nombre;
      delete evento.ubicacion_secreta_direccion;
      delete evento.ubicacion_secreta_google_maps_url;
      delete evento.ubicacion_secreta_waze_url;
      delete evento.ubicacion_envio_programado_at;
    }

    res.json(evento);
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
