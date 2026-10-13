ALTER TABLE entrada_tiers
  ADD COLUMN IF NOT EXISTS entradas_por_paquete INTEGER NOT NULL DEFAULT 1
    CHECK (entradas_por_paquete BETWEEN 1 AND 10);
ALTER TABLE compras_entradas
  ADD COLUMN IF NOT EXISTS unidades_reservadas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cupo_reservado BOOLEAN NOT NULL DEFAULT false;
