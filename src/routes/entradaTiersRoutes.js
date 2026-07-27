const express = require('express');
const router = express.Router();

const { verificarToken, requiereAdmin } = require('../middlewares/authMiddleware');

const {
  obtenerTiersPorEvento,
  crearTier,
  actualizarTier,
  eliminarTier
} = require('../controllers/entradaTiersController');

// Público: los compradores necesitan consultar los tiers disponibles.
router.get('/evento/:id_evento', obtenerTiersPorEvento);

// Administración de tiers.
router.post('/', verificarToken, requiereAdmin, crearTier);
router.put('/:id', verificarToken, requiereAdmin, actualizarTier);
router.delete('/:id', verificarToken, requiereAdmin, eliminarTier);

module.exports = router;
