-- ============================================================
--  Reto 70: códigos de descuento creados por los clientes.
--  Idempotente: se aplica al arrancar desde ensureSchema.
-- ============================================================

-- origen: 'ADMIN' (creado desde el panel) o 'CLIENTE' (registro público).
-- campana: identificador de la campaña a la que pertenece el código.
ALTER TABLE codigos_descuento
  ADD COLUMN IF NOT EXISTS origen            VARCHAR(20)  NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN IF NOT EXISTS campana           VARCHAR(40),
  ADD COLUMN IF NOT EXISTS contacto_nombre   VARCHAR(120),
  ADD COLUMN IF NOT EXISTS contacto_email    VARCHAR(160),
  ADD COLUMN IF NOT EXISTS contacto_telefono VARCHAR(30);

-- Un solo código por persona (correo y teléfono) en cada campaña.
CREATE UNIQUE INDEX IF NOT EXISTS ux_codigos_campana_email
  ON codigos_descuento (campana, LOWER(contacto_email))
  WHERE campana IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_codigos_campana_telefono
  ON codigos_descuento (campana, contacto_telefono)
  WHERE campana IS NOT NULL;
