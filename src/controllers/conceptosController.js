const { respondAdminError, recordNotFound } = require('../utils/adminErrors');
const pool = require('../config/database');


// Obtener todos los conceptos
const obtenerConceptos = async (req, res) => {

    try {

        const result = await pool.query(
            'SELECT * FROM conceptos_pago ORDER BY id_concepto'
        );

        res.json(result.rows);

    } catch (error) {
        return respondAdminError(res, error, 'concepto', 'consultar');
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
        return respondAdminError(res, error, 'concepto', 'crear');
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

        if (!result.rows.length) return recordNotFound(res, 'concepto');
        res.json(result.rows[0]);

    } catch (error) {
        return respondAdminError(res, error, 'concepto', 'actualizar');
    }
};


// Eliminar concepto
const eliminarConcepto = async (req, res) => {

    const { id } = req.params;

    try {

        const result = await pool.query(
            `DELETE FROM conceptos_pago
             WHERE id_concepto = $1 RETURNING id_concepto`,
            [id]
        );

        if (!result.rows.length) return recordNotFound(res, 'concepto');
        res.json({
            mensaje: 'Concepto eliminado correctamente'
        });

    } catch (error) {
        return respondAdminError(res, error, 'concepto', 'eliminar');
    }
};


module.exports = {
    obtenerConceptos,
    crearConcepto,
    actualizarConcepto,
    eliminarConcepto
};