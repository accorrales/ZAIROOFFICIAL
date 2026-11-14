# Etapa 5 · Regresión de contabilidad y permisos

Esta etapa conserva los controladores, rutas, migraciones y reglas de cálculo existentes. Los cambios del backend se limitan a documentación y pruebas.

`accounting-access.test.js` amplía la matriz de permisos para los cinco roles sin cambiar autorizaciones. `payroll-regression.test.js` ejecuta el controlador real sobre PostgreSQL compatible (PGlite): dos empleados activos y uno inactivo, ingresos/deducciones, total bruto 33000, deducciones 2000, neto 31000; repetición idempotente sin duplicar detalles. Auditoría aislada de la prueba.

Resultado: 29 pruebas aprobadas. También se contrastan el detalle y los totales de una planilla ficticia en PostgreSQL local antes y después del rediseño, y los permisos HTTP reales con JWT de cada rol. El informe del frontend documenta los recorridos y las limitaciones de interfaz.

El rol Visor conserva el rechazo a planillas; no se amplían permisos para acomodar la interfaz. Las confirmaciones de compras, cálculos y servicios de correo no se modifican. No hay migración nueva, despliegue ni mezcla. Las notificaciones automáticas permanecen desactivadas.

## Revisión final de etapa 5

El CSV de ventas declara `Precio (CRC)` y conserva el contenido numérico existente: punto decimal, sin código de moneda ni separadores de agrupación en las celdas. La prueba `sales-csv-regression.test.js` verifica moneda, números utilizables y escape de campos. `node --test`: 30 pruebas aprobadas. No se modifican consultas SQL, cálculos ni importes persistidos. Se corrige el acceso previo de cualquier JWT a `/api/dashboard`: ahora utiliza requiereRoles(admin, rrhh, contabilidad), rechazando Visor/Entrada y manteniendo a los tres roles autorizados. Antes se reprodujo 200 con totales salariales para Visor; después se verifica 403 para Visor/Entrada y 401 sin sesión. La matriz de pruebas cubre los cinco roles. Ver el informe `docs/etapa-5-cierre.md` del frontend para revisión visual y pruebas locales de exportaciones.
