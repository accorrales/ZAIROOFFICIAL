const pool = require('../config/database');

const obtenerDashboard = async (req, res) => {
    try {
        const empleados = await pool.query(`
            SELECT COUNT(*) AS total
            FROM empleados
        `);

        const planillas = await pool.query(`
            SELECT COUNT(*) AS total
            FROM planillas
        `);

        const pendientes = await pool.query(`
            SELECT COUNT(*) AS total
            FROM planillas
            WHERE estado = 'PENDIENTE'
        `);

        const procesadas = await pool.query(`
            SELECT COUNT(*) AS total
            FROM planillas
            WHERE estado = 'PROCESADA'
        `);

        const confirmadas = await pool.query(`
            SELECT COUNT(*) AS total
            FROM planillas
            WHERE estado = 'CONFIRMADA'
        `);

        const totales = await pool.query(`
            SELECT
                COALESCE(SUM(total_bruto), 0) AS total_salarios,
                COALESCE(SUM(total_deducciones), 0) AS total_deducciones
            FROM planillas
            WHERE estado IN ('PROCESADA', 'CONFIRMADA')
        `);

        res.json({
            empleados: Number(empleados.rows[0].total),
            planillas: Number(planillas.rows[0].total),
            planillasPendientes: Number(pendientes.rows[0].total),
            planillasProcesadas: Number(procesadas.rows[0].total),
            planillasConfirmadas: Number(confirmadas.rows[0].total),
            totalSalarios: Number(totales.rows[0].total_salarios),
            totalDeducciones: Number(totales.rows[0].total_deducciones)
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: 'Error al obtener dashboard'
        });
    }
};

module.exports = {
    obtenerDashboard
};