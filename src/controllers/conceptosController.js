const pool = require('../config/database');


// Obtener todos los conceptos
const obtenerConceptos = async (req, res) => {

    try {

        const result = await pool.query(
            'SELECT * FROM conceptos_pago ORDER BY id_concepto'
        );

        res.json(result.rows);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: 'Error al obtener conceptos'
        });

    }

};


// Crear concepto
const crearConcepto = async (req, res) => {

    const {
        nombre,
        tipo,
        descripcion,
        porcentaje,
        monto_fijo
    } = req.body;

    try {

        const result = await pool.query(
            `INSERT INTO conceptos_pago
            (nombre, tipo, descripcion, porcentaje, monto_fijo)
            VALUES ($1,$2,$3,$4,$5)
            RETURNING *`,
            [nombre, tipo, descripcion, porcentaje, monto_fijo]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: 'Error al crear concepto'
        });

    }

};


// Actualizar concepto
const actualizarConcepto = async (req, res) => {

    const { id } = req.params;

    const {
        nombre,
        tipo,
        descripcion,
        porcentaje,
        monto_fijo,
        estado
    } = req.body;

    try {

        const result = await pool.query(
            `UPDATE conceptos_pago
             SET nombre = $1,
                 tipo = $2,
                 descripcion = $3,
                 porcentaje = $4,
                 monto_fijo = $5,
                 estado = $6
             WHERE id_concepto = $7
             RETURNING *`,
            [nombre, tipo, descripcion, porcentaje, monto_fijo, estado, id]
        );

        res.json(result.rows[0]);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: 'Error al actualizar concepto'
        });

    }

};


// Eliminar concepto
const eliminarConcepto = async (req, res) => {

    const { id } = req.params;

    try {

        await pool.query(
            `DELETE FROM conceptos_pago
             WHERE id_concepto = $1`,
            [id]
        );

        res.json({
            mensaje: 'Concepto eliminado correctamente'
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: 'Error al eliminar concepto'
        });

    }

};


module.exports = {
    obtenerConceptos,
    crearConcepto,
    actualizarConcepto,
    eliminarConcepto
};