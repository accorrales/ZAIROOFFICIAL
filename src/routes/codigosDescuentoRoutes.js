const express = require('express');
const router = express.Router();

const { verificarToken, requiereAdmin } = require('../middlewares/authMiddleware');

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

// Validación pública (la usa el comprador antes de pagar).
router.post('/validar', validarCodigo);

// CRUD administrativo.
router.get('/', verificarToken, requiereAdmin, listarCodigos);
router.get('/:id', verificarToken, requiereAdmin, obtenerCodigoPorId);
router.post('/', verificarToken, requiereAdmin, crearCodigo);
router.put('/:id', verificarToken, requiereAdmin, actualizarCodigo);
router.patch('/:id/desactivar', verificarToken, requiereAdmin, desactivarCodigo);
router.patch('/:id/reactivar', verificarToken, requiereAdmin, reactivarCodigo);
router.delete('/:id', verificarToken, requiereAdmin, eliminarCodigo);

module.exports = router;
