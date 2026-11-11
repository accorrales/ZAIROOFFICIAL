const content=require('../content/infamous-2026.json');
// One historical event only. Never infer a theme for new events from their name.
async function migrateLegacyEventContent(pool){
 await pool.query(`UPDATE eventos SET
  contenido_publicado=CASE WHEN publicacion='BORRADOR' THEN contenido_publicado ELSE
    $1::jsonb || COALESCE(contenido_publicado,'{}'::jsonb) || jsonb_build_object('imagen',COALESCE(NULLIF(contenido_publicado->>'imagen',''),NULLIF(imagen,''),$1::jsonb->>'imagen')) END,
  contenido_borrador=CASE WHEN publicacion='BORRADOR' THEN $1::jsonb || jsonb_build_object('imagen',COALESCE(NULLIF(imagen,''),$1::jsonb->>'imagen')) ELSE contenido_borrador END,
  revision_editorial=revision_editorial+1
 WHERE upper(btrim(nombre))='INFAMOUS'
 AND CASE WHEN pg_typeof(fecha)::text='timestamp without time zone' THEN
   (fecha::date=DATE '2026-10-31' OR (fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/Costa_Rica')::date=DATE '2026-10-31')
   ELSE (fecha AT TIME ZONE 'America/Costa_Rica')::date=DATE '2026-10-31' END
 AND contenido_borrador='{}'::jsonb
 AND NOT (COALESCE(contenido_publicado,'{}'::jsonb) ? 'historia')`,[content]);
}
module.exports={migrateLegacyEventContent};
