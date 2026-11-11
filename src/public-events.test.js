const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const express=require('express');
const jwt=require('jsonwebtoken');
const {PGlite}=require('@electric-sql/pglite');
const {defaults,validateContent}=require('./utils/eventContent');
const {migrateLegacyEventContent}=require('./config/legacyEventContent');
async function database(dateType='TIMESTAMPTZ'){
 const db=new PGlite();await db.exec(`CREATE TABLE eventos(id_evento SERIAL PRIMARY KEY,nombre TEXT,descripcion TEXT,fecha ${dateType},ubicacion TEXT,precio NUMERIC,imagen TEXT,estado BOOLEAN,mostrar_en_home BOOLEAN,ubicacion_visible_publicamente BOOLEAN DEFAULT false,ubicacion_secreta_direccion TEXT);
 CREATE TABLE entrada_tiers(id_tier SERIAL PRIMARY KEY,id_evento INT,nombre TEXT,descripcion TEXT,precio NUMERIC,cantidad_disponible INT,entradas_por_paquete INT,zona TEXT,beneficios_paquete TEXT,estado BOOLEAN,fecha_inicio TIMESTAMPTZ,fecha_fin TIMESTAMPTZ);`);
 await db.exec(fs.readFileSync(require.resolve('./sql/eventos_editoriales.sql'),'utf8'));return db;
}
test('HTTP public catalogue, closed sales, tier privacy, secret locations and editor roles',async()=>{
 const db=await database();
 const mock=(file,exports)=>{const key=require.resolve(file);require.cache[key]={id:key,filename:key,loaded:true,exports};};
 mock('./config/database',{query:(sql,args)=>db.query(sql,args),connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}})});
 mock('./services/emailService',new Proxy({}, {get:()=>()=>{throw new Error('Email forbidden in this test');}}));
 for(let id=1;id<=5;id++){
  const c=validateContent(defaults({nombre:`Ficticio ${id}`,fecha:'2099-12-01',historia:''}));c.historia='Public story';c.artistas=[{nombre:'Artista ficticio',descripcion:'',imagen:''}];
  const publication=id===2?'BORRADOR':id===3?'PROXIMAMENTE':'PUBLICADO';
  await db.query(`INSERT INTO eventos(id_evento,nombre,fecha,estado,publicacion,ventas_abiertas,mostrar_en_home,destacado,contenido_publicado,contenido_borrador,ubicacion_secreta_direccion) VALUES($1,$2,$3,$4,$5,$4,$6,$7,$8,$9,'PRIVATE ADDRESS')`,[id,c.nombre,c.fecha,id===4,publication,id!==2&&id!==5,id===4,c,{...c,historia:'PRIVATE DRAFT'}]);
 }
 await db.exec(`INSERT INTO entrada_tiers(id_evento,nombre,precio,cantidad_disponible,entradas_por_paquete,zona,beneficios_paquete,estado) VALUES (1,'VIP 6',75000,3,6,'VIP','Mesa y bebidas',true),(1,'PRIVATE TIER',1000,42,1,'GENERAL','',false);`);
 const app=express();app.use(express.json());app.use('/api/eventos',require('./routes/eventosRoutes'));app.use('/api/entrada-tiers',require('./routes/entradaTiersRoutes'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 process.env.JWT_SECRET='public-contract-unit-test-only';
 async function get(path,status=200,role,method='GET') {const r=await fetch(base+path,{method,headers:role?{Authorization:'Bearer '+jwt.sign({rol:role},process.env.JWT_SECRET)}:{}});assert.equal(r.status,status,path);return {body:await r.json(),headers:r.headers};}
 try {
  const list=await get('/api/eventos');assert.deepEqual(list.body.map(e=>e.id_evento),[4,1,3]);assert.equal(list.headers.get('cache-control'),'no-store');
  const text=JSON.stringify(list.body);for(const hidden of ['PRIVATE ADDRESS','PRIVATE DRAFT','Public story','Artista ficticio','contenido_borrador'])assert.ok(!text.includes(hidden));
  await get('/api/eventos/2',404);await get('/api/eventos/3',404);
  const detail=(await get('/api/eventos/1')).body;assert.equal(detail.estado,false);assert.equal(detail.contenido.historia,'Public story');assert.ok(!JSON.stringify(detail).includes('PRIVATE'));
  const tiers=(await get('/api/entrada-tiers/evento/1')).body;assert.equal(tiers.length,1);assert.equal(tiers[0].nombre,'VIP 6');assert.equal(tiers[0].cantidad_disponible,undefined);
  await get('/api/entrada-tiers/evento/2',404);await get('/api/entrada-tiers/evento/3',404);assert.equal((await get('/api/entrada-tiers/admin/evento/1',200,'admin')).body.length,2);
  await db.query('UPDATE eventos SET ubicacion_visible_publicamente=true WHERE id_evento=1');assert.equal((await get('/api/eventos/1')).body.ubicacion_secreta_direccion,'PRIVATE ADDRESS');
  for(const [path,method] of [['/api/eventos/1/contenido','GET'],['/api/eventos/1/contenido','PUT'],['/api/eventos/1/publicacion','POST']]){await get(path,401,undefined,method);await get(path,403,'contabilidad',method);}
  assert.equal((await get('/api/eventos/1/contenido',200,'admin')).body.contenido.historia,'PRIVATE DRAFT');
 }finally{await new Promise(r=>server.close(r));await db.close();}
});
test('legacy INFAMOUS migration is dated, repeatable and never replaces editorial changes',async()=>{
 const db=await database();
 for(let id=1;id<=4;id++) await db.query(`INSERT INTO eventos(id_evento,nombre,fecha,estado,publicacion,ventas_abiertas,mostrar_en_home,contenido_publicado,contenido_borrador) VALUES($1,'INFAMOUS',$2,true,'PUBLICADO',true,true,$3,$4)`,[id,id===2?'2099-11-01T02:00:00Z':'2026-11-01T02:00:00Z',id===4?{historia:'Historia editada'}:{nombre:'INFAMOUS',fecha:'2026-11-01T02:00:00Z',imagen:''},id===3?{concepto:'Borrador en curso'}:{}]);
 await migrateLegacyEventContent(db);const first=(await db.query('SELECT * FROM eventos WHERE id_evento=1')).rows[0];await migrateLegacyEventContent(db);const all=(await db.query('SELECT * FROM eventos ORDER BY id_evento')).rows;
 assert.equal(all[0].revision_editorial,first.revision_editorial);assert.equal(all[0].contenido_publicado.artistas.length,6);assert.equal(all[0].contenido_publicado.videos.length,2);assert.ok(all[0].contenido_publicado.historia.includes('mesas'));assert.equal(all[1].contenido_publicado.historia,undefined);assert.deepEqual(all[2].contenido_borrador,{concepto:'Borrador en curso'});assert.equal(all[3].contenido_publicado.historia,'Historia editada');
 assert.equal(validateContent(defaults(all[0])).videos.length,2);
 await db.close();
});

test('legacy migration also supports the prepared timestamp-without-zone schema',async()=>{
 const db=await database('TIMESTAMP');
 await db.exec(`INSERT INTO eventos(id_evento,nombre,fecha,estado,publicacion,ventas_abiertas,mostrar_en_home,contenido_publicado) VALUES (1,'INFAMOUS','2026-11-01 02:00',true,'PUBLICADO',true,true,'{}'),(2,'INFAMOUS','2026-10-31 20:00',true,'PUBLICADO',true,true,'{}'),(3,'INFAMOUS','2099-10-31 20:00',true,'PUBLICADO',true,true,'{}');`);
 await migrateLegacyEventContent(db);const rows=(await db.query('SELECT * FROM eventos ORDER BY id_evento')).rows;
 assert.equal(rows[0].contenido_publicado.artistas.length,6);assert.equal(rows[1].contenido_publicado.artistas.length,6);assert.equal(rows[2].contenido_publicado.artistas,undefined);
 await db.close();
});
