const pool = require('../config/database');

// Obtener todos los empleados con su departamento
const obtenerEmpleados = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        e.id_empleado,
        e.cedula,
        e.nombre,
        e.apellido,
        e.correo,
        e.telefono,
        e.direccion,
        e.puesto,
        e.salario_base,
        e.fecha_ingreso,
        e.estado,
        e.id_departamento,
        d.nombre AS departamento
      FROM empleados e
      INNER JOIN departamentos d
        ON e.id_departamento = d.id_departamento
      ORDER BY e.id_empleado
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Error al obtener empleados'
    });
  }
};

// Crear empleado
const crearEmpleado = async (req, res) => {
  const {
    cedula,
    nombre,
    apellido,
    correo,
    telefono,
    direccion,
    puesto,
    salario_base,
    fecha_ingreso,
    id_departamento
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO empleados
      (cedula, nombre, apellido, correo, telefono, direccion, puesto, salario_base, fecha_ingreso, id_departamento)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        cedula,
        nombre,
        apellido,
        correo,
        telefono,
        direccion,
        puesto,
        salario_base,
        fecha_ingreso,
        id_departamento
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Error al crear empleado'
    });
  }
};

// Actualizar empleado
const actualizarEmpleado = async (req, res) => {
  const { id } = req.params;
  const {
    cedula,
    nombre,
    apellido,
    correo,
    telefono,
    direccion,
    puesto,
    salario_base,
    fecha_ingreso,
    estado,
    id_departamento
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE empleados
       SET cedula = $1,
           nombre = $2,
           apellido = $3,
           correo = $4,
           telefono = $5,
           direccion = $6,
           puesto = $7,
           salario_base = $8,
           fecha_ingreso = $9,
           estado = $10,
           id_departamento = $11
       WHERE id_empleado = $12
       RETURNING *`,
      [
        cedula,
        nombre,
        apellido,
        correo,
        telefono,
        direccion,
        puesto,
        salario_base,
        fecha_ingreso,
        estado,
        id_departamento,
        id
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Error al actualizar empleado'
    });
  }
};

// Eliminar empleado
const eliminarEmpleado = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `DELETE FROM empleados
       WHERE id_empleado = $1`,
      [id]
    );

    res.json({
      mensaje: 'Empleado eliminado correctamente'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Error al eliminar empleado'
    });
  }
};

module.exports = {
  obtenerEmpleados,
  crearEmpleado,
  actualizarEmpleado,
  eliminarEmpleado
};