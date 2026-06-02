const express = require('express');
const router = express.Router();

const {
    obtenerDepartamentos,
    crearDepartamento,
    actualizarDepartamento,
    eliminarDepartamento
} = require('../controllers/departamentosController');


router.get('/', obtenerDepartamentos);

router.post('/', crearDepartamento);

router.put('/:id', actualizarDepartamento);

router.delete('/:id', eliminarDepartamento);

module.exports = router;