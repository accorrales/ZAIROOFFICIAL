const pool = require('../config/database');

const TIPOS_VALIDOS = ['PORCENTAJE', 'MONTO'];

const normalizarCodigo = (codigo) =>
  (codigo || '').toString().trim().toUpperCase();

/**
 * Valida un código contra un evento y subtotal dados.
 * Devuelve { ok, error, codigo, descuento, total } sin tocar la base.
 * Se usa tanto en el endpoint público de validación como al crear la compra.
 */
const evaluarCodigo = async (codigoTexto, idEvento, subtotal) => {
  const codigo = normalizarCodigo(codigoTexto);

  if (!codigo) {
    return { ok: false, error: 'Debe ingresar un código de descuento' };
  }

  const result = await pool.query(
    `SELECT * FROM codigos_descuento WHERE UPPER(codigo) = $1 LIMIT 1`,
    [codigo]
  );

  const promo = result.rows[0];

  if (!promo) {
    return { ok: false, error: 'El código no existe' };
  }

  if (!promo.estado) {
    return { ok: false, error: 'El código está desactivado' };
  }

  const ahora = new Date();

  if (promo.fecha_inicio && ahora < new Date(promo.fecha_inicio)) {
    return { ok: false, error: 'El código todavía no está disponible' };
  }

  if (promo.fecha_fin && ahora > new Date(promo.fecha_fin)) {
    return { ok: false, error: 'El código ya expiró' };
  }

  if (
    promo.id_evento !== null &&
    Number(promo.id_evento) !== Number(idEvento)
  ) {
    return { ok: false, error: 'El código no aplica para este evento' };
  }

  if (
    promo.usos_maximos !== null &&
    promo.usos_actuales >= promo.usos_maximos
  ) {
    return { ok: false, error: 'El código alcanzó su límite de usos' };
  }

  const base = Number(subtotal) || 0;
  let descuento = 0;

  if (promo.tipo_descuento === 'PORCENTAJE') {
    descuento = base * (Number(promo.valor) / 100);
  } else {
    descuento = Number(promo.valor);
  }

  // El descuento nunca puede superar el subtotal.
  descuento = Math.min(descuento, base);
  descuento = Math.round(descuento * 100) / 100;

  const total = Math.round((base - descuento) * 100) / 100;

  return { ok: true, codigo: promo, descuento, total };
};

// ====================== CRUD admin ======================

// Listar todos los códigos (incluye nombre del evento si aplica)
const listarCodigos = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, e.nombre AS evento
       FROM codigos_descuento c
       LEFT JOIN eventos e ON e.id_evento = c.id_evento
       ORDER BY c.fecha_creacion DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener códigos de descuento' });
  }
};

const obtenerCodigoPorId = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT c.*, e.nombre AS evento
       FROM codigos_descuento c
       LEFT JOIN eventos e ON e.id_evento = c.id_evento
       WHERE c.id_codigo = $1
       LIMIT 1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Código no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el código' });
  }
};

const crearCodigo = async (req, res) => {
  const {
    codigo,
    descripcion,
    tipo_descuento,
    valor,
    id_evento,
    fecha_inicio,
    fecha_fin,
    usos_maximos,
    estado
  } = req.body;

  const codigoNorm = normalizarCodigo(codigo);
  const tipo = (tipo_descuento || 'PORCENTAJE').toUpperCase();

  if (!codigoNorm) {
    return res.status(400).json({ error: 'El código es obligatorio' });
  }

  if (!TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo de descuento inválido' });
  }

  if (valor === null || valor === undefined || isNaN(Number(valor)) || Number(valor) <= 0) {
    return res.status(400).json({ error: 'El valor del descuento debe ser mayor a 0' });
  }

  if (tipo === 'PORCENTAJE' && Number(valor) > 100) {
    return res.status(400).json({ error: 'El porcentaje no puede ser mayor a 100' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO codigos_descuento
       (codigo, descripcion, tipo_descuento, valor, id_evento, fecha_inicio, fecha_fin, usos_maximos, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        codigoNorm,
        descripcion || null,
        tipo,
        Number(valor),
        id_evento || null,
        fecha_inicio || null,
        fecha_fin || null,
        usos_maximos || null,
        estado === undefined ? true : estado
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un código con ese nombre' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al crear el código' });
  }
};

const actualizarCodigo = async (req, res) => {
  const { id } = req.params;
  const {
    codigo,
    descripcion,
    tipo_descuento,
    valor,
    id_evento,
    fecha_inicio,
    fecha_fin,
    usos_maximos,
    estado
  } = req.body;

  const codigoNorm = normalizarCodigo(codigo);
  const tipo = (tipo_descuento || 'PORCENTAJE').toUpperCase();

  if (!codigoNorm) {
    return res.status(400).json({ error: 'El código es obligatorio' });
  }

  if (!TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo de descuento inválido' });
  }

  if (valor === null || valor === undefined || isNaN(Number(valor)) || Number(valor) <= 0) {
    return res.status(400).json({ error: 'El valor del descuento debe ser mayor a 0' });
  }

  if (tipo === 'PORCENTAJE' && Number(valor) > 100) {
    return res.status(400).json({ error: 'El porcentaje no puede ser mayor a 100' });
  }

  try {
    const result = await pool.query(
      `UPDATE codigos_descuento
       SET codigo = $1,
           descripcion = $2,
           tipo_descuento = $3,
           valor = $4,
           id_evento = $5,
           fecha_inicio = $6,
           fecha_fin = $7,
           usos_maximos = $8,
           estado = $9
       WHERE id_codigo = $10
       RETURNING *`,
      [
        codigoNorm,
        descripcion || null,
        tipo,
        Number(valor),
        id_evento || null,
        fecha_inicio || null,
        fecha_fin || null,
        usos_maximos || null,
        estado === undefined ? true : estado,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Código no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un código con ese nombre' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar el código' });
  }
};

const eliminarCodigo = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM codigos_descuento WHERE id_codigo = $1 RETURNING id_codigo`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Código no encontrado' });
    }

    res.json({ mensaje: 'Código eliminado correctamente' });
  } catch (error) {
    // Si el código ya fue usado en compras, no se puede borrar por la FK.
    if (error.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar: el código ya fue usado en compras. Desactivalo en su lugar.'
      });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar el código' });
  }
};

const desactivarCodigo = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE codigos_descuento SET estado = false WHERE id_codigo = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Código no encontrado' });
    }

    res.json({ mensaje: 'Código desactivado', codigo: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al desactivar el código' });
  }
};

const reactivarCodigo = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE codigos_descuento SET estado = true WHERE id_codigo = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Código no encontrado' });
    }

    res.json({ mensaje: 'Código reactivado', codigo: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al reactivar el código' });
  }
};

// ====================== Validación pública ======================

// Valida un código para mostrarle al comprador el descuento antes de comprar.
const validarCodigo = async (req, res) => {
  const { codigo, id_evento, subtotal } = req.body;

  try {
    const resultado = await evaluarCodigo(codigo, id_evento, subtotal);

    if (!resultado.ok) {
      return res.status(400).json({ valido: false, message: resultado.error });
    }

    const promo = resultado.codigo;

    res.json({
      valido: true,
      message: 'Código aplicado correctamente',
      codigo: promo.codigo,
      tipo_descuento: promo.tipo_descuento,
      valor: Number(promo.valor),
      descuento: resultado.descuento,
      subtotal: Number(subtotal) || 0,
      total: resultado.total
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ valido: false, message: 'Error al validar el código' });
  }
};

module.exports = {
  listarCodigos,
  obtenerCodigoPorId,
  crearCodigo,
  actualizarCodigo,
  eliminarCodigo,
  desactivarCodigo,
  reactivarCodigo,
  validarCodigo,
  // helpers reutilizables
  evaluarCodigo,
  normalizarCodigo
};
