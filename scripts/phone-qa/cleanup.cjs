const {guard}=require('./guard.cjs');guard();
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),pool=require('../../src/config/database');
const root=process.env.PHONE_QA_PRIVATE_DIR||'/qa-private',file=path.join(root,'fixtures.json');
(async()=>{
 const f=JSON.parse(fs.readFileSync(file));assert.ok(f.tag&&Array.isArray(f.events)&&Array.isArray(f.users)&&(f.events.length||f.users.length));
 const c=await pool.connect();try{
  await c.query('BEGIN');const events=f.events,ids=f.users.map(u=>u.id),actors=f.users.map(u=>u.rol+':'+u.id);
  await c.query('DELETE FROM beneficio_movimientos WHERE id_paquete IN (SELECT id_paquete FROM compra_paquetes WHERE id_evento=ANY($1::int[]))',[events]);
  await c.query('DELETE FROM mesa_historial WHERE id_paquete IN (SELECT id_paquete FROM compra_paquetes WHERE id_evento=ANY($1::int[]))',[events]);
  await c.query('DELETE FROM cortesia_movimientos WHERE id_detalle IN (SELECT d.id_detalle FROM compra_entrada_detalles d JOIN compras_entradas c ON c.id_compra=d.id_compra WHERE c.id_evento=ANY($1::int[]))',[events]);
  await c.query('DELETE FROM operaciones_acceso WHERE responsable=ANY($1::text[])',[actors]);
  await c.query('DELETE FROM purchase_status_history WHERE compra_id IN (SELECT id_compra FROM compras_entradas WHERE id_evento=ANY($1::int[]))',[events]);
  await c.query('DELETE FROM compra_entrada_detalles WHERE id_compra IN (SELECT id_compra FROM compras_entradas WHERE id_evento=ANY($1::int[]))',[events]);
  await c.query('DELETE FROM paquete_beneficios WHERE id_paquete IN (SELECT id_paquete FROM compra_paquetes WHERE id_evento=ANY($1::int[]))',[events]);
  for(const table of ['compra_paquetes','compras_entradas','entrada_tiers','evento_mesas'])await c.query('DELETE FROM '+table+' WHERE id_evento=ANY($1::int[])',[events]);
  await c.query('DELETE FROM eventos WHERE id_evento=ANY($1::int[])',[events]);
  await c.query('DELETE FROM usuarios WHERE id_usuario=ANY($1::int[])',[ids]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 for(const name of ['fixtures.json','accesos.txt','qr.html'])fs.rmSync(path.join(root,name),{force:true});
 fs.rmSync(path.join(root,'qr','qr.html'),{force:true});
 console.log('Only tagged rehearsal data, credentials and QR sheets removed; reports retained.');
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>pool.end());
