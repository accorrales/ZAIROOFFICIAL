const pool = require('../config/database');
const registrarAuditoria = require('../utils/auditoria');

// Obtener todas las planillas
const obtenerPlanillas = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * 
             FROM planillas
             ORDER BY id_planilla`
        );

        res.json(result.rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Error al obtener planillas'
        });
    }
};


// Crear planilla
const crearPlanilla = async (req, res) => {
    const {
        nombre_periodo,
        fecha_inicio,
        fecha_fin
    } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO planillas
            (nombre_periodo, fecha_inicio, fecha_fin)
            VALUES ($1,$2,$3)
            RETURNING *`,
            [nombre_periodo, fecha_inicio, fecha_fin]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Error al crear planilla'
        });
    }
};


// Actualizar planilla
const actualizarPlanilla = async (req, res) => {
    const { id } = req.params;

    const {
        nombre_periodo,
        fecha_inicio,
        fecha_fin,
        estado
    } = req.body;

    try {
        const result = await pool.query(
            `UPDATE planillas
             SET nombre_periodo = $1,
                 fecha_inicio = $2,
                 fecha_fin = $3,
                 estado = $4
             WHERE id_planilla = $5
             RETURNING *`,
            [nombre_periodo, fecha_inicio, fecha_fin, estado, id]
        );

        res.json(result.rows[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Error al actualizar planilla'
        });
    }
};


// Eliminar planilla
const eliminarPlanilla = async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query(
            `DELETE FROM planillas
             WHERE id_planilla = $1`,
            [id]
        );

        res.json({
            mensaje: 'Planilla eliminada correctamente'
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Error al eliminar planilla'
        });
    }
};


// Procesar planilla
const procesarPlanilla = async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Obtener todos los empleados activos
        const empleados = await pool.query(`
            SELECT * 
            FROM empleados
            WHERE estado = true
        `);

        let totalBruto = 0;
        let totalDeducciones = 0;
        let totalNeto = 0;

        for (const empleado of empleados.rows) {
            const salarioBase = Number(empleado.salario_base);

            // 2. Buscar novedades del empleado para esta planilla
            const novedades = await pool.query(`
                SELECT 
                    n.monto,
                    c.tipo
                FROM novedades n
                INNER JOIN conceptos_pago c
                    ON n.id_concepto = c.id_concepto
                WHERE n.id_empleado = $1
                  AND n.id_planilla = $2
            `, [empleado.id_empleado, id]);

            let ingresos = 0;
            let deducciones = 0;

            // 3. Separar pagos y deducciones
            novedades.rows.forEach(n => {
                if (n.tipo === 'PAGO') {
                    ingresos += Number(n.monto);
                }

                if (n.tipo === 'DEDUCCION') {
                    deducciones += Number(n.monto);
                }
            });

            // 4. Calcular salario neto
            const salarioNeto = salarioBase + ingresos - deducciones;

            // 5. Guardar resultado en detalle_planilla
            await pool.query(`
                INSERT INTO detalle_planilla
                (id_planilla, id_empleado, salario_base, total_ingresos, total_deducciones, salario_neto)
                VALUES ($1,$2,$3,$4,$5,$6)
                ON CONFLICT (id_planilla, id_empleado)
                DO UPDATE SET
                    salario_base = EXCLUDED.salario_base,
                    total_ingresos = EXCLUDED.total_ingresos,
                    total_deducciones = EXCLUDED.total_deducciones,
                    salario_neto = EXCLUDED.salario_neto
            `, [
                id,
                empleado.id_empleado,
                salarioBase,
                ingresos,
                deducciones,
                salarioNeto
            ]);

            totalBruto += salarioBase + ingresos;
            totalDeducciones += deducciones;
            totalNeto += salarioNeto;
        }

        // 6. Actualizar totales de la planilla
        await pool.query(`
            UPDATE planillas
            SET estado = 'PROCESADA',
                fecha_proceso = NOW(),
                total_bruto = $1,
                total_deducciones = $2,
                total_neto = $3
            WHERE id_planilla = $4
        `, [totalBruto, totalDeducciones, totalNeto, id]);

        // 7. Registrar auditoría
        await registrarAuditoria(
            'planillas',
            id,
            'PROCESS',
            null,
            'Planilla procesada',
            'admin'
        );

        res.json({
            mensaje: 'Planilla procesada correctamente',
            totalBruto,
            totalDeducciones,
            totalNeto
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Error al procesar planilla'
        });
    }
};


// Obtener detalle completo de una planilla
const obtenerDetallePlanilla = async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Obtener encabezado de la planilla
        const planillaResult = await pool.query(
            `SELECT *
             FROM planillas
             WHERE id_planilla = $1`,
            [id]
        );

        if (planillaResult.rows.length === 0) {
            return res.status(404).json({
                error: 'La planilla no existe'
            });
        }

        // 2. Obtener detalle por empleado
        const detalleResult = await pool.query(
            `SELECT
                dp.id_detalle,
                dp.id_planilla,
                dp.id_empleado,
                e.cedula,
                e.nombre,
                e.apellido,
                e.puesto,
                d.nombre AS departamento,
                dp.salario_base,
                dp.total_ingresos,
                dp.total_deducciones,
                dp.salario_neto,
                dp.estado,
                dp.fecha_calculo
             FROM detalle_planilla dp
             INNER JOIN empleados e
                ON dp.id_empleado = e.id_empleado
             INNER JOIN departamentos d
                ON e.id_departamento = d.id_departamento
             WHERE dp.id_planilla = $1
             ORDER BY e.nombre, e.apellido`,
            [id]
        );

        res.json({
            planilla: planillaResult.rows[0],
            detalle: detalleResult.rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: 'Error al obtener el detalle de la planilla'
        });
    }
};


// Confirmar planilla
const confirmarPlanilla = async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Verificar si la planilla existe
        const planillaResult = await pool.query(
            `SELECT * 
             FROM planillas 
             WHERE id_planilla = $1`,
            [id]
        );

        if (planillaResult.rows.length === 0) {
            return res.status(404).json({
                error: 'La planilla no existe'
            });
        }

        const planilla = planillaResult.rows[0];

        // 2. Validar estado actual
        if (planilla.estado === 'PENDIENTE') {
            return res.status(400).json({
                error: 'No se puede confirmar una planilla pendiente. Primero debe procesarse.'
            });
        }

        if (planilla.estado === 'CONFIRMADA') {
            return res.status(400).json({
                error: 'La planilla ya fue confirmada'
            });
        }

        // 3. Confirmar planilla
        const result = await pool.query(
            `UPDATE planillas
             SET estado = 'CONFIRMADA'
             WHERE id_planilla = $1
             RETURNING *`,
            [id]
        );

        // 4. Registrar auditoría
        await registrarAuditoria(
            'planillas',
            id,
            'CONFIRM',
            'PROCESADA',
            'CONFIRMADA',
            'admin'
        );

        res.json({
            mensaje: 'Planilla confirmada correctamente',
            planilla: result.rows[0]
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: 'Error al confirmar la planilla'
        });
    }
};


module.exports = {
    obtenerPlanillas,
    crearPlanilla,
    actualizarPlanilla,
    eliminarPlanilla,
    procesarPlanilla,
    obtenerDetallePlanilla,
    confirmarPlanilla
};