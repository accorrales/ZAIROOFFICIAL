const express = require('express');
const router = express.Router();

const {
    obtenerNovedades,
    crearNovedad,
    actualizarNovedad,
    eliminarNovedad
} = require('../controllers/novedadesController');

router.get('/', obtenerNovedades);

router.post('/', crearNovedad);

router.put('/:id', actualizarNovedad);

router.delete('/:id', eliminarNovedad);

module.exports = router;