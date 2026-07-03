const express = require('express');
const router = express.Router();

const { verificarToken, requiereAdmin } = require('../middlewares/authMiddleware');

const {
  obtenerEventos,
  obtenerTodosEventos,
  crearEvento,
  actualizarEvento,
  desactivarEvento,
  reactivarEvento,
  eliminarEvento,
  obtenerEventoPorId
} = require('../controllers/eventosController');

const {
  obtenerUbicacionPreview,
  enviarUbicacionManual,
  obtenerNotificacionesUbicacion,
  actualizarUbicacionSecreta,
  exportarCompradores
} = require('../controllers/ubicacionEventoController');

router.get('/', obtenerEventos);
router.get('/admin/todos', obtenerTodosEventos);
router.post('/', crearEvento);
router.put('/:id', actualizarEvento);
router.patch('/:id/desactivar', desactivarEvento);
router.patch('/:id/reactivar', reactivarEvento);
router.delete('/:id', eliminarEvento);

// Ubicación secreta / notificaciones de ubicación (solo admin autenticado).
router.get('/:id/ubicacion-preview', verificarToken, requiereAdmin, obtenerUbicacionPreview);
router.post('/:id/enviar-ubicacion', verificarToken, requiereAdmin, enviarUbicacionManual);
router.get('/:id/notificaciones-ubicacion', verificarToken, requiereAdmin, obtenerNotificacionesUbicacion);
router.patch('/:id/ubicacion-secreta', verificarToken, requiereAdmin, actualizarUbicacionSecreta);
router.get('/:id/exportar-compradores', verificarToken, requiereAdmin, exportarCompradores);

router.get('/:id', obtenerEventoPorId);

module.exports = router;