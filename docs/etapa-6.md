# Etapa 6 · Integridad operativa

## Modelo y migración

`src/sql/operacion_paquetes.sql` es aditiva, repetible y requerida por ensureSchema antes de abrir el servidor. Crea siete tablas: evento_mesas, compra_paquetes, paquete_beneficios, operaciones_acceso, mesa_historial, beneficio_movimientos y cortesia_movimientos. Añade configuración operativa al tier, versión de paquetes a compras y FK id_paquete a cada entrada individual. No elimina ni reescribe importes, fechas o compras anteriores.

La creación existente de compra sigue bloqueando el tier y descontando cupos por unidades de paquete. En la misma transacción, después de crear las personas, createPackages particiona por orden estable del formulario: primeras seis en paquete 1, siguientes seis en paquete 2, etc. Conserva promoción, zona, tamaño, descripción, tipo de mesa y cantidades de beneficios adquiridos. El límite de personas pasa de 10 a 60 para permitir varios paquetes de seis, sin cambiar precio/cálculo por paquete ni las restricciones de edad/códigos.

Las filas antiguas inequívocamente individuales (una persona y sin beneficios compartidos) se vinculan de forma idempotente a un paquete individual anterior. Las demás no se reparten a partir del tier actual. El escaneo válido puede continuar, pero informa revisión y no inventa derechos de mesa ni entregas. Configuración nueva que solo tenga texto descriptivo y no cantidades/tipo verificables también queda señalada para revisión.

## Transacciones e idempotencia

Cada mutación exige operation_id UUID. Se inserta una operación vinculada al responsable JWT, se bloquea su fila y se contrasta la huella de tipo, parámetros y cuerpo. Una repetición idéntica devuelve la respuesta guardada; otra solicitud o responsable con esa clave se rechaza. El efecto y el recibo se confirman juntos. Los rechazos de negocio usan SAVEPOINT y conservan el resultado sin efectos. Un fallo inesperado revierte toda la transacción y responde como no verificable, permitiendo reintentar con la misma clave.

El escaneo bloquea primero la compra y luego la entrada. Exige compra PAGADA, evento seleccionado correcto, estado CONFIRMADA, fecha_ingreso nula y ausencia de invalidación. Registra una única fecha de ingreso. No marca beneficios ni tiquetes individuales como entregados. La ruta anterior /compras-entradas/validar-qr delega en el mismo controlador; ya exige evento y operación. Se aceptan UUID, URL /t/ y JSON de ticket compatibles.

La asignación bloquea paquete y mesa, valida evento/zona/tipo/capacidad y derecho comprado. Un índice único de id_mesa impide reservas duplicadas también bajo concurrencia. Cambios se registran con IDs y etiquetas históricas de mesa, responsable, fecha y motivo. No se infiere ocupación física de un escaneo. Una mesa reservada no se puede reconfigurar hasta desasignarla.

La entrega bloquea su beneficio, exige saldo suficiente y actualiza cantidad y movimiento en la misma transacción. CHECK limita entregada entre cero e incluida. Una corrección administrativa agrega un movimiento negativo con motivo; no borra el registro original. Los tiquetes de cortesía individual conservan sus columnas anteriores y tienen una acción/auditoría independiente.

## API y permisos

Todas las rutas /api/operacion requieren JWT y rol admin o entrada; no-store. Consultas y respuestas operativas no contienen precios, totales contables, correos, teléfonos, nacimientos, UUID de otros integrantes ni ubicaciones secretas.

| Acción | Admin | Entrada | Contabilidad / RRHH / Visor |
|---|---|---|---|
| Eventos operativos, recepción, grupo | Sí | Sí | No |
| Escanear / consultar QR sin ingreso | Sí | Sí | No |
| Configurar mesas y asignar/desasignar | Sí | No | No |
| Entrega positiva / tiquete individual | Sí | Sí | No |
| Corrección negativa con motivo | Sí | No | No |
| Recuperar operación propia | Sí | Sí | No |

Rutas: GET eventos; GET recepcion?id_evento; GET paquetes/:id?id_evento; GET operaciones/:uuid; POST escanear; POST consultar-qr (solo lectura); POST mesas y mesas/:id; POST paquetes/:id/mesa; POST paquetes/:id/entrega; POST entradas/:id/cortesia. Las mutaciones llevan id_evento y operation_id; entrega añade id_beneficio/cantidad y motivo para corrección. No se amplían permisos financieros ni acceso a usuarios.

## Pruebas y reproducción segura

`node --test`: 32 pruebas aprobadas, incluidas configuración y migración repetible, snapshots separados e inmutables y límites de cantidad. Las regresiones existentes de precios, ventas, privacidad, campañas y contabilidad siguen pasando. `npm run build` en backend es únicamente un placeholder.

Se comprobó además con PostgreSQL local real y solicitudes HTTP concurrentes: seis llegadas, General, dos paquetes por compra, dos sesiones para un QR, otro evento, invalidada y no pagada; reserva concurrente y cambios con historial; entregas parciales/completas, clave repetida, carreras, límites y corrección; tiquete individual separado; roles y privacidad; migración repetida con compra antigua ambigua; edición de oferta sin modificar lo adquirido. El recorrido de interfaz completó compra ficticia, confirmación de pago, admisión y entrega. Chromium abortó respuestas DESPUÉS de procesarlas y recuperó los resultados tras recargar sin duplicaciones. Ver informe frontend para capturas y tiempos.

Servidor QA, separado de la aplicación normal y con sustitución de correo/wallet ANTES de cargar app:

```sh
ZAIRO_OPERATION_TEST=1 NODE_ENV=development LOCATION_NOTIFICATIONS_ENABLED=false PORT=3002 node --env-file=/workspace/local-setup/backend.env scripts/serve-operacion-qa.cjs
ZAIRO_OPERATION_TEST=1 node --env-file=/workspace/local-setup/backend.env scripts/verify-operacion-local.cjs
ZAIRO_OPERATION_TEST=1 node --env-file=/workspace/local-setup/backend.env scripts/cleanup-operacion-local.cjs
```

El verificador exige base y API loopback, opt-in explícito y marcador QA de correo simulado antes de crear datos. Usa correos .invalid, claves aleatorias y guarda credenciales temporales con modo 0600 fuera del repositorio. La limpieza elimina solo las entidades de los eventos y usuarios ficticios registrados, incluyendo sus movimientos y recibos. No ejecutar contra producción. No hubo correos, WhatsApp real, despliegue ni mezcla; las notificaciones automáticas permanecieron desactivadas.

## Límites

Sin aprobación offline, plano gráfico ni confirmación automática de ocupación. Revisión humana de paquetes antiguos ambiguos; no se deducen derechos del texto histórico. La cámara se ensayó con video sintético, no hardware físico. La actualización del escáner y backend debe ser conjunta porque evento y operation_id son obligatorios. Las migraciones deben verificarse antes de abrir acceso operativo; un fallo requerido impide el arranque.

Cierre verificado: los fixtures de los eventos y usuarios ficticios, compras, paquetes, mesas, movimientos y recibos operativos fueron eliminados mediante la limpieza acotada. No se incorporaron credenciales, entradas, capturas ni datos de la base a Git.

## Cierre de usabilidad y operación (posterior a b2c61f3)

Se revisaron informe y flujos existentes; se conserva la implementación transaccional de acceso, paquetes, reservas y entregas. Los cambios funcionales del cierre son principalmente de frontend; no se alteran precios, cálculos contables, exportaciones, confirmaciones, estados de compra, distribución de paquetes ni permisos.

- Nueva migración **aditiva, repetible y obligatoria** `src/sql/operacion_auditoria_nombres.sql`: añade `responsable_nombre` nullable a mesa_historial, beneficio_movimientos y cortesia_movimientos. Se aplica después de operacion_paquetes.sql y antes de abrir el servidor. Las acciones nuevas toman el nombre del usuario dentro de la transacción; los IDs originales y recibos permanecen. No requiere rellenar ni modificar compras existentes.
- La consulta del grupo proyecta el nombre del beneficio desde su snapshot y el nombre histórico del responsable; para filas antiguas usa el nombre actual de su cuenta, o «Personal autorizado» si no está disponible. No puede reconstruirse un nombre histórico que nunca se guardó. Se preservan fecha, cantidad, motivo, etiquetas de mesa y movimiento original de cada corrección.
- `GET /api/operacion/mesas?id_evento` reutiliza la proyección mínima de mesas de recepción y los mismos roles Admin/Entrada. Permite al escáner consultar únicamente mesas cuando necesita la configuración administrativa, sin descargar paquetes/miembros del evento. No amplía permisos de asignación, edición o corrección ni entrega datos financieros/contactos/ubicaciones.
- Las respuestas transaccionales confirmadas, incluidas repeticiones y rechazos guardados, exponen `X-Zairo-Operation-Id` después de COMMIT. Se habilita la lectura CORS de ese encabezado en esas respuestas; no se agregan orígenes. El frontend distingue así un rechazo definitivo guardado de un 4xx externo a la transacción, por ejemplo sesión vencida al recuperar una solicitud cuyo efecto podría haberse confirmado. Los errores sin recibo no autorizan a descartar ni reemplazar una operación incierta.
- La recuperación sigue vinculada a usuario y UUID. No hay aprobación offline ni efecto optimista. Los locks, índice único de reserva, CHECK de saldos, permisos y snapshots adquiridos quedan intactos.

### Verificación del cierre

`node --test`: 32 pruebas aprobadas; se amplió la prueba de migración con repetición, movimientos de entrega/corrección y nombres preservados. `npm run build` sigue siendo un placeholder. El verificador HTTP local conserva todos los casos anteriores de concurrencia, integridad y roles; añade el endpoint mínimo a la matriz de cinco roles, repetición de la migración de auditoría y nombres que permanecen tras renombrar usuarios ficticios.

`ZAIRO_OPERATION_TEST=1 node --env-file=/workspace/local-setup/backend.env scripts/verify-operacion-usabilidad-browser.cjs` requiere el servidor QA, fixtures recién creados por verify-operacion-local, frontend optimizado local en 4302, Playwright/Chromium/ffmpeg disponibles en el entorno. Genera cámara sintética y bloquea tráfico ajeno a loopback. Usa la base local y se niega a funcionar sin opt-in. No es una prueba con teléfonos físicos y consume los QR ficticios de la corrida.

Chromium abortó **después** de recibir/procesar la respuesta real del servidor: ingreso, entrega y reserva quedaron confirmados en base, pero la interfaz conservó estado incierto. Tras cerrar/navegar/recargar, leer el recibo o reenviar la misma identidad produjo un solo efecto e historial. Corrección administrativa con motivo visible y saldos actualizados; sin borrado de movimientos. Las compras existentes mantuvieron exactamente subtotal, descuento y total durante todos los flujos operativos. También se repitió compra pública ficticia de dos paquetes, confirmación desde panel, ingreso y entrega explícita, con segundo paquete intacto; correo simulado y WhatsApp interceptado, sin mensajes reales.

Frontend: 79 pruebas y builds normal/verification aprobados. Ver su informe para capturas, mediciones separadas, estados de carga/error/vacío, respuesta tardía, navegación/foco y guía breve de ensayo pendiente en dos teléfonos físicos. Sin cambios de contabilidad/exportación, despliegue, mezcla o etapa 7. Notificaciones automáticas desactivadas durante toda la verificación.

Limpieza final comprobada: fixtures ficticios eliminados de forma acotada; compra_paquetes, paquete_beneficios, evento_mesas, mesa_historial, beneficio_movimientos, cortesia_movimientos y operaciones_acceso quedaron con cero filas. No se incluyeron credenciales, secretos, datos de base ni capturas en Git. Entrega de evidencia y límites físicos documentados en frontend.

## Tres ajustes menores del cierre

Se conserva b417af7 y los commits anteriores. Único cambio de datos/API: migración requerida, aditiva y repetible **operacion_saldos_historicos.sql**, después de operacion_auditoria_nombres.sql. Añade cuatro INTEGER nullable a beneficio_movimientos: entregada_antes, entregada_despues, pendiente_antes y pendiente_despues. Las filas anteriores permanecen intactas con NULL; no hay backfill a partir del saldo actual.

Cada nuevo movimiento de entrega/corrección conserva los cuatro saldos reales a partir del beneficio bloqueado mediante FOR UPDATE, dentro de la misma transacción del movimiento y recibo. Se exponen al consultar el historial del paquete. Una operación posterior no modifica ese snapshot. No cambia la aritmética del saldo, sus límites, permisos, motivos obligatorios, locks, exclusividad de mesas ni idempotencia. La corrección sigue siendo administrativa y negativa; no se añaden correcciones positivas ni se interpreta devolución física.

Verificación: **32 pruebas backend aprobadas**. Prueba SQL de migración repetida con movimientos antiguos conserva cantidades, responsable y motivo y deja saldos históricos NULL. HTTP/PostgreSQL real conserva las regresiones de concurrencia/roles/snapshots y verifica corrección 4 → 3 entregados / 0 → 1 pendientes; tras registrar otra entrega y volver a 4, el historial permanece idéntico. Dos aplicaciones de la migración en PostgreSQL real con movimientos existentes no modificaron sus filas. Build backend es el placeholder existente.

Frontend: **82 pruebas**, builds normal/verification y verificación Chromium en computadora, 360/390 px y 360×440 aprobados. Un solo aviso incierto, recuperación de clave original sin duplicación, saldos históricos explícitos, referencia del paquete/mesa en encabezado fijo, reserva incierta sin falsa confirmación, nombres largos, cierre/foco y contexto conservados. Registros antiguos incompletos muestran limitación; no se calculan saldos retrospectivos. Ver informe frontend para evidencia.

Datos exclusivamente ficticios y servidor QA local con correo sustituido antes de cargar app, notificaciones automáticas false y WhatsApp desactivado. Navegador bloquea tráfico externo. Sin cambios financieros/exportaciones, despliegues, mezclas, mensajes reales o etapa 7. No se probaron teléfonos físicos: QR manual y viewports emulados.

Limpieza del ajuste: fixtures eliminados de forma acotada y siete tablas operativas verificadas vacías. Capturas y ZIP fuera de Git; no se incluyeron secretos, credenciales ni datos de la base.

## Preparación del ensayo con dos teléfonos físicos

Se conservaron a48bd95 y los commits anteriores. Se revisaron los informes frontend/backend y la configuración disponible. Solo se encontró preparación local y referencias externas a producción; no una instancia de pruebas HTTPS verificable desde los teléfonos. El entorno cloud declara acceso SSH, no un portal web móvil. No se contactó la base ni la API de producción, ni se supuso que una dirección local/interna fuera accesible desde un teléfono.

Se preparó `ops/phone-qa/compose.yaml` y su README: opción temporal en máquina separada, HTTPS mediante Tailscale Serve **solo VPN privada**, sin Funnel ni puertos públicos. API/DB en red interna, sin publicación de puertos ni salida a Internet. Gateway únicamente en loopback del host, con red adicional necesaria para esa publicación local; solo monta QR ficticios, no credenciales. El entrypoint de ensayo es independiente de npm start: exige base/usuario dedicados, host permitido, opt-in, JWT nuevo y notificaciones false; rechaza parámetros que puedan sustituir la conexión. Elimina credenciales de mensajería antes de cargar app, impide recargar .env y sustituye correo/wallet; WhatsApp desactivado. No se modifican reglas de negocio, permisos ni cálculos.

Los scripts prepare/seed/cleanup generan secretos privados, esquema vacío y datos de ensayo **sin consumirlos**: dos eventos ficticios, dos paquetes de seis VIP de una misma compra, snapshots de beneficios 1+4, General, otro evento, seis QR de cámara y casos dedicados para simultaneidad/sin red; 22 QR en total, tres mesas compatibles, dos cuentas Entrada y dos Admin para asignaciones simultáneas sin ampliar permisos de puerta. QR imprimibles separados del archivo de credenciales; ambos fuera de Git. La limpieza elimina únicamente el conjunto etiquetado.

**Comprobación local completada, no física:** 33 pruebas Node backend (incluido guard), 82 frontend Angular y una prueba Node del gateway. Imágenes Docker construidas y stack ejecutado con API/DB aisladas; cuatro inicios de sesión, permisos, grupos, snapshots 1+4 y 22 imágenes QR/PDF imprimibles comprobados. Se corrigieron permisos de lectura de los contenedores y la disponibilidad del gateway solo en loopback. La política CSP de la compilación de ensayo permite el base href del mismo origen; se comprobó recarga de /admin/kiosk y recuperación. En este cloud, la construcción requirió montar la CA del proxy como secreto BuildKit, conservando validación TLS; no se incluyó en las imágenes.

La simulación controlada recibió respuestas reales después del commit y las abortó en Playwright para ingreso, entrega y reserva. La recuperación reutilizó la identidad original, con un solo POST y un solo efecto por operación. No se añadió un endpoint de fallo al producto. Apagar Wi-Fi manualmente no demuestra el punto exacto de pérdida. Evidencia resumida sin secretos: `docs/ensayo-telefonos-preparacion.json`.

**Pendiente:** autorizar máquina/cuenta, costo y participantes VPN; activar HTTPS privado; comprobar URL/certificado desde ambos equipos; recibir resultados físicos por bloque. Opción/costos orientativos y alcance están en ops/phone-qa/README.md. No se creó host remoto, VPN, publicación, cuenta de proveedor ni gasto contratado. La instancia local de comprobación no es una URL para los teléfonos y sus QR no deben presentarse como definitivos del ensayo remoto.

La guía y matriz de resultados están en frontend `docs/ensayo-dos-telefonos-etapa-6.md` y CSV asociado. Información inicial del usuario: iOS/Safari y Android/Chrome, modelos no informados; asignación A/B propuesta, sin resultados físicos. Todos los casos físicos permanecen pendientes. La validación para operación en un evento **no se da por completada** sin esos resultados. Sin despliegue público/producción, mezcla, mensajes reales ni etapa 7.

Cierre de preflight: se comprobó la limpieza de cuentas, eventos, compras y tablas operativas; se retiraron contenedores, redes y volumen dedicados y se eliminaron credenciales y QR locales. Se conservaron solo informes/logs sin secretos e imágenes de aplicación sin datos. La VPN integrada del cloud es de salida, no una publicación entrante para teléfonos; la opción preparada necesita una máquina externa autorizada. Las instrucciones de activación no se ejecutaron remotamente.


## Preparación de producción: visibilidad y ventas heredadas (2026-11-19)

Ajuste autorizado por el usuario después del ensayo de restauración: la migración editorial conserva `mostrar_en_home` en lugar de activar eventos previamente ocultos. Inicializa `ventas_abiertas` solo para eventos habilitados, publicados y con fecha futura; fechas pasadas o ausentes quedan cerradas. Solo inicializa valores NULL: no modifica elecciones editoriales existentes al repetir la migración. No toca compras, estados, importes ni cupos reservados.

Verificación automática: 34/34 pruebas backend, incluida una regresión PostgreSQL/PGlite con eventos pasados visibles/ocultos, futuro, fecha ausente, anuncio, repetición y compras pendientes/pagadas intactas. El build backend sigue siendo un script informativo, no una compilación.

Evidencia aportada por el usuario mediante capturas de PowerShell/Windows (no ejecutada desde este entorno): respaldo de la base utilizada por el backend, restauración PostgreSQL 18 aislada sin red, 19 tablas y coincidencia de conteos/huellas antes de migrar. Ensayo de la versión anterior de las migraciones en dos pasadas: las otras 18 tablas conservaron todas las columnas originales; en eventos solo cambió `mostrar_en_home`. Hay 173 compras pendientes de eventos pasados, 109 con cupo reservado; no se crearon compras en las últimas 48 horas de la consulta. Configuración automática de ubicaciones no habilitada. Esta evidencia NO equivale a haber probado el nuevo ajuste sobre esa copia ni a haber desplegado.

Pendiente antes de despliegue: repetir ensayo desde el respaldo original con el ajuste nuevo, verificar selección de portada y ventas cerradas de los eventos pasados, conservar las 173 compras pendientes y saldos/reservas; revisar empaquetado para excluir herramientas QA, versiones activas/rollback, actualización coordinada y verificaciones posteriores. No restaurar un snapshot antiguo sobre nuevas escrituras reales. No se han ejecutado migraciones de producción, despliegues ni envíos como parte de este ajuste. El respaldo contiene datos reales: permanece privado en el equipo del usuario, fuera de Git.


### Ensayo corregido y empaquetado de producción

El usuario confirmó con capturas la restauración del respaldo original en `zairo_seguro`, las dos pasadas del candidato 68cfa60 y la coincidencia de todas las filas/columnas originales de las 19 tablas. Se verificó en esa copia que los eventos pasados quedan con venta cerrada y que la selección previa de portada se conserva. La prueba fue en Windows/Docker del usuario; no una conexión SQL desde este agente.

El despliegue se prepara con Dockerfile y railway.toml: Node 24, dependencias npm de producción, código src y recursos propios, usuario no privilegiado, puerto 8080 y healthcheck /api/health. El contexto excluye ops, scripts, docs, pruebas, .git y archivos .env. El certificado del proxy del ejecutor se usa solo como secreto opcional BuildKit durante la comprobación local; no se copia a la imagen ni se desactiva TLS. No se cambian secretos ni integraciones legítimas.

Versiones previas registradas por conectores antes de integrar: Railway deployment 6bb45d61-5b81-4033-9251-a56ba9bafc9a, backend49633fb; Vercel alias www.zairoclub.com deployment dpl_Hfx6ins2rD8hWng8mA34mZVU4abG, frontendb526f5f. Plan de reversión: detener promoción ante fallos; si el problema es visual, volver el frontend al deployment anterior conservando el backend compatible. Las migraciones son aditivas pero las versiones antiguas no aplican publicación/venta independientes ni la nueva idempotencia: no efectuar rollback ciego del backend con operaciones nuevas. Preferir corrección hacia delante; si es imprescindible volver toda la aplicación, suspender nuevas escrituras, comprobar/reconciliar movimientos desde el respaldo y ejecutar un procedimiento de recuperación autorizado. Nunca sobrescribir escrituras nuevas con el dump antiguo. Conservar el respaldo privado original fuera de Git y sin borrarlo al retirar los contenedores de verificación.

Verificación de release local: 34/34 backend, 82/82 frontend, build Angular producción aprobado. La imagen backend se construyó para comprobar empaquetado y dependencias sin credenciales de producción. Este apartado describe preparación; el despliegue y sus verificaciones se registran por separado cuando se observe su estado terminal.


Comprobación de imagen completada: 65 archivos JavaScript válidos, dependencias bcrypt/pg/uuid cargadas como usuario no privilegiado y ausencia de scripts/ops/docs/.env/.git/pruebas. Se corrigió la propiedad del package.json antes de publicar. Arranque real de la imagen con PostgreSQL 18 ficticio en una red Docker interna sin acceso saliente: /api/health200, /200 con consulta SQL, /api/eventos200 y /api/empleados401 sin sesión; migraciones de arranque sin fallos. Para inicializar el cliente de correo en ese ensayo se usó una cadena ficticia sin validez; no había credenciales reales ni red saliente. Se retiraron los dos contenedores y la red del ensayo.
