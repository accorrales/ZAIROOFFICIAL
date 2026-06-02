const pool = require('../config/database');
const bcrypt = require('bcrypt');

// Obtener usuarios
const obtenerUsuarios = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id_usuario,
        nombre,
        correo,
        rol,
        estado,
        fecha_creacion
      FROM usuarios
      ORDER BY id_usuario
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
};

// Crear usuario
const crearUsuario = async (req, res) => {
  const { nombre, correo, password, rol } = req.body;

  try {
    const existe = await pool.query(
      'SELECT id_usuario FROM usuarios WHERE correo = $1',
      [correo]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({ error: 'El correo ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO usuarios
       (nombre, correo, contrasena, rol, estado)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id_usuario, nombre, correo, rol, estado, fecha_creacion`,
      [nombre, correo, passwordHash, rol]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
};

// Actualizar usuario
const actualizarUsuario = async (req, res) => {
  const { id } = req.params;
  const { nombre, correo, rol, estado } = req.body;

  try {
    const result = await pool.query(
      `UPDATE usuarios
       SET nombre = $1,
           correo = $2,
           rol = $3,
           estado = $4
       WHERE id_usuario = $5
       RETURNING id_usuario, nombre, correo, rol, estado, fecha_creacion`,
      [nombre, correo, rol, estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

// Cambiar contraseña
const cambiarPassword = async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `UPDATE usuarios
       SET contrasena = $1
       WHERE id_usuario = $2`,
      [passwordHash, id]
    );

    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
};

// Eliminar usuario
const eliminarUsuario = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `DELETE FROM usuarios
       WHERE id_usuario = $1`,
      [id]
    );

    res.json({ mensaje: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
};

module.exports = {
  obtenerUsuarios,
  crearUsuario,
  actualizarUsuario,
  cambiarPassword,
  eliminarUsuario
};