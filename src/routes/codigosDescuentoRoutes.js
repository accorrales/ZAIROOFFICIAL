const express = require('express');
const router = express.Router();

const {
  listarCodigos,
  obtenerCodigoPorId,
  crearCodigo,
  actualizarCodigo,
  eliminarCodigo,
  desactivarCodigo,
  reactivarCodigo,
  validarCodigo
} = require('../controllers/codigosDescuentoController');

// Validación pública (la usa el comprador antes de pagar)
router.post('/validar', validarCodigo);

// CRUD admin
router.get('/', listarCodigos);
router.get('/:id', obtenerCodigoPorId);
router.post('/', crearCodigo);
router.put('/:id', actualizarCodigo);
router.patch('/:id/desactivar', desactivarCodigo);
router.patch('/:id/reactivar', reactivarCodigo);
router.delete('/:id', eliminarCodigo);

module.exports = router;
