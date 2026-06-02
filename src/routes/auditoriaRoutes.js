const express = require('express');
const router = express.Router();

const {
    obtenerAuditoria
} = require('../controllers/auditoriaController');

router.get('/', obtenerAuditoria);

module.exports = router;