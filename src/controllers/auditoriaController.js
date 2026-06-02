const pool = require('../config/database');

const obtenerAuditoria = async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT *
            FROM auditoria
            ORDER BY fecha_movimiento DESC
        `);

        res.json(result.rows);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: 'Error al obtener auditoría'
        });

    }

};

module.exports = {
    obtenerAuditoria
};