const pool = require('../config/database');
const registrarAuditoria = require('../utils/auditoria');

// Obtener todas las novedades
const obtenerNovedades = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                n.id_novedad,
                n.id_empleado,
                n.id_planilla,
                n.id_concepto,
                e.nombre || ' ' || e.apellido AS empleado,
                p.nombre_periodo AS planilla,
                c.nombre AS concepto,
                c.tipo,
                n.cantidad,
                n.monto,
                n.observacion,
                n.fecha_registro
            FROM novedades n
            INNER JOIN empleados e
                ON n.id_empleado = e.id_empleado
            INNER JOIN planillas p
                ON n.id_planilla = p.id_planilla
            INNER JOIN conceptos_pago c
                ON n.id_concepto = c.id_concepto
            ORDER BY n.id_novedad
        `);

        res.json(result.rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Error al obtener novedades'
        });
    }
};


// Crear novedad
const crearNovedad = async (req, res) => {
    const {
        id_empleado,
        id_planilla,
        id_concepto,
        cantidad,
        monto,
        observacion
    } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO novedades
            (id_empleado, id_planilla, id_concepto, cantidad, monto, observacion)
            VALUES ($1,$2,$3,$4,$5,$6)
            RETURNING *`,
            [id_empleado, id_planilla, id_concepto, cantidad, monto, observacion]
        );

        await registrarAuditoria(
            'novedades',
            result.rows[0].id_novedad,
            'INSERT',
            null,
            JSON.stringify(result.rows[0]),
            'admin'
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Error al crear novedad'
        });
    }
};


// Actualizar novedad
const actualizarNovedad = async (req, res) => {
    const { id } = req.params;
    const {
        cantidad,
        monto,
        observacion
    } = req.body;

    try {
        const anterior = await pool.query(
            `SELECT * FROM novedades WHERE id_novedad = $1`,
            [id]
        );

        if (anterior.rows.length === 0) {
            return res.status(404).json({
                error: 'La novedad no existe'
            });
        }

        const result = await pool.query(
            `UPDATE novedades
             SET cantidad = $1,
                 monto = $2,
                 observacion = $3
             WHERE id_novedad = $4
             RETURNING *`,
            [cantidad, monto, observacion, id]
        );

        await registrarAuditoria(
            'novedades',
            Number(id),
            'UPDATE',
            JSON.stringify(anterior.rows[0]),
            JSON.stringify(result.rows[0]),
            'admin'
        );

        res.json(result.rows[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Error al actualizar novedad'
        });
    }
};


// Eliminar novedad
const eliminarNovedad = async (req, res) => {
    const { id } = req.params;

    try {
        const anterior = await pool.query(
            `SELECT * FROM novedades WHERE id_novedad = $1`,
            [id]
        );

        if (anterior.rows.length === 0) {
            return res.status(404).json({
                error: 'La novedad no existe'
            });
        }

        await pool.query(
            `DELETE FROM novedades
             WHERE id_novedad = $1`,
            [id]
        );

        await registrarAuditoria(
            'novedades',
            Number(id),
            'DELETE',
            JSON.stringify(anterior.rows[0]),
            null,
            'admin'
        );

        res.json({
            mensaje: 'Novedad eliminada correctamente'
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Error al eliminar novedad'
        });
    }
};


module.exports = {
    obtenerNovedades,
    crearNovedad,
    actualizarNovedad,
    eliminarNovedad
};