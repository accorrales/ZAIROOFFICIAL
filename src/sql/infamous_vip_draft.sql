-- MANUAL ONLY: review event identity and allocate exclusive VIP quota before activation.
-- This file is deliberately excluded from ensureSchema / application startup.
DO $$
DECLARE event_id INTEGER;
BEGIN
  IF (SELECT COUNT(*) FROM eventos WHERE UPPER(nombre) LIKE '%INFAMOUS%'
      AND (fecha AT TIME ZONE 'America/Costa_Rica')::date = DATE '2026-10-31') <> 1 THEN
    RAISE EXCEPTION 'Se requiere exactamente un evento INFAMOUS del 31 octubre 2026';
  END IF;
  SELECT id_evento INTO event_id FROM eventos WHERE UPPER(nombre) LIKE '%INFAMOUS%'
    AND (fecha AT TIME ZONE 'America/Costa_Rica')::date = DATE '2026-10-31';
  PERFORM 1 FROM eventos WHERE id_evento = event_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM entrada_tiers WHERE id_evento = event_id
    AND nombre = 'INFAMOUS · VIP Red Bull · 6 entradas') THEN
    INSERT INTO entrada_tiers
      (id_evento,nombre,descripcion,precio,entradas_por_paquete,zona,beneficios_paquete,cantidad_disponible,estado)
    VALUES (event_id,'INFAMOUS · VIP Red Bull · 6 entradas','EL LLAMADO DE LAS ALMAS · 31 octubre 2026',
      75000,6,'VIP','1 mesa Red Bull tipo hotel, 1 litro de Jack Daniel''s y 4 Red Bulls',5,false);
  END IF;
END $$;
