const express = require('express');
const router = express.Router();

const {
  obtenerEventos,
  obtenerTodosEventos,
  crearEvento,
  actualizarEvento,
  desactivarEvento,
  reactivarEvento,
  obtenerEventoPorId
} = require('../controllers/eventosController');

router.get('/', obtenerEventos);
router.get('/admin/todos', obtenerTodosEventos);
router.post('/', crearEvento);
router.put('/:id', actualizarEvento);
router.patch('/:id/desactivar', desactivarEvento);
router.patch('/:id/reactivar', reactivarEvento);
router.get('/:id', obtenerEventoPorId);

module.exports = router;