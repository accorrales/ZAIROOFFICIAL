ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS mostrar_en_home BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN eventos.mostrar_en_home IS
  'Permite mostrar un evento inactivo en el Home como teaser/Próximamente sin habilitar ventas ni exponer detalles privados.';
