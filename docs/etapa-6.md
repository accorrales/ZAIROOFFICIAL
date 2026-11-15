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
