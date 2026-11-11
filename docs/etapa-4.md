# Etapa 4 — API pública y contenido histórico

Se partió de los commits de etapa 3 (`afc9f12` backend, `9358fa6` frontend) y se repitió su integración real antes de modificar código: edición, guardado y recarga, snapshots privados, permisos, publicación y venta, cierre concurrente y conservación de compras pasaron. Ambos repositorios estaban limpios. No se usó producción.

## Cambios de contrato público

- La portada recibe solo eventos elegidos desde el panel, sin BORRADOR, con el destacado primero y un orden estable por fecha/ID para los demás. El frontend respeta la selección y no descarta por su cuenta eventos antiguos.
- La respuesta de listado es liviana: metadata pública y colores, sin historia completa, artistas, galería, videos ni borrador. El detalle publicado conserva el contenido editorial completo autorizado y sus secciones visibles en el orden guardado.
- PROXIMAMENTE conserva la proyección mínima y el detalle 404. BORRADOR no aparece y su detalle/tiers devuelven 404. PUBLICADO tiene detalle 200 con o sin ventas.
- **Cambio respecto de etapa 3:** los tiers activos de un evento PUBLICADO pueden consultarse con ventas cerradas para presentar precios y promociones sin comprar. El endpoint público omite tiers desactivados y stock. El endpoint admin conserva toda la configuración. Esto no habilita reservas: POST compra sigue exigiendo publicación y ventas abiertas, con el segundo chequeo y lock transaccional de etapa 3.
- Las respuestas públicas de eventos/tiers son `Cache-Control: no-store`; no se permite que un caché HTTP mantenga una publicación o tarifa retirada. Las imágenes y archivos estáticos pueden cachearse en el hosting.
- La proyección sigue excluyendo borradores, campos de envío y ubicaciones privadas. Las ubicaciones reveladas solo se entregan con la bandera existente y el frontend admite enlaces HTTPS sin credenciales. Los bloques ocultos no viajan como contenido editorial público.

## Recursos configurables y conservación de INFAMOUS

El JSON editorial admite ahora `videos` (opcional, máximo tres; URL, poster y título) y `mapa_imagen_url` opcional. Los clientes anteriores sin esos campos siguen siendo válidos. Se usan las mismas restricciones HTTPS o `/assets/`, límites y texto plano. La galería oculta excluye videos; información oculta excluye el mapa. No se agregan tablas ni dependencias.

`src/content/infamous-2026.json` conserva el relato, artistas, imágenes, videos y texto de la guía anterior como datos de ese evento. Los renderizadores públicos no importan componentes INFAMOUS ni deducen temas, horarios, imágenes, planos o lineup por el nombre. Los archivos históricos originales permanecen en frontend.

`migrateLegacyEventContent` se ejecuta idempotentemente al iniciar y solo reconoce el nombre exacto INFAMOUS y su fecha histórica de Halloween 2026. Contempla el esquema preparado `timestamp without time zone` y esquemas `timestamptz`, sin cambiar la fecha. Solo rellena versiones sin historia y sin borrador editado; preserva metadata y contenido administrado. Incrementa la revisión cuando rellena contenido para invalidar pestañas antiguas. No crea eventos ni abre ventas, no toca compras, tiers, cupos o pagos y no afecta eventos homónimos futuros. El texto histórico de precios/condiciones es editable; la tarifa efectiva de compra sigue viniendo de tiers.

## Evidencia y límites

`node --test`: 28 pruebas. Incluye contrato HTTP real sobre PGlite para estados públicos, orden, resumen, privacidad de ubicaciones y tiers, roles editoriales y legado. La migración histórica se prueba repetida, con ambas variantes de fecha y con contenido ya editado. Los tests de paquetes VIP, inventario, QR, edad, campaña y permisos anteriores se conservan.

Integración adicional sobre PostgreSQL local con frontend optimizado: cero/uno/varios, destacado frente a fecha anterior, anuncio mínimo, página publicada sin ventas, evento fuera de portada con URL directa, borrador 404, orden y ocultamiento también en JSON, copia de enlace, acceso al checkout y compra PENDIENTE de seis VIP. No se confirmó ni comunicó nada. Al cerrar ventas, el endpoint compra devolvió 403 sin una nueva reserva y el checkout dejó de ofrecer formulario al recargar. Los fixtures se eliminaron.

No se alteraron las integraciones de pago, WhatsApp, email, autenticación o permisos. Durante validación se bloquearon solicitudes externas; el salto WhatsApp fue interceptado en el navegador y nunca se abrió una comunicación. Notificaciones automáticas desactivadas. No hay despliegue.

El hosting público debe reescribir las rutas SPA al documento inicial para servir enlaces directos. Los metadatos se actualizan en el navegador; no se agregó SSR ni garantía de previews sociales de bots sin JavaScript. Las mediciones de red y límites están en la documentación frontend de etapa 4.
