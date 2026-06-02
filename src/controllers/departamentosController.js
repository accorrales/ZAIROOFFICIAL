const pool = require('../config/database');

// Obtener todos los departamentos
const obtenerDepartamentos = async (req, res) => {

    try {

        const result = await pool.query(
            'SELECT * FROM departamentos ORDER BY id_departamento'
        );

        res.json(result.rows);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: 'Error al obtener departamentos'
        });

    }

};


// Crear departamento
const crearDepartamento = async (req, res) => {

    const { nombre, descripcion } = req.body;

    try {

        const result = await pool.query(
            `INSERT INTO departamentos (nombre, descripcion)
             VALUES ($1,$2)
             RETURNING *`,
            [nombre, descripcion]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: 'Error al crear departamento'
        });

    }

};


// Actualizar departamento
const actualizarDepartamento = async (req, res) => {

    const { id } = req.params;
    const { nombre, descripcion } = req.body;

    try {

        const result = await pool.query(
            `UPDATE departamentos
             SET nombre = $1,
                 descripcion = $2
             WHERE id_departamento = $3
             RETURNING *`,
            [nombre, descripcion, id]
        );

        res.json(result.rows[0]);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: 'Error al actualizar departamento'
        });

    }

};


// Eliminar departamento
const eliminarDepartamento = async (req, res) => {

    const { id } = req.params;

    try {

        await pool.query(
            `DELETE FROM departamentos
             WHERE id_departamento = $1`,
            [id]
        );

        res.json({
            mensaje: 'Departamento eliminado correctamente'
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: 'Error al eliminar departamento'
        });

    }

};


module.exports = {
    obtenerDepartamentos,
    crearDepartamento,
    actualizarDepartamento,
    eliminarDepartamento
};