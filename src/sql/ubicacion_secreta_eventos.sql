-- ============================================================
--  Ubicación secreta del evento + notificaciones de envío
--  (ZAIRO LOST TRIP). Ejecutar una sola vez en la base de datos.
--  Es idempotente: usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ============================================================

-- Datos de la ubicación secreta y control de envío, en el propio evento.
ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS ubicacion_secreta_nombre         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS ubicacion_secreta_direccion       TEXT,
  ADD COLUMN IF NOT EXISTS ubicacion_secreta_google_maps_url TEXT,
  ADD COLUMN IF NOT EXISTS ubicacion_secreta_waze_url        TEXT,
  ADD COLUMN IF NOT EXISTS ubicacion_envio_habilitado        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ubicacion_enviada_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ubicacion_envio_programado_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ubicacion_visible_publicamente    BOOLEAN NOT NULL DEFAULT false;

-- Registro de cada envío de ubicación (uno por compra/comprador y evento).
CREATE TABLE IF NOT EXISTS notificaciones_ubicacion_evento (
  id               SERIAL PRIMARY KEY,
  id_evento        INTEGER NOT NULL REFERENCES eventos(id_evento) ON DELETE CASCADE,
  id_compra        INTEGER NOT NULL REFERENCES compras_entradas(id_compra) ON DELETE CASCADE,
  correo_destino   VARCHAR(255) NOT NULL,
  telefono_destino VARCHAR(50),
  estado_envio     VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado_envio IN ('PENDIENTE', 'ENVIADO', 'ERROR')),
  canal            VARCHAR(20) NOT NULL DEFAULT 'EMAIL'
                    CHECK (canal IN ('EMAIL', 'WHATSAPP', 'MANUAL')),
  error_mensaje    TEXT,
  enviado_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Evita enviar dos veces la ubicación a la misma compra del mismo evento.
  CONSTRAINT ux_notificacion_ubicacion_compra UNIQUE (id_evento, id_compra)
);

CREATE INDEX IF NOT EXISTS idx_notif_ubicacion_evento
  ON notificaciones_ubicacion_evento (id_evento);

CREATE INDEX IF NOT EXISTS idx_notif_ubicacion_estado
  ON notificaciones_ubicacion_evento (estado_envio);
