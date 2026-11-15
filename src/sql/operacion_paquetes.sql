-- Additive, repeatable; legacy ambiguous groups remain unassigned and require review.
ALTER TABLE entrada_tiers ADD COLUMN IF NOT EXISTS beneficios_operativos JSONB NOT NULL DEFAULT '[]', ADD COLUMN IF NOT EXISTS mesa_tipo TEXT;
ALTER TABLE compras_entradas ADD COLUMN IF NOT EXISTS paquetes_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS evento_mesas (
 id_mesa SERIAL PRIMARY KEY, id_evento INTEGER NOT NULL REFERENCES eventos(id_evento),
 identificador TEXT NOT NULL CHECK(length(identificador) BETWEEN 1 AND 40),
 zona TEXT NOT NULL CHECK(zona IN ('GENERAL','VIP')), tipo TEXT NOT NULL CHECK(length(tipo) BETWEEN 1 AND 60),
 capacidad INTEGER NOT NULL CHECK(capacidad BETWEEN 1 AND 100), UNIQUE(id_evento,identificador)
);
CREATE TABLE IF NOT EXISTS compra_paquetes (
 id_paquete SERIAL PRIMARY KEY, id_compra INTEGER NOT NULL REFERENCES compras_entradas(id_compra),
 id_evento INTEGER NOT NULL REFERENCES eventos(id_evento), numero INTEGER NOT NULL,
 promocion TEXT NOT NULL, zona TEXT NOT NULL CHECK(zona IN ('GENERAL','VIP')),
 integrantes INTEGER NOT NULL CHECK(integrantes BETWEEN 1 AND 10),
 beneficios_descripcion TEXT NOT NULL DEFAULT '', mesa_tipo TEXT, requiere_revision BOOLEAN NOT NULL DEFAULT false,
 id_mesa INTEGER REFERENCES evento_mesas(id_mesa), UNIQUE(id_compra,numero)
);
ALTER TABLE compra_paquetes ADD COLUMN IF NOT EXISTS requiere_revision BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS mesa_reserva_unica ON compra_paquetes(id_mesa) WHERE id_mesa IS NOT NULL;
ALTER TABLE compra_entrada_detalles ADD COLUMN IF NOT EXISTS id_paquete INTEGER REFERENCES compra_paquetes(id_paquete);
CREATE INDEX IF NOT EXISTS paquete_integrantes_idx ON compra_entrada_detalles(id_paquete);
CREATE TABLE IF NOT EXISTS paquete_beneficios (
 id_beneficio SERIAL PRIMARY KEY, id_paquete INTEGER NOT NULL REFERENCES compra_paquetes(id_paquete),
 nombre TEXT NOT NULL, cantidad INTEGER NOT NULL CHECK(cantidad BETWEEN 1 AND 1000),
 entregada INTEGER NOT NULL DEFAULT 0 CHECK(entregada>=0 AND entregada<=cantidad)
);
CREATE TABLE IF NOT EXISTS operaciones_acceso (
 operation_id UUID PRIMARY KEY, responsable TEXT NOT NULL, huella TEXT NOT NULL,
 estado_http INTEGER, respuesta JSONB, creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS mesa_historial (
 id SERIAL PRIMARY KEY, id_paquete INTEGER NOT NULL REFERENCES compra_paquetes(id_paquete),
 anterior INTEGER REFERENCES evento_mesas(id_mesa), nueva INTEGER REFERENCES evento_mesas(id_mesa),
 responsable TEXT NOT NULL, motivo TEXT NOT NULL, fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 operation_id UUID NOT NULL REFERENCES operaciones_acceso(operation_id)
);
CREATE TABLE IF NOT EXISTS beneficio_movimientos (
 id SERIAL PRIMARY KEY, id_paquete INTEGER NOT NULL REFERENCES compra_paquetes(id_paquete),
 id_beneficio INTEGER NOT NULL REFERENCES paquete_beneficios(id_beneficio), cantidad INTEGER NOT NULL CHECK(cantidad<>0),
 responsable TEXT NOT NULL, motivo TEXT NOT NULL, fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 operation_id UUID NOT NULL UNIQUE REFERENCES operaciones_acceso(operation_id)
);
CREATE TABLE IF NOT EXISTS cortesia_movimientos (
 id SERIAL PRIMARY KEY, id_detalle INTEGER NOT NULL REFERENCES compra_entrada_detalles(id_detalle),
 responsable TEXT NOT NULL, fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 operation_id UUID NOT NULL UNIQUE REFERENCES operaciones_acceso(operation_id)
);
-- Only provably individual legacy rows are linked. Multiple legacy attendees are
-- deliberately NOT partitioned using the current (editable) tier configuration.
INSERT INTO compra_paquetes(id_compra,id_evento,numero,promocion,zona,integrantes)
 SELECT c.id_compra,c.id_evento,1,'Entrada individual anterior',c.zona,1 FROM compras_entradas c
 WHERE c.paquetes_version=0 AND c.cantidad=1 AND c.unidades_reservadas<=1 AND c.beneficios_paquete=''
 AND (SELECT count(*) FROM compra_entrada_detalles d WHERE d.id_compra=c.id_compra)=1
 ON CONFLICT(id_compra,numero) DO NOTHING;
UPDATE compra_entrada_detalles d SET id_paquete=p.id_paquete FROM compra_paquetes p,compras_entradas c
 WHERE p.id_compra=c.id_compra AND d.id_compra=c.id_compra AND d.id_paquete IS NULL
 AND c.paquetes_version=0 AND c.cantidad=1 AND p.promocion='Entrada individual anterior';
ALTER TABLE mesa_historial ADD COLUMN IF NOT EXISTS anterior_etiqueta TEXT, ADD COLUMN IF NOT EXISTS nueva_etiqueta TEXT;
