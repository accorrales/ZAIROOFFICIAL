const express = require('express');
const router = express.Router();

const { verificarToken, requiereAdmin } = require('../../middlewares/authMiddleware');
const webhook = require('./whatsapp.webhook');
const controller = require('./whatsapp.controller');

// ============================================================
//  Rutas del módulo WhatsApp.
//    - /webhook  : público (lo llama Meta). Firma validada en el handler.
//    - resto     : admin (JWT + rol admin).
// ============================================================

// Rate limiter en memoria muy simple para el webhook (defensa básica).
// No usa dependencias externas; ventana deslizante por IP.
const ventanaMs = 60 * 1000;
const maxPorVentana = Number(process.env.WHATSAPP_WEBHOOK_RATE_LIMIT) || 600;
const golpes = new Map();

const rateLimitWebhook = (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const ahora = Date.now();
  const registro = golpes.get(ip) || { count: 0, reset: ahora + ventanaMs };

  if (ahora > registro.reset) {
    registro.count = 0;
    registro.reset = ahora + ventanaMs;
  }
  registro.count += 1;
  golpes.set(ip, registro);

  if (registro.count > maxPorVentana) {
    return res.sendStatus(429);
  }
  next();
};

// ---------- Webhook (Meta) ----------
router.get('/webhook', webhook.verificar);
router.post('/webhook', rateLimitWebhook, webhook.recibir);

// ---------- Admin: conversaciones ----------
router.get('/conversaciones', verificarToken, requiereAdmin, controller.listarConversaciones);
router.get('/conversaciones/:id/mensajes', verificarToken, requiereAdmin, controller.obtenerMensajes);
router.post('/conversaciones/:id/mensaje', verificarToken, requiereAdmin, controller.enviarMensajeManual);

// ---------- Admin: comprobantes ----------
router.get('/comprobantes', verificarToken, requiereAdmin, controller.listarComprobantes);
router.get('/comprobantes/:id/archivo', verificarToken, requiereAdmin, controller.obtenerArchivoComprobante);
router.patch('/comprobantes/:id/confirmar', verificarToken, requiereAdmin, controller.confirmarDesdeComprobante);
router.patch('/comprobantes/:id/rechazar', verificarToken, requiereAdmin, controller.rechazarComprobante);
router.post('/comprobantes/:id/solicitar-nuevo', verificarToken, requiereAdmin, controller.solicitarNuevoComprobante);

module.exports = router;
