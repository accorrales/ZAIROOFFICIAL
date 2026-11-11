# Etapa 5 · Regresión de contabilidad y permisos

Esta etapa conserva los controladores, rutas, migraciones y reglas de cálculo existentes. Los cambios del backend se limitan a documentación y pruebas.

`accounting-access.test.js` amplía la matriz de permisos para los cinco roles sin cambiar autorizaciones. `payroll-regression.test.js` ejecuta el controlador real sobre PostgreSQL compatible (PGlite): dos empleados activos y uno inactivo, ingresos/deducciones, total bruto 33000, deducciones 2000, neto 31000; repetición idempotente sin duplicar detalles. Auditoría aislada de la prueba.

Resultado: 29 pruebas aprobadas. También se contrastan el detalle y los totales de una planilla ficticia en PostgreSQL local antes y después del rediseño, y los permisos HTTP reales con JWT de cada rol. El informe del frontend documenta los recorridos y las limitaciones de interfaz.

El rol Visor conserva el rechazo a planillas; no se amplían permisos para acomodar la interfaz. Las confirmaciones de compras, cálculos y servicios de correo no se modifican. No hay migración nueva, despliegue ni mezcla. Las notificaciones automáticas permanecen desactivadas.
