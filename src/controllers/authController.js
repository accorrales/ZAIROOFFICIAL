const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  try {
    const { correo, password } = req.body;

    const result = await pool.query(
      'SELECT * FROM usuarios WHERE correo = $1',
      [correo]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(password, user.contrasena);

    if (!validPassword) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    if (!user.estado) {
      return res.status(403).json({ message: 'Usuario inactivo' });
    }

    const token = jwt.sign(
      {
        id: user.id_usuario,
        rol: user.rol,
        correo: user.correo
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        nombre: user.nombre,
        correo: user.correo,
        rol: user.rol
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en login' });
  }
};