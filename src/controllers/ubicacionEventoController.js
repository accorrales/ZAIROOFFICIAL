const pool = require('../config/database');
const locationNotificationService = require('../services/locationNotificationService');

// GET /api/eventos/:id/ubicacion-preview (admin)
// Cuántas compras PAGADAS recibirían la ubicación, cuántas ya la recibieron
// y la información de ubicación configurada.
const obtenerUbicacionPreview = async (req, res) => {
  const { id } = req.params;

  try {
    const preview = await locationNotificationService.obtenerPreview(id);
    res.json(preview);
  } catch (error) {
    if (error.message === 'Evento no encontrado') {
      return res.status(404).json({ message: error.message });
    }

    console.error('ERROR OBTENIENDO PREVIEW DE UBICACION:', error);
    res.status(500).json({ message: 'Error obteniendo el preview de ubicación' });
  }
};

// POST /api/eventos/:id/enviar-ubicacion (admin)
// Envío manual, sin esperar al cron, siempre que el evento tenga ubicación
// configurada. Reutiliza el mismo servicio y respeta el anti-duplicados.
// Si el body trae "id_compra", el envío es individual (solo a ese
// comprador); si no, se manda a todas las compras PAGADAS pendientes.
const enviarUbicacionManual = async (req, res) => {
  const { id } = req.params;
  const { id_compra } = req.body || {};

  try {
    const eventoResult = await pool.query(`SELECT * FROM eventos WHERE id_evento = $1`, [id]);

    if (eventoResult.rows.length === 0) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    const evento = eventoResult.rows[0];

    if (!locationNotificationService.tieneUbicacionConfigurada(evento)) {
      return res.status(400).json({
        message: 'El evento no tiene ubicación secreta configurada (nombre y dirección son obligatorios)'
      });
    }

    if (id_compra) {
      const resultado = await locationNotificationService.enviarUbicacionAUnaCompra(evento, id_compra, 'MANUAL');

      const mensajes = {
        ENVIADO: 'Ubicación enviada a este comprador correctamente',
        OMITIDO: 'Este comprador ya había recibido la ubicación antes'
      };

      return res.json({
        message: mensajes[resultado.estado] || 'Envío procesado',
        resultado
      });
    }

    const resumen = await locationNotificationService.enviarUbicacionEvento(evento, { canal: 'MANUAL' });

    res.json({
      message: 'Envío de ubicación procesado',
      resumen
    });
  } catch (error) {
    console.error('ERROR ENVIANDO UBICACION MANUAL:', error);

    if (error.message === 'La compra no existe o no está pagada para este evento') {
      return res.status(404).json({ message: error.message });
    }

    res.status(500).json({ message: error.message || 'Error enviando la ubicación' });
  }
};

// GET /api/eventos/:id/notificaciones-ubicacion (admin)
// Historial de envíos, errores y correos enviados.
const obtenerNotificacionesUbicacion = async (req, res) => {
  const { id } = req.params;

  try {
    const historial = await locationNotificationService.obtenerHistorial(id);
    res.json(historial);
  } catch (error) {
    console.error('ERROR OBTENIENDO HISTORIAL DE UBICACION:', error);
    res.status(500).json({ message: 'Error obteniendo el historial de notificaciones' });
  }
};

// PATCH /api/eventos/:id/ubicacion-secreta (admin)
// Actualiza la ubicación secreta del evento desde el CRUD de eventos.
const actualizarUbicacionSecreta = async (req, res) => {
  const { id } = req.params;

  const {
    ubicacion_secreta_nombre,
    ubicacion_secreta_direccion,
    ubicacion_secreta_google_maps_url,
    ubicacion_secreta_waze_url,
    ubicacion_envio_habilitado,
    ubicacion_envio_programado_at,
    ubicacion_visible_publicamente
  } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE eventos
      SET
        ubicacion_secreta_nombre         = $1,
        ubicacion_secreta_direccion       = $2,
        ubicacion_secreta_google_maps_url = $3,
        ubicacion_secreta_waze_url        = $4,
        ubicacion_envio_habilitado        = $5,
        ubicacion_envio_programado_at     = $6,
        ubicacion_visible_publicamente    = $7
      WHERE id_evento = $8
      RETURNING *
      `,
      [
        ubicacion_secreta_nombre || null,
        ubicacion_secreta_direccion || null,
        ubicacion_secreta_google_maps_url || null,
        ubicacion_secreta_waze_url || null,
        !!ubicacion_envio_habilitado,
        ubicacion_envio_programado_at || null,
        !!ubicacion_visible_publicamente,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    res.json({
      message: 'Ubicación secreta actualizada correctamente',
      evento: result.rows[0]
    });
  } catch (error) {
    console.error('ERROR ACTUALIZANDO UBICACION SECRETA:', error);
    res.status(500).json({ message: 'Error actualizando la ubicación secreta' });
  }
};

// GET /api/eventos/:id/exportar-compradores (admin)
// Lista de compradores PAGADOS con teléfono, para envío manual por WhatsApp
// (no existe integración oficial de WhatsApp Business en el proyecto).
const exportarCompradores = async (req, res) => {
  const { id } = req.params;

  try {
    const compradores = await locationNotificationService.exportarCompradoresConTelefono(id);
    res.json(compradores);
  } catch (error) {
    console.error('ERROR EXPORTANDO COMPRADORES:', error);
    res.status(500).json({ message: 'Error exportando la lista de compradores' });
  }
};

module.exports = {
  obtenerUbicacionPreview,
  enviarUbicacionManual,
  obtenerNotificacionesUbicacion,
  actualizarUbicacionSecreta,
  exportarCompradores
};
