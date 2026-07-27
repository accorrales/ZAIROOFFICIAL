const express = require('express');
const router = express.Router();

const { verificarToken, requiereAdmin } = require('../middlewares/authMiddleware');
const comprasEntradasController = require('../controllers/comprasEntradasController');
const cortesiaActivacionController = require('../controllers/cortesiaActivacionController');

// Flujos públicos necesarios para comprar y descargar una entrada mediante su UUID.
router.post('/cortesia/validar', cortesiaActivacionController.validarCodigo);
router.post(
  '/',
  cortesiaActivacionController.protegerCortesia,
  comprasEntradasController.crearCompra
);
router.get('/qr/:uuid', comprasEntradasController.obtenerQrEntrada);
router.get('/wallet/apple/:uuid', comprasEntradasController.obtenerAppleWallet);
router.get('/wallet/google/:uuid', comprasEntradasController.obtenerGoogleWallet);

// Operaciones administrativas: contienen datos personales o modifican el estado
// de compras/entradas, por lo que requieren JWT válido y rol admin.
router.get('/pendientes', verificarToken, requiereAdmin, comprasEntradasController.listarPendientes);
router.get('/:id', verificarToken, requiereAdmin, comprasEntradasController.obtenerCompraPorId);
router.patch('/:id/confirmar', verificarToken, requiereAdmin, comprasEntradasController.confirmarCompra);
router.patch('/:id/rechazar', verificarToken, requiereAdmin, comprasEntradasController.rechazarCompra);
router.post('/validar-qr', verificarToken, requiereAdmin, comprasEntradasController.validarQr);

module.exports = router;
