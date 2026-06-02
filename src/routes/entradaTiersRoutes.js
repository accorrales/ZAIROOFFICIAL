const express = require('express');
const router = express.Router();

const {
  obtenerTiersPorEvento,
  crearTier,
  actualizarTier,
  eliminarTier
} = require('../controllers/entradaTiersController');

router.get('/evento/:id_evento', obtenerTiersPorEvento);
router.post('/', crearTier);
router.put('/:id', actualizarTier);
router.delete('/:id', eliminarTier);

module.exports = router;