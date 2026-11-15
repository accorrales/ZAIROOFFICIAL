-- Preserve the operator's display name at the time of each new action.
-- Historical immutable account identifiers are retained; old rows use a read-time fallback.
ALTER TABLE mesa_historial ADD COLUMN IF NOT EXISTS responsable_nombre TEXT;
ALTER TABLE beneficio_movimientos ADD COLUMN IF NOT EXISTS responsable_nombre TEXT;
ALTER TABLE cortesia_movimientos ADD COLUMN IF NOT EXISTS responsable_nombre TEXT;
