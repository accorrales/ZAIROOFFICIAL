const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {defaults,validateContent,publicEvent}=require('./utils/eventContent');
const response=()=>({code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}});

test('content is bounded, plain text and rejects unsafe URLs, malformed sections and low contrast',()=>{
 const c=defaults({nombre:'Evento ficticio',fecha:'2099-01-01',precio:100});
 assert.equal(validateContent(c).nombre,c.nombre);
 for(const bad of [{...c,imagen:'javascript:alert(1)'},{...c,imagen:'https://u:p@example.test/a.png'},{...c,secciones:[c.secciones[0],c.secciones[0],...c.secciones.slice(2)]},{...c,colores:{fondo:'#ffffff',texto:'#ffffff',acento:'#ffffff'}},{...c,colores:{...c.colores,acento:'#777777'}},{...c,ubicacion_secreta_direccion:'private'},{...c,artistas:Array(31).fill({})}])assert.throws(()=>validateContent(bad));
});

test('public projection never returns private drafts, hidden blocks, or secret controls',()=>{
 const c=defaults({nombre:'Público',fecha:'2099-01-01',precio:100});c.historia='HISTORIA OCULTA';c.secciones[0].visible=false;
 const row={...c,id_evento:1,publicacion:'BORRADOR',contenido_publicado:c,contenido_borrador:{historia:'BORRADOR PRIVADO'},ubicacion_secreta_direccion:'DIRECCION PRIVADA',ubicacion_envio_habilitado:true};
 assert.equal(publicEvent(row),null);
 row.publicacion='PROXIMAMENTE';assert.deepEqual(Object.keys(publicEvent(row)).sort(),['id_evento','nombre','fecha','imagen','estado','mostrar_en_home','destacado','publicacion','ventas_abiertas','modo'].sort());
 row.publicacion='PUBLICADO';const r=JSON.stringify(publicEvent(row,true));for(const marker of ['BORRADOR PRIVADO','DIRECCION PRIVADA','HISTORIA OCULTA','ubicacion_envio_habilitado','contenido_borrador'])assert.ok(!r.includes(marker));
 row.ubicacion_visible_publicamente=true;assert.equal(publicEvent(row,true).ubicacion_secreta_direccion,'DIRECCION PRIVADA');
});

test('migration preserves legacy states, is repeatable, and editorial publication uses versioned snapshots',async()=>{
 const db=new PGlite();
 await db.exec(`CREATE TABLE eventos(id_evento SERIAL PRIMARY KEY,nombre TEXT,descripcion TEXT,fecha TIMESTAMPTZ,ubicacion TEXT,precio NUMERIC,imagen TEXT,estado BOOLEAN DEFAULT false,mostrar_en_home BOOLEAN DEFAULT false);
 INSERT INTO eventos(nombre,fecha,estado,mostrar_en_home) VALUES ('Activo','2099-01-01',true,false),('Teaser','2099-01-01',false,true),('Privado','2099-01-01',false,false);`);
 const sql=fs.readFileSync(require.resolve('./sql/eventos_editoriales.sql'),'utf8');await db.exec(sql);await db.exec(sql);
 const rows=(await db.query('SELECT * FROM eventos ORDER BY id_evento')).rows;
 assert.deepEqual(rows.map(r=>[r.publicacion,r.ventas_abiertas,r.mostrar_en_home]),[['PUBLICADO',true,false],['PROXIMAMENTE',false,true],['BORRADOR',false,false]]);
 const client={query:(sql,args)=>sql.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):db.query(sql,args),release(){}};
 const key=require.resolve('./config/database');require.cache[key]={id:key,filename:key,loaded:true,exports:{query:client.query,connect:async()=>client}};
 const controller=require('./controllers/eventContentController');
 const content=defaults(rows[2]);content.historia='Historia de prueba';content.artistas=[{nombre:'Artista ficticio',descripcion:'Biografía de prueba',imagen:'/assets/artista.png'}];
 let r=response();await controller.guardar({params:{id:3},body:{contenido:content,revision:0}},r);assert.equal(r.code,200);
 r=response();await controller.guardar({params:{id:3},body:{contenido:content,revision:0}},r);assert.equal(r.code,409);
 r=response();await controller.obtener({params:{id:3}},r);assert.equal(r.body.contenido.historia,'Historia de prueba');assert.equal(r.body.revision,1);
 const publish=async(id,revision,publicacion,ventas_abiertas=false,mostrar_en_home=false,destacado=false)=>{const r=response();await controller.publicar({params:{id},body:{revision,publicacion,ventas_abiertas,mostrar_en_home,destacado}},r);return r;};
 assert.equal((await publish(3,1,'BORRADOR',true)).code,400);
 assert.equal((await publish(3,1,'PROXIMAMENTE',true,true)).code,400);
 assert.equal((await publish(3,1,'PROXIMAMENTE',false,true,true)).code,200);
 let row=(await db.query('SELECT * FROM eventos WHERE id_evento=3')).rows[0];assert.equal(publicEvent(row).modo,'PROXIMAMENTE');assert.equal(publicEvent(row).contenido,undefined);
 assert.equal((await publish(3,1,'PUBLICADO')).code,409);
 assert.equal((await publish(3,2,'PUBLICADO',false,true,true)).code,200);
 row=(await db.query('SELECT * FROM eventos WHERE id_evento=3')).rows[0];assert.equal(publicEvent(row,true).contenido.historia,'Historia de prueba');assert.equal(row.estado,false);
 content.historia='Cambios privados';r=response();await controller.guardar({params:{id:3},body:{contenido:content,revision:3}},r);assert.equal(r.code,200);
 row=(await db.query('SELECT * FROM eventos WHERE id_evento=3')).rows[0];assert.equal(publicEvent(row,true).contenido.historia,'Historia de prueba');
 assert.equal((await publish(3,4,'PUBLICADO',true,true,true)).code,200);
 assert.equal((await publish(1,0,'PUBLICADO',true,true,true)).code,200);
 assert.equal((await db.query('SELECT count(*)::int n FROM eventos WHERE destacado')).rows[0].n,1);
 row=(await db.query('SELECT * FROM eventos WHERE id_evento=3')).rows[0];assert.equal(row.destacado,false);assert.equal(row.ventas_abiertas,true);
 assert.equal((await publish(3,row.revision_editorial,'BORRADOR',false,false,false)).code,200);
 row=(await db.query('SELECT * FROM eventos WHERE id_evento=3')).rows[0];assert.equal(publicEvent(row,true),null);assert.equal(row.estado,false);
 await db.exec(sql);assert.equal((await db.query('SELECT publicacion FROM eventos WHERE id_evento=3')).rows[0].publicacion,'BORRADOR');
 await db.close();
});


test('legacy migration preserves home selection, closes past sales and leaves purchases unchanged',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE TABLE eventos(id_evento SERIAL PRIMARY KEY,nombre TEXT,descripcion TEXT,fecha TIMESTAMPTZ,ubicacion TEXT,precio NUMERIC,imagen TEXT,estado BOOLEAN,mostrar_en_home BOOLEAN);
   CREATE TABLE compras_entradas(id_compra INT PRIMARY KEY,id_evento INT,estado TEXT,total NUMERIC,cupo_reservado BOOLEAN);
   INSERT INTO eventos(nombre,fecha,estado,mostrar_en_home) VALUES
   ('Pasado oculto',CURRENT_TIMESTAMP-INTERVAL '1 day',true,false),
   ('Pasado visible',CURRENT_TIMESTAMP-INTERVAL '1 day',true,true),
   ('Futuro oculto',CURRENT_TIMESTAMP+INTERVAL '1 day',true,false),
   ('Sin fecha',NULL,true,false),
   ('Anuncio',CURRENT_TIMESTAMP+INTERVAL '1 day',false,true);
   INSERT INTO compras_entradas VALUES(1,1,'PENDIENTE',100,true),(2,2,'PAGADA',200,false);`);
  const before=(await db.query('SELECT * FROM compras_entradas ORDER BY id_compra')).rows;
  const sql=fs.readFileSync(require.resolve('./sql/eventos_editoriales.sql'),'utf8');
  await db.exec(sql);
  const states=async()=>(await db.query('SELECT publicacion,ventas_abiertas,mostrar_en_home FROM eventos ORDER BY id_evento')).rows;
  const initial=await states();
  assert.deepEqual(initial.map(r=>[r.publicacion,r.ventas_abiertas,r.mostrar_en_home]),[
   ['PUBLICADO',false,false],['PUBLICADO',false,true],['PUBLICADO',true,false],['PUBLICADO',false,false],['PROXIMAMENTE',false,true]
  ]);
  await db.exec(sql);
  assert.deepEqual(await states(),initial);
  assert.deepEqual((await db.query('SELECT * FROM compras_entradas ORDER BY id_compra')).rows,before);
  await db.exec('UPDATE eventos SET ventas_abiertas=false,mostrar_en_home=true WHERE id_evento=3');
  const edited=await states();await db.exec(sql);assert.deepEqual(await states(),edited);
 } finally {await db.close();}
});
