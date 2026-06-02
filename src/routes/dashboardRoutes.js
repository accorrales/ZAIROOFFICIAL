const express = require('express');
const router = express.Router();

const {
    obtenerDashboard
} = require('../controllers/dashboardController');

router.get('/', obtenerDashboard);

module.exports = router;