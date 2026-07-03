const locationNotificationService = require('../services/locationNotificationService');

const INTERVALO_MS = (Number(process.env.LOCATION_CRON_INTERVAL_MINUTES) || 60) * 60 * 1000;

const ejecutar = async () => {
  try {
    const resultado = await locationNotificationService.procesarEventosPendientes();

    if (resultado.habilitado && resultado.eventosProcesados > 0) {
      console.log('[location-cron] eventos procesados:', JSON.stringify(resultado.resultados));
    }
  } catch (error) {
    console.error('[location-cron] error ejecutando el job:', error);
  }
};

// Se ejecuta cada cierto tiempo (por defecto cada hora). También corre poco
// después de arrancar el servidor: si el proceso estuvo apagado y algún
// evento ya entró en la ventana de envío, se manda apenas el cron vuelve a
// correr, sin esperar a la primera hora completa.
const iniciarLocationNotificationCron = () => {
  setTimeout(ejecutar, 30 * 1000);
  setInterval(ejecutar, INTERVALO_MS);

  console.log(
    `[location-cron] iniciado (cada ${INTERVALO_MS / 60000} min, LOCATION_NOTIFICATIONS_ENABLED=${process.env.LOCATION_NOTIFICATIONS_ENABLED || 'false'})`
  );
};

module.exports = { iniciarLocationNotificationCron };
