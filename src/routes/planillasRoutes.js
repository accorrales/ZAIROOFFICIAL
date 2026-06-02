const express = require('express');
const router = express.Router();

const {
    obtenerPlanillas,
    crearPlanilla,
    actualizarPlanilla,
    eliminarPlanilla,
    procesarPlanilla,
    obtenerDetallePlanilla,
    confirmarPlanilla
} = require('../controllers/planillasController');

router.get('/', obtenerPlanillas);

router.post('/', crearPlanilla);

router.put('/:id', actualizarPlanilla);

router.delete('/:id', eliminarPlanilla);

router.post('/procesar/:id', procesarPlanilla);

router.get('/:id/detalle', obtenerDetallePlanilla);

router.post('/confirmar/:id', confirmarPlanilla);

module.exports = router;