-- ============================================================
--  Invalidación de entradas: historial + consistencia de estados
--
--  1. Agrega columnas para conservar el historial de una entrada
--     invalidada (qué estado tenía antes y cuándo se invalidó).
--  2. Normaliza el estado de entradas de compras PAGADAS que quedaron
--     con estado NULL o vacío por datos antiguos (antes de existir el
--     seguimiento por estado). Esas entradas ya están pagadas, así que
--     deben quedar como 'CONFIRMADA'. Sin esto, el panel no las podía
--     invalidar ("no se puede invalidar en su estado actual").
--
--  Es idempotente: se puede ejecutar varias veces sin efectos duplicados.
--  Ejecutar una sola vez en la base de datos de producción.
-- ============================================================

-- 1) Columnas de historial de invalidación.
ALTER TABLE compra_entrada_detalles
  ADD COLUMN IF NOT EXISTS estado_anterior    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS fecha_invalidacion TIMESTAMPTZ;

-- 2) Normalizar estados nulos/vacíos de entradas ya pagadas.
UPDATE compra_entrada_detalles d
SET estado = 'CONFIRMADA'
FROM compras_entradas c
WHERE c.id_compra = d.id_compra
  AND c.estado = 'PAGADA'
  AND (d.estado IS NULL OR d.estado = '');
