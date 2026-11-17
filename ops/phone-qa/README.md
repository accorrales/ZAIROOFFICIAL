# Ensayo físico de etapa 6: configuración preparada, no publicada

No ejecutar la activación remota sin autorización del propietario. No cambia npm start, el deploy normal ni las reglas de Zairo.

## Opción propuesta

Una máquina de pruebas separada (propia o VM temporal), Docker Compose y **Tailscale Serve con HTTPS exclusivamente dentro de una VPN privada**. No usar Funnel, un túnel público, puertos abiertos ni las credenciales/base de producción. Se propone una red de ensayo dedicada con acceso solo para los dos teléfonos y el coordinador; revisar ACL antes de activarla. Aplicación con cuatro cuentas ficticias: dos Entrada y dos Admin para ensayar reservas concurrentes sin ampliar permisos de Entrada.

Si ya existe una máquina adecuada, el costo de hosting adicional puede ser cero. Una VM pequeña puede costar aproximadamente USD 5–15/mes, según proveedor, almacenamiento, tráfico e impuestos; es un presupuesto orientativo, no una tarifa comprobada ni una contratación. El costo/eligibilidad del plan VPN debe confirmarse en la cuenta elegida. No se contrataron recursos. Se propone mantener el ensayo activo hasta 48 horas y retirarlo después; este plazo es una propuesta, no hay apagado remoto programado.

Falta: aprobar máquina/cuenta y costo, instalar/autenticar la VPN en esa máquina y los teléfonos, restringir participantes, obtener una URL HTTPS real y verificarla desde ambos teléfonos. La VPN integrada de este cloud es de salida y no admite publicar servicios entrantes: no instalar Tailscale dentro de este executor para intentar convertirlo en servidor. La activación propuesta corresponde a una máquina externa autorizada. Este cloud no ofrece un portal HTTPS móvil declarado; sus direcciones locales/internas no sirven como prueba de acceso físico.

## Preparación offline (ya permite revisión sin publicar)

Desde el backend:

```sh
node scripts/phone-qa/prepare.cjs /RUTA/PRIVADA/NUEVA
```

Entrada: el esquema vacío de 19 tablas previamente preparado, por defecto `/workspace/local-setup/zairo-estructura.sql`; puede indicarse con PHONE_QA_SCHEMA_SOURCE. Se niega a aceptar dumps con filas y nunca copia credenciales actuales. Crea backend.env, postgres.env, compose.env y schema.sql con permisos privados; no imprime secretos. Ajustar PHONE_QA_FRONTEND si los repositorios están en otras rutas. No versionar esos archivos ni incluirlos en recursos web.

## Activación técnica — solo después de autorización

1. Trasladar los dos checkouts exactos a la máquina autorizada, sin .env, .git, node_modules ni artefactos privados. Conservar y registrar los hashes. Generar allí secretos nuevos y esquema vacío con prepare.cjs. No reutilizar los secretos generados para la comprobación local de este cloud.
2. Validar Compose sin imprimir su configuración interpolada:

```sh
docker compose --env-file /RUTA/PRIVADA/compose.env -f ops/phone-qa/compose.yaml config --quiet
docker compose --env-file /RUTA/PRIVADA/compose.env -f ops/phone-qa/compose.yaml up -d --build
```

El frontend usa build:phone-qa con /api del mismo origen. Esta configuración desactiva la inserción de CSS crítico que usa handlers inline de carga, para permitir una CSP sin scripts inline; no modifica el build de producción ni el build:verification anterior. El navegador nunca utiliza la URL Railway de producción. La API y PostgreSQL no publican puertos. La API y PostgreSQL solo participan en una red interna, sin salida a Internet. El gateway tiene una red adicional para permitir la publicación exclusiva en loopback; no contiene integraciones de mensajería ni monta credenciales, solo el subdirectorio de QR ficticios. Solo el gateway publica HTTP en **127.0.0.1:4306 del host**, para la VPN, no para los teléfonos directamente. La construcción de imágenes sí requiere acceso a registros de paquetes; no confundir esa fase con la red aislada de ejecución.
3. Sembrar **una sola vez**, sin ejecutar el verificador que consume entradas:

```sh
docker compose --env-file /RUTA/PRIVADA/compose.env -f ops/phone-qa/compose.yaml exec -e PHONE_QA_LOCAL_API=http://api:3000 api node scripts/phone-qa/seed.cjs
```

fixtures.json (privado) permite limpieza acotada; accesos.txt contiene credenciales y jamás se sirve desde la web. qr/qr.html contiene únicamente etiquetas/QR ficticios para mostrar o imprimir; solo se sirve en /ensayo/qr dentro de la VPN. Todas las entradas permanecen sin ingreso, los beneficios sin entrega y las mesas sin reserva.
4. Antes de habilitar acceso: comprobar /api/qa-safety (`phoneQA`, `emailStub` true; `whatsapp`, `notifications` false), ausencia de datos reales y membresía/ACL de la red privada. No basta con confiar en el nombre del entorno. El entrypoint elimina credenciales de mensajería antes de cargar app, sustituye correo/wallet, impide recargar .env y mantiene WhatsApp desactivado; el gateway bloquea /api/whatsapp. CSP impide conexiones externas desde el navegador.
5. En la máquina con VPN configurada y autorizada, habilitar **Serve, nunca Funnel**:

```sh
tailscale serve --bg --https=443 http://127.0.0.1:4306
tailscale serve status
```

Usar únicamente la URL observada en status, no inventar hostname. Verificar certificado válido y acceso desde iOS/Safari y Android/Chrome con VPN conectada; un dispositivo no autorizado debe quedar fuera. HTTPS en un navegador del cloud no demuestra acceso desde los teléfonos. Hasta esos resultados, el estado es pendiente.
6. Entregar accesos.txt por un canal privado autorizado, no en URL, capturas, Git ni esta documentación. En otra pantalla autorizada abrir `{URL_PRIVADA}/ensayo/qr` o imprimirla al 100 %. No publicar QR ni contraseñas. No ensayar con tickets reales.

## Limpieza al finalizar o cancelar

Primero resolver/registrar operaciones inciertas y conservar el informe sin tokens/QR/contraseñas. Después:

```sh
docker compose --env-file /RUTA/PRIVADA/compose.env -f ops/phone-qa/compose.yaml exec api node scripts/phone-qa/cleanup.cjs
tailscale serve reset
docker compose --env-file /RUTA/PRIVADA/compose.env -f ops/phone-qa/compose.yaml down --volumes
```

`serve reset` se permite solo en una máquina dedicada a este ensayo: no alterar otros servicios VPN. Eliminar los archivos privados restantes y retirar la máquina de la VPN/proveedor para detener costos. No retirar el servidor si aún se necesitan evidencias o resultados del usuario. Nunca aplicar la limpieza a producción; el guard exige nombre/usuario QA y host permitido.

## Respuesta perdida después del commit

La herramienta apropiada ya existe en `scripts/verify-operacion-usabilidad-browser.cjs`: Playwright recibe la respuesta real mediante route.fetch y luego la aborta, y se consulta el recibo original. Eso es simulación controlada de navegador con PostgreSQL real, no prueba física ni un endpoint de fallo añadido al producto. Un corte manual de Wi-Fi/datos **no demuestra** por sí solo que el servidor hubiera completado la operación. No incorporar endpoints de inyección de fallos al despliegue normal.
