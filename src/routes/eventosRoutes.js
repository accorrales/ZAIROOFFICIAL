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

// Público: listado y detalle sanitizados por el controller.
router.get('/', obtenerEventos);
router.get('/:id', obtenerEventoPorId);

// Administración de eventos (JWT + rol admin).
router.get('/admin/todos', verificarToken, requiereAdmin, obtenerTodosEventos);
router.post('/', verificarToken, requiereAdmin, crearEvento);
router.put('/:id', verificarToken, requiereAdmin, actualizarEvento);
router.patch('/:id/desactivar', verificarToken, requiereAdmin, desactivarEvento);
router.patch('/:id/reactivar', verificarToken, requiereAdmin, reactivarEvento);
router.delete('/:id', verificarToken, requiereAdmin, eliminarEvento);

// Ubicación secreta / notificaciones de ubicación (solo admin autenticado).
router.get('/:id/ubicacion-preview', verificarToken, requiereAdmin, obtenerUbicacionPreview);
router.post('/:id/enviar-ubicacion', verificarToken, requiereAdmin, enviarUbicacionManual);
router.get('/:id/notificaciones-ubicacion', verificarToken, requiereAdmin, obtenerNotificacionesUbicacion);
router.patch('/:id/ubicacion-secreta', verificarToken, requiereAdmin, actualizarUbicacionSecreta);
router.get('/:id/exportar-compradores', verificarToken, requiereAdmin, exportarCompradores);

module.exports = router;
