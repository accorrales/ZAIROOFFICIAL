function packageQuote(tier, people, now = new Date()) {
  const size = Number(tier.entradas_por_paquete ?? 1);
  const price = Number(tier.precio);
  if (!Number.isInteger(size) || size < 1 || size > 10 || !Number.isFinite(price) || price < 0) throw new Error('Configuración de entrada inválida');
  if (!Number.isInteger(people) || people < 1 || people > 10 || people % size !== 0) throw new Error(`Agregá ${size} personas por paquete (máximo 10 entradas por compra)`);
  if (tier.estado !== true || (tier.fecha_inicio && now < new Date(tier.fecha_inicio)) || (tier.fecha_fin && now > new Date(tier.fecha_fin))) throw new Error('Esta entrada no está disponible para compra');
  const units = people / size;
  if (tier.cantidad_disponible != null && Number(tier.cantidad_disponible) < units) throw new Error('No hay disponibilidad para esa cantidad de paquetes o entradas');
  return { units, subtotal: Math.round(price * units * 100) / 100 };
}
function validateTier(body) {
  const size = Number(body.entradas_por_paquete ?? 1);
  const stock = body.cantidad_disponible == null || body.cantidad_disponible === '' ? null : Number(body.cantidad_disponible);
  if (!Number.isInteger(size) || size < 1 || size > 10) throw new Error('Entradas por paquete debe ser un entero entre 1 y 10');
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) throw new Error('El cupo debe ser un entero mayor o igual a cero');
  if (size > 1 && stock === null) throw new Error('Definí el límite de paquetes de la promoción');
  if (!String(body.nombre || '').trim() || !Number.isFinite(Number(body.precio)) || Number(body.precio) <= 0) throw new Error('Nombre y precio positivo son obligatorios');
  for (const date of [body.fecha_inicio, body.fecha_fin]) if (date && !Number.isFinite(new Date(date).getTime())) throw new Error('Revisá las fechas de la entrada');
  if (body.estado !== undefined && typeof body.estado !== 'boolean') throw new Error('El estado debe ser activo o inactivo');
  if (body.fecha_inicio && body.fecha_fin && body.fecha_inicio > body.fecha_fin) throw new Error('La fecha de cierre debe ser posterior al inicio');
  return { size, stock };
}
module.exports = { packageQuote, validateTier };
