-- ============================================================
--  Fix de zona horaria en las fechas de entrada_tiers
--  (fecha_inicio / fecha_fin).
--
--  Convierte las columnas a TIMESTAMPTZ interpretando los valores
--  actuales como hora de Costa Rica (UTC-6, sin horario de verano).
--  A partir de aquí el backend guarda y devuelve la hora exacta que
--  el admin selecciona en el formulario.
--
--  Es idempotente: si las columnas ya son timestamptz, no hace nada.
--  Ejecutar una sola vez.
-- ============================================================

DO $$
BEGIN
  IF (
    SELECT data_type
    FROM information_schema.columns
    WHERE table_name = 'entrada_tiers'
      AND column_name = 'fecha_inicio'
  ) = 'timestamp without time zone' THEN

    ALTER TABLE entrada_tiers
      ALTER COLUMN fecha_inicio TYPE timestamptz
        USING fecha_inicio AT TIME ZONE 'America/Costa_Rica',
      ALTER COLUMN fecha_fin TYPE timestamptz
        USING fecha_fin AT TIME ZONE 'America/Costa_Rica';

  END IF;
END $$;

-- Nota: el estado 'INVALIDADA' de compra_entrada_detalles no requiere
-- migración porque la columna 'estado' es de texto. El panel admin solo
-- agrega ese nuevo valor posible.
