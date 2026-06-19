const pool = require('../config/database');
const bcrypt = require('bcrypt');

const ROLES_PERMITIDOS = ['admin', 'rrhh', 'contabilidad', 'visor', 'entrada'];

const normalizarRol = (rol) => {
  return String(rol || '').trim().toLowerCase();
};

const normalizarTexto = (valor) => {
  return String(valor || '').trim();
};

const normalizarCorreo = (correo) => {
  return String(correo || '').trim().toLowerCase();
};

const normalizarEstado = (estado) => {
  if (typeof estado === 'boolean') {
    return estado;
  }

  const valor = String(estado || '').trim().toLowerCase();

  if (['true', 'activo', 'activa', '1', 'si', 'sí'].includes(valor)) {
    return true;
  }

  if (['false', 'inactivo', 'inactiva', '0', 'no'].includes(valor)) {
    return false;
  }

  return true;
};

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
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
};

// Crear usuario
const crearUsuario = async (req, res) => {
  try {
    const nombre = normalizarTexto(req.body.nombre);
    const correo = normalizarCorreo(req.body.correo);
    const password = String(req.body.password || '');
    const rol = normalizarRol(req.body.rol);

    if (!nombre || !correo || !password || !rol) {
      return res.status(400).json({
        error: 'Nombre, correo, contraseña y rol son obligatorios'
      });
    }

    if (!ROLES_PERMITIDOS.includes(rol)) {
      return res.status(400).json({
        error: `Rol no válido. Roles permitidos: ${ROLES_PERMITIDOS.join(', ')}`
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'La contraseña debe tener al menos 6 caracteres'
      });
    }

    const existe = await pool.query(
      `
      SELECT id_usuario
      FROM usuarios
      WHERE LOWER(correo) = LOWER($1)
      `,
      [correo]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({
        error: 'El correo ya está registrado'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO usuarios
        (nombre, correo, contrasena, rol, estado)
      VALUES
        ($1, $2, $3, $4, true)
      RETURNING
        id_usuario,
        nombre,
        correo,
        rol,
        estado,
        fecha_creacion
      `,
      [nombre, correo, passwordHash, rol]
    );

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({
      error: 'Error al crear usuario'
    });
  }
};

// Actualizar usuario
const actualizarUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    const nombre = normalizarTexto(req.body.nombre);
    const correo = normalizarCorreo(req.body.correo);
    const rol = normalizarRol(req.body.rol);
    const estado = normalizarEstado(req.body.estado);

    if (!nombre || !correo || !rol) {
      return res.status(400).json({
        error: 'Nombre, correo y rol son obligatorios'
      });
    }

    if (!ROLES_PERMITIDOS.includes(rol)) {
      return res.status(400).json({
        error: `Rol no válido. Roles permitidos: ${ROLES_PERMITIDOS.join(', ')}`
      });
    }

    const correoEnUso = await pool.query(
      `
      SELECT id_usuario
      FROM usuarios
      WHERE LOWER(correo) = LOWER($1)
      AND id_usuario <> $2
      `,
      [correo, id]
    );

    if (correoEnUso.rows.length > 0) {
      return res.status(400).json({
        error: 'Ese correo ya está registrado por otro usuario'
      });
    }

    const result = await pool.query(
      `
      UPDATE usuarios
      SET nombre = $1,
          correo = $2,
          rol = $3,
          estado = $4
      WHERE id_usuario = $5
      RETURNING
        id_usuario,
        nombre,
        correo,
        rol,
        estado,
        fecha_creacion
      `,
      [nombre, correo, rol, estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({
      error: 'Error al actualizar usuario'
    });
  }
};

// Cambiar contraseña
const cambiarPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const password = String(req.body.password || '');

    if (!password) {
      return res.status(400).json({
        error: 'La contraseña es obligatoria'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'La contraseña debe tener al menos 6 caracteres'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      UPDATE usuarios
      SET contrasena = $1
      WHERE id_usuario = $2
      RETURNING id_usuario
      `,
      [passwordHash, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    res.json({
      mensaje: 'Contraseña actualizada correctamente'
    });

  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({
      error: 'Error al cambiar contraseña'
    });
  }
};

// Eliminar usuario
const eliminarUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM usuarios
      WHERE id_usuario = $1
      RETURNING id_usuario
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    res.json({
      mensaje: 'Usuario eliminado correctamente'
    });

  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({
      error: 'Error al eliminar usuario'
    });
  }
};

module.exports = {
  obtenerUsuarios,
  crearUsuario,
  actualizarUsuario,
  cambiarPassword,
  eliminarUsuario
};