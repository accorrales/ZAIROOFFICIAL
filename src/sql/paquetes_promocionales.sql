ALTER TABLE entrada_tiers
  ADD COLUMN IF NOT EXISTS entradas_por_paquete INTEGER NOT NULL DEFAULT 1
    CHECK (entradas_por_paquete BETWEEN 1 AND 10);
ALTER TABLE compras_entradas
  ADD COLUMN IF NOT EXISTS unidades_reservadas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cupo_reservado BOOLEAN NOT NULL DEFAULT false;


-- Null marks legacy rows only; subsequent runs preserve explicit admin choices.
ALTER TABLE entrada_tiers
  ADD COLUMN IF NOT EXISTS zona TEXT CHECK (zona IN ('GENERAL','VIP')),
  ADD COLUMN IF NOT EXISTS beneficios_paquete TEXT NOT NULL DEFAULT '';
UPDATE entrada_tiers SET zona = CASE WHEN nombre ~* '\mVIP\M' THEN 'VIP' ELSE 'GENERAL' END WHERE zona IS NULL;
ALTER TABLE entrada_tiers ALTER COLUMN zona SET DEFAULT 'GENERAL', ALTER COLUMN zona SET NOT NULL;
ALTER TABLE compras_entradas
  ADD COLUMN IF NOT EXISTS zona TEXT CHECK (zona IN ('GENERAL','VIP')),
  ADD COLUMN IF NOT EXISTS beneficios_paquete TEXT NOT NULL DEFAULT '';
UPDATE compras_entradas c SET zona=t.zona FROM entrada_tiers t WHERE c.id_tier=t.id_tier AND c.zona IS NULL;
ALTER TABLE compras_entradas ALTER COLUMN zona SET DEFAULT 'GENERAL', ALTER COLUMN zona SET NOT NULL;
