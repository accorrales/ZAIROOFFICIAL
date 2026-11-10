# Etapa 1 — base funcional (10 noviembre 2026)

Entorno de desarrollo local; sin despliegue ni cambios visuales. Checkouts originales inicialmente limpios, dependencias ya instaladas, sin worktrees adicionales.

## Preparación y arranque

Se leyó `/workspace/environment-start.md`. PostgreSQL 18.6 conserva 19 tablas y los eventos inicialmente estaban vacíos. Docker local inició con `/workspace/local-setup/start-database.sh`. Credenciales locales y JWT presentes en el archivo privado; destino de DATABASE_URL comprobado como loopback. Resend figura ready en la configuración del entorno; se comprobó presencia, no validez remota ni entrega.

```sh
bash /workspace/local-setup/start-database.sh
cd /workspace/ZAIROOFFICIAL
NODE_ENV=development LOCATION_NOTIFICATIONS_ENABLED=false node --env-file=/workspace/local-setup/backend.env src/app.js
```

Nunca imprimir el archivo privado. No ejecutar endpoints de prueba de correo, confirmación de compras o notificación manual durante este diagnóstico. WhatsApp permanece sin configurar. El frontend ahora usa `/api` con proxy local en desarrollo; el reemplazo de producción conserva su configuración existente.

## Evidencia

- Arranque y dos ejecuciones adicionales consecutivas de `ensureSchema`, sin errores; 19 tablas después de migrar.
- Backend `node --test`: 22/22. Antes: 17/21, cuatro fallas por reloj posterior al cierre de campaña. Se fijó únicamente el reloj de prueba dentro del VM y se agregó rechazo de registro posterior al cierre, sin cambiar fechas de negocio.
- Frontend `npm test -- --watch=false`: 44/44 en 16 archivos. Algunos tests existentes generan solicitudes locales y registran errores HTTP esperados; no son mocks completos.
- `npm run build` frontend correcto tras desactivar inlining de fuentes. Antes fallaba por HTTP 403 de fonts.googleapis.com. Permanecen advertencias CommonJS de jsPDF y dependencias. Bundle inicial: 343.34 kB; transferencia estimada 95.23 kB. No equivale a una prueba de velocidad móvil.
- Backend build es un script informativo, no compilación ni validación; la evidencia útil son las pruebas y el arranque.
- Smoke real vía proxy del frontend: `/api/health` 200, consulta PostgreSQL de `/` correcta, eventos 200 inicialmente `[]`, creación y consulta de evento ficticio y ocultamiento de ubicación privada.
- Login real bcrypt/JWT con usuarios ficticios para admin, contabilidad, rrhh y entrada. Empleados: 200 para los tres primeros, 403 para entrada. Usuarios: solo admin 200. Todos los eventos administrativos: admin/contabilidad 200, rrhh/entrada 403. Sin token, token inválido o vencido: 401.
- Chromium/Playwright: Angular renderiza home con evento ficticio, panel de eventos recibe API local 200 y contabilidad es redirigida al intentar usuarios. Sin errores JavaScript. Se bloquearon todas las solicitudes externas antes de navegar; solo se observaron intentos de fuentes Google y analytics Vercel, bloqueados. No hubo acceso a producción.
- Usuarios y evento ficticios eliminados al finalizar; no compras ni correos en la base local durante el smoke. Las pruebas de compra usan PGlite y servicios de correo/wallet simulados.
- `git diff --check` correcto en ambos repositorios.

Los logs y el script de integración de esta sesión están en `/workspace/work/`; no contienen tokens ni contraseñas. Los servicios de desarrollo quedan activos y deberán reiniciarse si se reemplaza el entorno.

## Base existente para próximas etapas

Ya existen panel de eventos, tiers/promociones, contabilidad, permisos y escáner. La prueba de paquetes comprueba seis VIP con mesa/bebidas, seis UUID únicos, inventario transaccional, precios y rechazo de doble confirmación. Se conserva esa implementación.

La validación QR actual actualiza cada integrante por separado y condiciona el UPDATE a CONFIRMADA para impedir reutilización; esto se revisó en código, no se hizo una prueba de escaneo concurrente en PostgreSQL local. Los beneficios compartidos son texto en la compra: no existe un registro específico de entrega de mesa/botellas por paquete. Esa trazabilidad, resumen del grupo y pruebas de llegadas separadas/concurrentes quedan para la etapa 6. La cortesía individual actual se registra al validar acceso y debe distinguirse de entrega de beneficios compartidos.

Pendientes fuera de esta etapa: identidad permanente, edición editorial con preview, portada/megaeventos, consistencia del panel y permisos UI/API (por ejemplo eventos permite contabilidad en API pero su pantalla está restringida a admin), ledger de beneficios compartidos y rendimiento móvil. Las fuentes siguen siendo externas; evaluar autoalojarlas en la etapa visual. Resend real, WhatsApp y wallet no fueron probados contra servicios externos.
