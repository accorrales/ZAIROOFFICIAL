const express = require('express');
const router = express.Router();
const { requiereAdmin } = require('../middlewares/authMiddleware');

const {
  obtenerEntradasPorEvento,
  invalidarEntrada,
  revalidarEntrada,
  descargarReporteCsv
} = require('../controllers/entradasConfirmadasController');

router.get('/evento/:id_evento', obtenerEntradasPorEvento);
router.get('/evento/:id_evento/reporte.csv', descargarReporteCsv);
router.patch('/detalle/:id_detalle/invalidar', requiereAdmin, invalidarEntrada);
router.patch('/detalle/:id_detalle/revalidar', requiereAdmin, revalidarEntrada);

module.exports = router;
