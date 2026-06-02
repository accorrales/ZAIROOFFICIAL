const express = require('express');
const router = express.Router();

const {
    obtenerConceptos,
    crearConcepto,
    actualizarConcepto,
    eliminarConcepto
} = require('../controllers/conceptosController');

router.get('/', obtenerConceptos);

router.post('/', crearConcepto);

router.put('/:id', actualizarConcepto);

router.delete('/:id', eliminarConcepto);

module.exports = router;