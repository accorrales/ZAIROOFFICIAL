BEGIN;

-- La selección general de la compra.
ALTER TABLE compras_entradas
  ADD COLUMN IF NOT EXISTS bebida_cortesia VARCHAR(20);

-- La cortesía que pertenece a cada QR individual.
ALTER TABLE compra_entrada_detalles
  ADD COLUMN IF NOT EXISTS bebida_cortesia VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cortesia_tiquete_entregado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cortesia_tiquete_entregado_en TIMESTAMPTZ;

-- Sincroniza compras pendientes/antiguas que ya tengan la selección guardada.
UPDATE compra_entrada_detalles d
SET bebida_cortesia = c.bebida_cortesia
FROM compras_entradas c
WHERE c.id_compra = d.id_compra
  AND d.bebida_cortesia IS NULL
  AND c.bebida_cortesia IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compras_entradas_bebida_cortesia_check'
      AND conrelid = 'compras_entradas'::regclass
  ) THEN
    ALTER TABLE compras_entradas
      ADD CONSTRAINT compras_entradas_bebida_cortesia_check
      CHECK (
        bebida_cortesia IS NULL
        OR bebida_cortesia IN ('PUNCH_CLUB', 'SOLEO')
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compra_entrada_detalles_bebida_cortesia_check'
      AND conrelid = 'compra_entrada_detalles'::regclass
  ) THEN
    ALTER TABLE compra_entrada_detalles
      ADD CONSTRAINT compra_entrada_detalles_bebida_cortesia_check
      CHECK (
        bebida_cortesia IS NULL
        OR bebida_cortesia IN ('PUNCH_CLUB', 'SOLEO')
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compra_entrada_detalles_cortesia_entregada_check'
      AND conrelid = 'compra_entrada_detalles'::regclass
  ) THEN
    ALTER TABLE compra_entrada_detalles
      ADD CONSTRAINT compra_entrada_detalles_cortesia_entregada_check
      CHECK (
        cortesia_tiquete_entregado = FALSE
        OR bebida_cortesia IS NOT NULL
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compra_entrada_detalles_cortesia_fecha_check'
      AND conrelid = 'compra_entrada_detalles'::regclass
  ) THEN
    ALTER TABLE compra_entrada_detalles
      ADD CONSTRAINT compra_entrada_detalles_cortesia_fecha_check
      CHECK (
        (
          cortesia_tiquete_entregado = FALSE
          AND cortesia_tiquete_entregado_en IS NULL
        )
        OR
        (
          cortesia_tiquete_entregado = TRUE
          AND cortesia_tiquete_entregado_en IS NOT NULL
        )
      );
  END IF;
END
$$;

COMMIT;
