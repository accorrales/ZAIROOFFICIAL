const express = require('express');
const router = express.Router();

const { verificarToken, requiereAdmin } = require('../middlewares/authMiddleware');

const {
  listarCodigos,
  obtenerRankingPorEvento,
  obtenerCodigoPorId,
  crearCodigo,
  actualizarCodigo,
  eliminarCodigo,
  desactivarCodigo,
  reactivarCodigo,
  validarCodigo
} = require('../controllers/codigosDescuentoController');

const {
  obtenerCampana,
  registrarCodigo,
  consultarProgreso
} = require('../controllers/campanaCodigosController');

// Rate limiter en memoria por IP (ventana fija), igual que el del webhook.
// Railway pone la IP real del cliente en x-forwarded-for.
const limitarPorIp = (maximo, ventanaMs) => {
  const golpes = new Map();
  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip || 'unknown';
    const ahora = Date.now();
    const registro = golpes.get(ip);

    if (!registro || ahora > registro.reset) {
      golpes.set(ip, { count: 1, reset: ahora + ventanaMs });
      return next();
    }
    registro.count += 1;
    if (registro.count > maximo) {
      return res.status(429).json({ error: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.' });
    }
    next();
  };
};

// Validación pública (la usa el comprador antes de pagar).
router.post('/validar', validarCodigo);

// Reto 70 (público): info, registro del código del cliente y consulta de avance.
router.get('/campana', obtenerCampana);
router.post('/campana/registro', limitarPorIp(10, 10 * 60 * 1000), registrarCodigo);
router.get('/campana/progreso/:codigo', limitarPorIp(60, 60 * 1000), consultarProgreso);

// El ranking requiere sesión de administrador y se filtra por evento.
router.get('/ranking/:idEvento', verificarToken, requiereAdmin, obtenerRankingPorEvento);

// CRUD administrativo.
router.get('/', verificarToken, requiereAdmin, listarCodigos);
router.get('/:id', verificarToken, requiereAdmin, obtenerCodigoPorId);
router.post('/', verificarToken, requiereAdmin, crearCodigo);
router.put('/:id', verificarToken, requiereAdmin, actualizarCodigo);
router.patch('/:id/desactivar', verificarToken, requiereAdmin, desactivarCodigo);
router.patch('/:id/reactivar', verificarToken, requiereAdmin, reactivarCodigo);
router.delete('/:id', verificarToken, requiereAdmin, eliminarCodigo);

module.exports = router;
