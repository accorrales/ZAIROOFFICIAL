// ============================================================
//  Plantillas de mensajes salientes de WhatsApp.
//  Centralizadas aquí para mantener un tono consistente y poder
//  ajustarlas sin tocar la lógica. Texto plano (no plantillas HSM
//  de Meta) para respuestas dentro de la ventana de 24h.
// ============================================================

const compraAsociada = () =>
  '¡Hola! 👋 Gracias por comprar en ZAIRO.\n\n' +
  'Para finalizar tu compra, enviá el comprobante de pago a este mismo chat.\n\n' +
  'Cuando lo recibamos, verificaremos el pago y tu entrada digital será enviada al correo registrado.\n\n' +
  'Recordá enviar un comprobante claro y legible. 🎟️';

const comprobanteRecibido = () =>
  'Hemos recibido tu comprobante. ✅\n\n' +
  'Está en proceso de validación. Te avisaremos cuando tu entrada quede confirmada.';

const compraConfirmada = () =>
  'Tu compra ha sido confirmada con éxito. ✅\n\n' +
  'Tu entrada digital con código QR fue enviada al correo registrado.\n\n' +
  'Revisá tu bandeja principal, spam o promociones.\n\n' +
  'Nos vemos en ZAIRO. 🎟️🌿';

const comprobanteRechazado = () =>
  'Tu comprobante no pudo ser validado. ⚠️\n\n' +
  'Por favor enviá un nuevo comprobante claro y legible a este mismo chat.\n\n' +
  'Si creés que fue un error, podés responder este mensaje para recibir ayuda.';

const solicitarNuevoComprobante = () =>
  'Necesitamos que envíes nuevamente tu comprobante de pago. 📄\n\n' +
  'Asegurate de que la imagen o el documento se vean claros y completos (monto, fecha y referencia).';

const codigoNoEncontrado = () =>
  'No pudimos encontrar una compra con ese código. 🤔\n\n' +
  'Revisá que el código sea correcto o respondé con tu número de teléfono y correo ' +
  'con los que hiciste la compra para ayudarte.';

const requiereHumano = () =>
  'Gracias por tu mensaje. 🙌 En un momento un miembro del equipo de ZAIRO ' +
  'te va a atender por este mismo chat.';

const saludoGenerico = () =>
  '¡Hola! 👋 Soy el asistente de ZAIRO.\n\n' +
  'Si ya realizaste una compra, enviá tu *código de compra* para ayudarte a confirmarla, ' +
  'o enviá directamente el comprobante de pago. 🎟️';

module.exports = {
  compraAsociada,
  comprobanteRecibido,
  compraConfirmada,
  comprobanteRechazado,
  solicitarNuevoComprobante,
  codigoNoEncontrado,
  requiereHumano,
  saludoGenerico
};
