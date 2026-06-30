const express = require('express');
const router = express.Router();

const {
  obtenerEntradasPorEvento,
  invalidarEntrada,
  revalidarEntrada,
  descargarReporteCsv
} = require('../controllers/entradasConfirmadasController');

router.get('/evento/:id_evento', obtenerEntradasPorEvento);
router.get('/evento/:id_evento/reporte.csv', descargarReporteCsv);
router.patch('/detalle/:id_detalle/invalidar', invalidarEntrada);
router.patch('/detalle/:id_detalle/revalidar', revalidarEntrada);

module.exports = router;
