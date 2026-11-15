-- Historical movements remain untouched; only new movements record actual locked balances.
ALTER TABLE beneficio_movimientos ADD COLUMN IF NOT EXISTS entregada_antes INTEGER;
ALTER TABLE beneficio_movimientos ADD COLUMN IF NOT EXISTS entregada_despues INTEGER;
ALTER TABLE beneficio_movimientos ADD COLUMN IF NOT EXISTS pendiente_antes INTEGER;
ALTER TABLE beneficio_movimientos ADD COLUMN IF NOT EXISTS pendiente_despues INTEGER;
