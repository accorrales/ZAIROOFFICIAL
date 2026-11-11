# Etapa 3 — eventos configurables

Implementación local sobre los commits preservados de etapas 1 y 2. No hay despliegue, nuevas dependencias ni envíos reales.

## Modelo y compatibilidad

`src/sql/eventos_editoriales.sql` es una migración aditiva e idempotente aplicada obligatoriamente antes de escuchar HTTP. Agrega estado de publicación, ventas, destacado, dos snapshots JSONB y revisión editorial. Asegura también `mostrar_en_home` para esquemas que todavía no tenían la migración teaser. No cambia compras, detalles, QR, cupos ni relaciones existentes.

| Estado | Portada | Detalle público | Compra nueva |
| --- | --- | --- | --- |
| BORRADOR | Nunca | 404 | 403 |
| PROXIMAMENTE | Si se selecciona: solo nombre, fecha e imagen, más indicadores públicos | 404 | 403 |
| PUBLICADO, ventas cerradas | Si se selecciona | 200, snapshot publicado | 403 |
| PUBLICADO, ventas abiertas | Si se selecciona | 200, snapshot publicado | Permitida si tier/cupo/edad/código son válidos |

Los eventos antiguos activos migran a PUBLICADO con ventas abiertas y visibles en portada, conservando su presencia anterior (la consulta antigua ignoraba `mostrar_en_home` cuando estaban activos). Los inactivos visibles migran a PROXIMAMENTE; el resto queda BORRADOR. Repetir la migración no revierte decisiones posteriores. `estado` se conserva como espejo de ventas para consumidores existentes. Las compras pendientes anteriores se pueden seguir administrando/confirmando: cerrar ventas bloquea nuevas reservas, no altera la historia.

`contenido_borrador` es privado. Guardarlo aumenta `revision_editorial` sin cambiar el contenido público. Aplicar publicación valida y copia el borrador a `contenido_publicado`, actualiza la metadata base necesaria para compras/reportes y cambia publicación/ventas/portada en una transacción. No se modifican IDs ni compras. Cualquier revisión desactualizada devuelve 409. Retirar a BORRADOR cierra ventas, quita portada/destacado y oculta el detalle público.

Un índice único parcial permite un solo destacado. Un bloqueo asesor transaccional serializa los cambios; seleccionar uno quita el anterior e invalida su revisión para evitar que una pestaña vieja lo reponga silenciosamente. Puede haber varios eventos visibles y ninguno destacado.

## API y validaciones

- `GET /api/eventos/:id/contenido`: borrador y revisión, exclusivamente admin autenticado. Es la fuente de la vista previa privada; no devuelve columnas de ubicación secreta.
- `PUT /api/eventos/:id/contenido`: `{contenido, revision}`; guarda el borrador.
- `POST /api/eventos/:id/publicacion`: `{publicacion, ventas_abiertas, mostrar_en_home, destacado, revision}`; aplica la versión guardada.
- Crear evento por el endpoint existente siempre crea BORRADOR, ventas cerradas y fuera de portada, aunque un cliente antiguo envíe `estado:true`.
- La edición antigua de metadata modifica solo el borrador. Los atajos antiguos de desactivar/reactivar cierran/abren ventas; reactivar solo funciona con PUBLICADO y ambos incrementan revisión.
- El catálogo administrativo de contabilidad conserva metadata financiera, pero excluye borrador y ubicación secreta. Admin conserva acceso completo.
- GET público lista solo eventos seleccionados y no borradores, ordenando destacado primero. Detalle solo para PUBLICADO, aunque tenga ventas cerradas. Ambas respuestas usan proyección explícita, nunca exponen la fila SQL ni el borrador.
- Los tiers públicos se cierran si el evento no tiene ventas abiertas. Su endpoint admin conserva el acceso a configuración.

Contenido admitido: metadata pública, historia, concepto, hasta 30 artistas y 20 imágenes, tres colores hex y exactamente cuatro secciones únicas (`historia`, `artistas`, `galeria`, `informacion`) con orden, título y visibilidad. Texto acotado y plano; no HTML interpretado ni constructor libre. Imágenes HTTPS sin credenciales o `/assets/`. Contraste mínimo texto/fondo y acento/fondo 4.5:1, porque el acento también se usa en texto pequeño de la vista previa. Campos desconocidos —incluidos los de ubicación secreta— son rechazados. Los bloques ocultos de historia/artistas/galería se omiten también de los datos públicos, no solo del HTML.

Los metadatos de programación/envío y columnas privadas de ubicación no se incluyen. La dirección secreta solo se revela en detalle si la configuración existente `ubicacion_visible_publicamente` lo permite; la vista previa editorial usa únicamente la ubicación pública. La administración privada de ubicaciones continúa por sus endpoints anteriores.

La creación de compra comprueba publicación y ventas en el backend. Dentro de la transacción vuelve a leer el evento con `FOR SHARE`, que se mantiene hasta el commit junto al lock del tier; un cierre concurrente no permite reservar después. Si cambió la fecha desde la primera lectura, devuelve 409 y exige reintento para no usar edades calculadas con otra fecha.

## Verificación

- Backend `node --test`: 25/25. Incluye migración doble, traducción de estados antiguos, snapshots, límites/URLs/colores/secciones, conflictos de revisión, destacado único, retirada, proyección pública y matriz HTTP de roles. Las pruebas existentes de seis VIP, inventario, QR y edad siguen pasando.
- Frontend: 47/47 en 17 archivos. Pruebas nuevas de revisión y guardado privado, conflictos, controles de anuncio/borrador y conversión horaria de Costa Rica.
- Build frontend correcto; advertencias CommonJS anteriores de jsPDF/canvg. No descargas de fuentes ni cambios de lockfiles.
- Integración en PostgreSQL local: borrador → anuncio → página sin ventas → ventas abiertas → cierre concurrente → retirada. Hubo una compra ficticia PENDIENTE para comprobar reserva y conservación al retirar; no se confirmó ni envió correo. El cierre concurrente se reprodujo con un lock real, observando la compra esperando en `pg_stat_activity`: devolvió 403 sin añadir compra ni reservar cupo.
- Chromium 1440×1000 y 390×844: guardar texto y orden desde el panel, recargar y comprobar persistencia; ocultar galería; vista previa privada; publicar anuncio desde UI y recargar; permisos y ausencia de overflow horizontal. Requests externos bloqueados. Capturas con contenido ficticio, sin secretos. Fixtures eliminados al finalizar.
- Migración repetida en PostgreSQL local y diff revisado. Logs/scripts de integración de esta sesión en `/workspace/work/stage3-*`.

## Límites y operación

La vista previa editorial muestra el contenido completo del borrador y se identifica explícitamente como privada; en modo anuncio, el público recibe solo metadata mínima. No emite entradas ni habilita compras.

La portada pública y páginas de megaevento todavía no consumen toda esta estructura: el frontend público anterior mantiene su renderizado y su orden por fecha. La API respeta selección/privacidad y ofrece el destacado, pero su presentación completa y la navegación a páginas sin venta son etapa 4. El editor no importa componentes ni contenido INFAMOUS. Las imágenes se referencian por URL; no se agregó un servicio de carga/almacenamiento.

No se hizo prueba en teléfono físico ni auditoría completa de accesibilidad. Los cambios sin guardar se indican y no persisten; guardar y publicar son operaciones explícitas. Aplicar publicación reemplaza el snapshot anterior; no se agrega historial editorial de versiones ni publicación programada.

No desplegar solo el esquema con servidores antiguos que hagan `SELECT *` público: la API nueva debe estar activa antes de habilitar la edición. No se hizo despliegue aquí. Seguir arrancando el backend con `NODE_ENV=development` y `LOCATION_NOTIFICATIONS_ENABLED=false`; no llamar endpoints de envío manual ni confirmar compras de prueba.
