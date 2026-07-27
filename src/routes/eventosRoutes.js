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

const camposUbicacionSecreta = [
  'ubicacion_secreta_nombre',
  'ubicacion_secreta_direccion',
  'ubicacion_secreta_google_maps_url',
  'ubicacion_secreta_waze_url'
];

const camposInternosUbicacion = [
  'ubicacion_envio_habilitado',
  'ubicacion_enviada_at',
  'ubicacion_envio_programado_at'
];

const sanitizarEventoPublico = (evento) => {
  if (!evento || typeof evento !== 'object') return evento;

  const eventoSeguro = { ...evento };

  camposInternosUbicacion.forEach((campo) => {
    delete eventoSeguro[campo];
  });

  if (!eventoSeguro.ubicacion_visible_publicamente) {
    camposUbicacionSecreta.forEach((campo) => {
      delete eventoSeguro[campo];
    });
  }

  return eventoSeguro;
};

// Defensa adicional para impedir que un SELECT * futuro filtre ubicación secreta
// o metadatos internos desde los endpoints públicos.
const sanitizarRespuestaPublica = (req, res, next) => {
  const enviarJson = res.json.bind(res);

  res.json = (body) => {
    const bodySeguro = Array.isArray(body)
      ? body.map(sanitizarEventoPublico)
      : sanitizarEventoPublico(body);

    return enviarJson(bodySeguro);
  };

  next();
};

// Público: listado y detalle, siempre sanitizados antes de responder.
router.get('/', sanitizarRespuestaPublica, obtenerEventos);
router.get('/:id', sanitizarRespuestaPublica, obtenerEventoPorId);

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
