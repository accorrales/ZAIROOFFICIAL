-- ============================================================
--  Módulo WhatsApp Business (WhatsApp Cloud API de Meta)
--
--  Tablas para: conversaciones, mensajes, comprobantes de pago
--  (con OCR + validación) e historial de estados de compra.
--
--  Diseño multi-evento (todo cuelga de compras_entradas / eventos).
--  Preparado para crecer a un CRM (la conversación se ancla por
--  teléfono, base natural de una futura tabla `clientes`).
--
--  Es idempotente: usa IF NOT EXISTS. Se ejecuta al arrancar el
--  servidor desde ensureSchema.js (igual que el resto del esquema).
--  Ejecutable múltiples veces sin efectos duplicados.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Conversaciones de WhatsApp (una por número de teléfono).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id               SERIAL PRIMARY KEY,
  phone_number     VARCHAR(32)  NOT NULL,
  contact_name     VARCHAR(255),
  current_state    VARCHAR(40)  NOT NULL DEFAULT 'NEW',
  compra_id        INTEGER REFERENCES compras_entradas(id_compra) ON DELETE SET NULL,
  evento_id        INTEGER REFERENCES eventos(id_evento) ON DELETE SET NULL,
  needs_human      BOOLEAN      NOT NULL DEFAULT false,
  last_message_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_whatsapp_conversation_phone UNIQUE (phone_number)
);

CREATE INDEX IF NOT EXISTS idx_wa_conv_compra  ON whatsapp_conversations (compra_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_evento  ON whatsapp_conversations (evento_id);
CREATE INDEX IF NOT EXISTS idx_wa_conv_state   ON whatsapp_conversations (current_state);

-- ------------------------------------------------------------
-- 2) Mensajes (entrantes y salientes) de cada conversación.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                   SERIAL PRIMARY KEY,
  conversation_id      INTEGER NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  whatsapp_message_id  VARCHAR(128),
  direction            VARCHAR(10)  NOT NULL DEFAULT 'INBOUND'
                        CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  message_type         VARCHAR(20)  NOT NULL DEFAULT 'TEXT'
                        CHECK (message_type IN ('TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO', 'STATUS', 'OTHER')),
  body                 TEXT,
  media_id             VARCHAR(128),
  media_url            TEXT,
  status               VARCHAR(30),
  raw_payload          JSONB,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_msg_conversation ON whatsapp_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_wamid        ON whatsapp_messages (whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_created      ON whatsapp_messages (created_at);

-- ------------------------------------------------------------
-- 3) Comprobantes de pago recibidos (imagen/documento) + OCR.
--    El binario se guarda en `file_data` (bytea) para no depender
--    del disco efímero de Railway. Se sirve por endpoint admin.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_receipts (
  id                   SERIAL PRIMARY KEY,
  compra_id            INTEGER REFERENCES compras_entradas(id_compra) ON DELETE SET NULL,
  conversation_id      INTEGER REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  whatsapp_message_id  VARCHAR(128),
  file_data            BYTEA,
  file_url             TEXT,
  file_type            VARCHAR(100),
  file_name            VARCHAR(255),
  file_size            INTEGER,
  file_sha256          VARCHAR(64),
  ocr_text             TEXT,
  detected_amount      NUMERIC(12,2),
  detected_date        VARCHAR(40),
  detected_time        VARCHAR(20),
  detected_reference   VARCHAR(120),
  detected_bank        VARCHAR(120),
  detected_destination VARCHAR(160),
  detected_recipient   VARCHAR(160),
  confidence_score     INTEGER,
  validation_status    VARCHAR(30)  NOT NULL DEFAULT 'RECEIVED'
                        CHECK (validation_status IN (
                          'RECEIVED', 'OCR_PENDING', 'OCR_PROCESSED', 'LIKELY_VALID',
                          'NEEDS_REVIEW', 'POSSIBLE_DUPLICATE', 'REJECTED', 'APPROVED'
                        )),
  validation_notes     TEXT,
  reviewed_by          VARCHAR(120),
  reviewed_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipt_compra  ON payment_receipts (compra_id);
CREATE INDEX IF NOT EXISTS idx_receipt_conv    ON payment_receipts (conversation_id);
CREATE INDEX IF NOT EXISTS idx_receipt_status  ON payment_receipts (validation_status);
CREATE INDEX IF NOT EXISTS idx_receipt_sha     ON payment_receipts (file_sha256);
CREATE INDEX IF NOT EXISTS idx_receipt_ref     ON payment_receipts (detected_reference);

-- ------------------------------------------------------------
-- 4) Historial de cambios de estado de compra (auditoría).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_status_history (
  id           SERIAL PRIMARY KEY,
  compra_id    INTEGER NOT NULL REFERENCES compras_entradas(id_compra) ON DELETE CASCADE,
  old_status   VARCHAR(30),
  new_status   VARCHAR(30) NOT NULL,
  reason       TEXT,
  source       VARCHAR(30) NOT NULL DEFAULT 'SYSTEM',
  created_by   VARCHAR(120),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_hist_compra ON purchase_status_history (compra_id);
