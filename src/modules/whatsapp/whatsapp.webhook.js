const repository = require('./whatsapp.repository');
const whatsappService = require('./whatsapp.service');
const mediaService = require('./whatsapp.mediaService');
const ocrService = require('./whatsapp.ocrService');
const validationService = require('./whatsapp.validationService');
const messageParser = require('./whatsapp.messageParser');
const assistant = require('./whatsapp.assistant');
const templates = require('./whatsapp.templates');
const { verificarFirmaMeta, log, enmascarar } = require('./whatsapp.utils');

// ============================================================
//  Webhook de WhatsApp Cloud API.
//
//  GET  /api/whatsapp/webhook  -> verificación de Meta (challenge).
//  POST /api/whatsapp/webhook  -> recepción de eventos.
//
//  El POST responde 200 de inmediato (Meta exige < ~5s) y procesa la
//  lógica pesada en background con manejo de errores aislado.
// ============================================================

// ---------- GET: verificación del webhook ----------
const verificar = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    log.info('Webhook verificado correctamente por Meta.');
    return res.status(200).send(challenge);
  }

  log.warn('Verificación de webhook fallida (mode/token inválidos).');
  return res.sendStatus(403);
};

// ---------- POST: recepción de eventos ----------
const recibir = (req, res) => {
  // 1) Validar firma de Meta (si hay app secret configurado).
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const firma = req.headers['x-hub-signature-256'];
    const valido = verificarFirmaMeta(req.rawBody, firma, appSecret);
    if (!valido) {
      log.warn('Firma de webhook inválida. Evento descartado.');
      return res.sendStatus(401);
    }
  }

  // 2) Responder de inmediato para no exceder el timeout de Meta.
  res.sendStatus(200);

  // 3) Procesar en background sin bloquear la respuesta.
  procesarEvento(req.body).catch((error) => {
    log.error('Error procesando evento de webhook:', error.message);
  });
};

// ---------- Procesamiento asíncrono ----------
const procesarEvento = async (payload) => {
  if (!payload || payload.object !== 'whatsapp_business_account') return;

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      // Estados de mensajes (delivery / read / failed).
      if (Array.isArray(value.statuses)) {
        for (const status of value.statuses) {
          await procesarStatus(status);
        }
      }

      // Mensajes entrantes.
      if (Array.isArray(value.messages)) {
        const contacto = value.contacts?.[0];
        for (const message of value.messages) {
          await procesarMensaje(message, contacto);
        }
      }
    }
  }
};

const procesarStatus = async (status) => {
  try {
    if (status?.id && status?.status) {
      await repository.actualizarStatusMensaje(status.id, status.status);
    }
  } catch (error) {
    log.warn('No se pudo actualizar status de mensaje:', error.message);
  }
};

const procesarMensaje = async (message, contacto) => {
  const wamid = message.id;

  // Idempotencia: si ya procesamos este mensaje, no repetir.
  if (await repository.existeMensajeEntrante(wamid)) {
    log.info('Mensaje duplicado ignorado:', wamid);
    return;
  }

  const phone = message.from;
  const contactName = contacto?.profile?.name || null;
  const conversacion = await repository.obtenerOCrearConversacion(phone, contactName);

  const tipo = mapearTipo(message.type);

  await repository.guardarMensaje({
    conversationId: conversacion.id,
    whatsappMessageId: wamid,
    direction: 'INBOUND',
    messageType: tipo,
    body: message.text?.body || message[message.type]?.caption || null,
    mediaId: message.image?.id || message.document?.id || null,
    mediaUrl: null,
    status: 'received',
    rawPayload: message
  });

  log.info('Mensaje entrante', tipo, 'de', enmascarar(phone));

  if (tipo === 'TEXT') {
    await manejarTexto(message, conversacion);
  } else if (tipo === 'IMAGE' || tipo === 'DOCUMENT') {
    await manejarComprobante(message, conversacion, tipo);
  } else {
    // Tipos no soportados (audio, video, stickers...) -> escalar.
    await repository.actualizarConversacion(conversacion.id, { needs_human: true });
  }
};

const mapearTipo = (type) => {
  switch (type) {
    case 'text': return 'TEXT';
    case 'image': return 'IMAGE';
    case 'document': return 'DOCUMENT';
    case 'audio': return 'AUDIO';
    case 'video': return 'VIDEO';
    default: return 'OTHER';
  }
};

// ---------- Manejo de mensajes de texto ----------
const manejarTexto = async (message, conversacion) => {
  const texto = message.text?.body || '';
  const parsed = messageParser.parsearTexto(texto);

  // 1) Intentar asociar una compra si aún no hay una.
  let compra = null;
  if (!conversacion.compra_id) {
    compra = await asociarCompra(conversacion, parsed);
  }

  // Si acabamos de asociar una compra, damos la bienvenida con instrucciones.
  if (compra) {
    await enviarYRegistrar(conversacion, templates.compraAsociada());
    return;
  }

  // 2) Si el mensaje traía un código pero no encontró compra.
  if (parsed.codigo && !conversacion.compra_id) {
    await enviarYRegistrar(conversacion, templates.codigoNoEncontrado());
    return;
  }

  // 3) Asistente por reglas con contexto de la conversación.
  const compraCtx = await cargarCompraDeConversacion(conversacion);
  const respuesta = await assistant.responder({
    intencion: parsed.intencion,
    compra: compraCtx,
    eventoId: conversacion.evento_id
  });

  if (respuesta.requiereHumano) {
    await repository.actualizarConversacion(conversacion.id, { needs_human: true });
  }

  const textoRespuesta = respuesta.texto || templates.requiereHumano();
  await enviarYRegistrar(conversacion, textoRespuesta);
};

/**
 * Intenta asociar una compra a la conversación por código, correo o teléfono.
 * Devuelve la compra asociada o null.
 */
const asociarCompra = async (conversacion, parsed) => {
  let compra = null;

  if (parsed.codigo) compra = await repository.buscarCompraPorCodigo(parsed.codigo);
  if (!compra && parsed.correo) compra = await repository.buscarCompraPorCorreo(parsed.correo);
  if (!compra) compra = await repository.buscarCompraPorTelefono(conversacion.phone_number);

  if (!compra) return null;

  await repository.actualizarConversacion(conversacion.id, {
    compra_id: compra.id_compra,
    evento_id: compra.id_evento,
    current_state: 'COMPRA_ASOCIADA'
  });

  return compra;
};

const cargarCompraDeConversacion = async (conversacion) => {
  if (!conversacion.compra_id) {
    // Sin compra asociada: intentar por teléfono como contexto (solo lectura).
    return await repository.buscarCompraPorTelefono(conversacion.phone_number);
  }
  return await repository.buscarCompraPorCodigo(conversacion.compra_id);
};

// ---------- Manejo de comprobantes (imagen / documento) ----------
const manejarComprobante = async (message, conversacion, tipo) => {
  const media = tipo === 'IMAGE' ? message.image : message.document;
  const mediaId = media?.id;

  if (!mediaId) {
    await enviarYRegistrar(conversacion, templates.solicitarNuevoComprobante());
    return;
  }

  // Asegurar compra asociada (por teléfono si no hay).
  let compraId = conversacion.compra_id;
  if (!compraId) {
    const compra = await repository.buscarCompraPorTelefono(conversacion.phone_number);
    if (compra) {
      compraId = compra.id_compra;
      await repository.actualizarConversacion(conversacion.id, {
        compra_id: compra.id_compra,
        evento_id: compra.id_evento
      });
    }
  }

  const resultado = await mediaService.procesarComprobante({
    mediaId,
    conversationId: conversacion.id,
    compraId,
    whatsappMessageId: message.id,
    mimeTypeHint: media?.mime_type,
    fileName: media?.filename
  });

  if (!resultado.ok) {
    log.warn('No se pudo procesar comprobante:', resultado.error);
    await enviarYRegistrar(conversacion, templates.solicitarNuevoComprobante());
    return;
  }

  // Confirmar recepción al cliente de inmediato.
  await enviarYRegistrar(conversacion, templates.comprobanteRecibido());
  await repository.actualizarConversacion(conversacion.id, { current_state: 'COMPROBANTE_RECIBIDO' });

  // OCR + validación (best effort, no bloquea la conversación).
  await procesarOcrYValidacion(resultado.receipt, compraId).catch((error) => {
    log.error('Error en OCR/validación del comprobante:', error.message);
  });
};

const procesarOcrYValidacion = async (receipt, compraId) => {
  await repository.actualizarComprobanteOcr(receipt.id, { validation_status: 'OCR_PENDING' });

  // Recuperar binario para OCR.
  const bin = await repository.obtenerBinarioComprobante(receipt.id);
  if (!bin?.file_data) {
    await repository.actualizarComprobanteOcr(receipt.id, {
      validation_status: 'NEEDS_REVIEW',
      validation_notes: 'No se pudo recuperar el archivo para OCR.'
    });
    return;
  }

  const analisis = await ocrService.analizarComprobante(bin.file_data);

  const receiptActualizado = await repository.actualizarComprobanteOcr(receipt.id, {
    ocr_text: analisis.text,
    detected_amount: analisis.datos.detected_amount,
    detected_date: analisis.datos.detected_date,
    detected_time: analisis.datos.detected_time,
    detected_reference: analisis.datos.detected_reference,
    detected_bank: analisis.datos.detected_bank,
    detected_destination: analisis.datos.detected_destination,
    detected_recipient: analisis.datos.detected_recipient,
    validation_status: 'OCR_PROCESSED'
  });

  const compra = compraId ? await repository.buscarCompraPorCodigo(compraId) : null;
  const veredicto = await validationService.validar(receiptActualizado, compra);

  await repository.actualizarComprobanteOcr(receipt.id, {
    confidence_score: veredicto.confidence_score,
    validation_status: veredicto.validation_status,
    validation_notes: veredicto.validation_notes
  });

  log.info('Comprobante', receipt.id, 'validado ->', veredicto.validation_status, `(${veredicto.confidence_score})`);
};

// ---------- Envío + registro del mensaje saliente ----------
const enviarYRegistrar = async (conversacion, texto) => {
  const envio = await whatsappService.enviarTexto(conversacion.phone_number, texto);

  await repository.guardarMensaje({
    conversationId: conversacion.id,
    whatsappMessageId: envio.messageId || null,
    direction: 'OUTBOUND',
    messageType: 'TEXT',
    body: texto,
    status: envio.ok ? 'sent' : 'failed'
  });

  return envio;
};

module.exports = {
  verificar,
  recibir,
  // exportados para reutilizar desde el controller (confirmación/rechazo).
  enviarYRegistrar
};
