const express = require('express');
const router = express.Router();

const comprasEntradasController = require('../controllers/comprasEntradasController');
const cortesiaActivacionController = require('../controllers/cortesiaActivacionController');

router.post('/cortesia/validar', cortesiaActivacionController.validarCodigo);
router.post(
  '/',
  cortesiaActivacionController.protegerCortesia,
  comprasEntradasController.crearCompra
);
router.get('/pendientes', comprasEntradasController.listarPendientes);
router.get('/qr/:uuid', comprasEntradasController.obtenerQrEntrada);
router.get('/wallet/apple/:uuid', comprasEntradasController.obtenerAppleWallet);
router.get('/wallet/google/:uuid', comprasEntradasController.obtenerGoogleWallet);
router.get('/test/email', comprasEntradasController.testEmail);
router.get('/:id', comprasEntradasController.obtenerCompraPorId);
router.patch('/:id/confirmar', comprasEntradasController.confirmarCompra);
router.patch('/:id/rechazar', comprasEntradasController.rechazarCompra);
router.post('/validar-qr', comprasEntradasController.validarQr);

module.exports = router;
