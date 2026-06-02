const express = require('express');
const router = express.Router();

const {
  obtenerEmpleados,
  crearEmpleado,
  actualizarEmpleado,
  eliminarEmpleado
} = require('../controllers/empleadosController');

router.get('/', obtenerEmpleados);
router.post('/', crearEmpleado);
router.put('/:id', actualizarEmpleado);
router.delete('/:id', eliminarEmpleado);

module.exports = router;