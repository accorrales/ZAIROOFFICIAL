const pool = require('../config/database');

const { publicEvent } = require('../utils/eventContent');
const obtenerEventos = async (req, res) => {
  try {
    const {rows}=await pool.query("SELECT * FROM eventos WHERE publicacion <> 'BORRADOR' AND mostrar_en_home=true ORDER BY destacado DESC, fecha");
    res.json(rows.map(row=>publicEvent(row)));
  } catch { res.status(500).json({error:'Error al obtener eventos'}); }
};

// Obtener todos los eventos para admin
const obtenerTodosEventos = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM eventos
       ORDER BY fecha DESC`
    );

    // Accounting keeps its existing event catalogue access, without editorial drafts
    // or private location settings. Only administrators receive the complete row.
    if (req.user?.rol?.trim().toLowerCase() === 'admin') return res.json(result.rows);
    const fields=['id_evento','nombre','fecha','precio','imagen','estado','mostrar_en_home','publicacion','ventas_abiertas','destacado'];
    res.json(result.rows.map(row=>Object.fromEntries(fields.map(key=>[key,row[key]]))));
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
    estado = false,
    mostrar_en_home = false
  } = req.body;

  if(typeof nombre!=='string'||!nombre.trim()||nombre.length>180||!Number.isFinite(Date.parse(fecha)))return res.status(400).json({error:'Nombre y fecha válidos son obligatorios'});
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
        false,
        false
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear evento' });
  }
};

// Legacy metadata editor saves only draft metadata after the editorial migration.
const actualizarEvento = async (req,res) => {
 const fields=['nombre','descripcion','fecha','ubicacion','precio','imagen'];
 const draft=Object.fromEntries(fields.filter(k=>req.body[k]!==undefined).map(k=>[k,req.body[k]]));
 if(typeof draft.nombre!=='string'||!draft.nombre.trim()||!Number.isFinite(Date.parse(draft.fecha)))return res.status(400).json({error:'Nombre y fecha válidos son obligatorios'});
 try {
  const result=await pool.query("UPDATE eventos SET contenido_borrador=contenido_borrador || $1::jsonb, revision_editorial=revision_editorial+1 WHERE id_evento=$2 RETURNING *",[JSON.stringify(draft),req.params.id]);
  if(!result.rows.length)return res.status(404).json({error:'Evento no encontrado'});
  res.json(result.rows[0]);
 }catch {res.status(500).json({error:'Error al guardar borrador'});}
};

// Desactivar evento
const desactivarEvento = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE eventos
       SET estado = false, ventas_abiertas = false, revision_editorial=revision_editorial+1
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
       SET estado = true, ventas_abiertas = true, revision_editorial=revision_editorial+1
       WHERE id_evento = $1 AND publicacion='PUBLICADO'
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

const obtenerEventoPorId = async (req,res) => {
 try {
  const row=(await pool.query('SELECT * FROM eventos WHERE id_evento=$1',[req.params.id])).rows[0];
  if(!row || row.publicacion!=='PUBLICADO') return res.status(404).json({error:'Evento no disponible'});
  res.json(publicEvent(row,true));
 }catch {res.status(500).json({error:'Error al obtener evento'});}
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
