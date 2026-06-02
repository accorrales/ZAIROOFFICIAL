const express = require('express');
const router = express.Router();

const {
  obtenerUsuarios,
  crearUsuario,
  actualizarUsuario,
  cambiarPassword,
  eliminarUsuario
} = require('../controllers/usuariosController');

router.get('/', obtenerUsuarios);
router.post('/', crearUsuario);
router.put('/:id', actualizarUsuario);
router.put('/:id/password', cambiarPassword);
router.delete('/:id', eliminarUsuario);

module.exports = router;