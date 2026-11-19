-- Additive, repeatable migration. Existing paid/pending purchases are untouched.
ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS mostrar_en_home BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publicacion TEXT,
  ADD COLUMN IF NOT EXISTS ventas_abiertas BOOLEAN,
  ADD COLUMN IF NOT EXISTS destacado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contenido_borrador JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contenido_publicado JSONB,
  ADD COLUMN IF NOT EXISTS revision_editorial INTEGER NOT NULL DEFAULT 0;
-- Preserve the existing home selection, including explicitly hidden active events.
UPDATE eventos SET publicacion = CASE WHEN estado THEN 'PUBLICADO' WHEN mostrar_en_home THEN 'PROXIMAMENTE' ELSE 'BORRADOR' END
WHERE publicacion IS NULL;
-- Initialize the new sales flag only. Past/undated events must not start selling.
-- Re-runs preserve explicit editorial choices made after the migration.
UPDATE eventos SET ventas_abiertas = (COALESCE(estado,false) AND publicacion = 'PUBLICADO' AND COALESCE(fecha > CURRENT_TIMESTAMP,false)) WHERE ventas_abiertas IS NULL;
UPDATE eventos SET contenido_publicado = jsonb_build_object(
  'nombre',nombre,'descripcion',COALESCE(descripcion,''),'fecha',fecha,'ubicacion',COALESCE(ubicacion,''),
  'precio',precio,'imagen',COALESCE(imagen,''))
WHERE contenido_publicado IS NULL AND publicacion <> 'BORRADOR';
ALTER TABLE eventos ALTER COLUMN publicacion SET DEFAULT 'BORRADOR', ALTER COLUMN publicacion SET NOT NULL,
  ALTER COLUMN ventas_abiertas SET DEFAULT false, ALTER COLUMN ventas_abiertas SET NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='eventos_publicacion_check') THEN
  ALTER TABLE eventos ADD CONSTRAINT eventos_publicacion_check CHECK (publicacion IN ('BORRADOR','PROXIMAMENTE','PUBLICADO'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='eventos_venta_publicada_check') THEN
  ALTER TABLE eventos ADD CONSTRAINT eventos_venta_publicada_check CHECK (NOT ventas_abiertas OR publicacion='PUBLICADO');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='eventos_destacado_visible_check') THEN
  ALTER TABLE eventos ADD CONSTRAINT eventos_destacado_visible_check CHECK (NOT destacado OR (mostrar_en_home AND publicacion <> 'BORRADOR'));
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS eventos_un_destacado ON eventos ((true)) WHERE destacado;
