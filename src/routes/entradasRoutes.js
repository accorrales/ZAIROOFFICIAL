const express = require('express');
const router = express.Router();

const {
  crearEntrada,
  confirmarEntrada
} = require('../controllers/entradasController');

router.post('/', crearEntrada);
router.post('/confirmar/:id', confirmarEntrada);

module.exports = router;