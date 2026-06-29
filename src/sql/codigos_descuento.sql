-- ============================================================
--  Códigos de descuento (promociones para entradas)
--  Ejecutar una sola vez en la base de datos de producción.
-- ============================================================

CREATE TABLE IF NOT EXISTS codigos_descuento (
  id_codigo       SERIAL PRIMARY KEY,
  codigo          VARCHAR(50)  NOT NULL UNIQUE,
  descripcion     TEXT,
  -- Tipo de descuento: 'PORCENTAJE' (valor 0-100) o 'MONTO' (monto fijo en CRC)
  tipo_descuento  VARCHAR(20)  NOT NULL DEFAULT 'PORCENTAJE',
  valor           NUMERIC(12,2) NOT NULL,
  -- Evento al que aplica. NULL = aplica a todos los eventos.
  id_evento       INTEGER REFERENCES eventos(id_evento),
  -- Ventana de validez. NULL = sin restricción de fecha.
  fecha_inicio    TIMESTAMP,
  fecha_fin       TIMESTAMP,
  -- Límite de usos. NULL = ilimitado.
  usos_maximos    INTEGER,
  usos_actuales   INTEGER      NOT NULL DEFAULT 0,
  estado          BOOLEAN      NOT NULL DEFAULT true,
  fecha_creacion  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Columnas en compras_entradas para registrar el descuento aplicado.
ALTER TABLE compras_entradas
  ADD COLUMN IF NOT EXISTS id_codigo INTEGER REFERENCES codigos_descuento(id_codigo);

ALTER TABLE compras_entradas
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2);

ALTER TABLE compras_entradas
  ADD COLUMN IF NOT EXISTS descuento NUMERIC(12,2) NOT NULL DEFAULT 0;
