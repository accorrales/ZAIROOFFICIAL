const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {workbook}=require('./utils/excelWorkbook');

// The existing ZIP dependency stores uncompressed entries; inspect their bytes.
function parts(buffer){const result={};let offset=0;while(buffer.readUInt32LE(offset)===0x04034b50){const length=buffer.readUInt32LE(offset+18),nameLength=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28);const name=buffer.subarray(offset+30,offset+30+nameLength).toString('utf8');const start=offset+30+nameLength+extra;result[name]=buffer.subarray(start,start+length).toString('utf8');offset=start+length;}return result;}
let rows=[],events=[{nombre:'Evento ficticio Á'}],queries=[],database=null;
const db=require.resolve('./config/database');require.cache[db]={id:db,filename:db,loaded:true,exports:{query:async(sql,args)=>{queries.push(sql);if(database)return database.query(sql,args);return {rows:sql.includes('SELECT nombre FROM eventos')?events:rows};}}};
const {descargarReporteExcel}=require('./controllers/entradasConfirmadasController');
const response=()=>({headers:{},code:200,setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;},send(b){this.body=b;}});

test('Excel separates cells, preserves text/CRC numbers and deduplicates purchases across two packages',async()=>{
 rows=Array.from({length:12},(_,i)=>({nombre_completo:i===0?'Persona, "ficticia" Álvarez':i===1?'=SUM(1,2)':'Persona ficticia '+i,correo_comprador:'ficticio@example.test',telefono_comprador:'0012345678',tier:'VIP actual',zona:'VIP',id_compra:1,total_compra:'90000.00',cantidad_compra:12,id_paquete:i<6?201:202,promocion_adquirida:'Promoción adquirida',beneficios_paquete:'Descripción anterior',beneficios_adquiridos:'Mesa & 4 bebidas\nCompartidas',mesa_incluida:'COCTEL',beneficios_incluidos:[{nombre:'Bebida',cantidad:4},{nombre:'Beneficio especial',cantidad:1}],precio:'7500.00',uuid_entrada:'ficticio-'+i,estado:'CONFIRMADA',fecha_creacion:'2026-10-01T12:00:00.000Z'}));
 rows.push({nombre_completo:'General ficticia',telefono_comprador:'+50600000000',tier:'General',zona:'GENERAL',id_compra:2,total_compra:'7500.50',cantidad_compra:1,id_paquete:null,beneficios_paquete:'',precio:'7500.50',estado:'INVALIDADA'});
 const res=response();await descargarReporteExcel({params:{id_evento:'1'}},res);
 assert.equal(res.code,200);assert.ok(Buffer.isBuffer(res.body));assert.match(res.headers['Content-Type'],/spreadsheetml/);assert.equal(res.headers['Cache-Control'],'private, no-store');
 const files=parts(res.body),entries=files['xl/worksheets/sheet1.xml'],purchases=files['xl/worksheets/sheet2.xml'];
 assert.match(entries,/<dimension ref="A1:M14"/);assert.equal((entries.match(/<row r=/g)||[]).length,14);assert.equal((purchases.match(/<row r=/g)||[]).length,3);
 assert.match(entries,/<c r="B2"[^>]*t="inlineStr"[^>]*>.*?0012345678/);assert.match(entries,/<c r="J2" s="2"><v>7500<\/v>/);
 assert.match(entries,/Persona, &quot;ficticia&quot; Álvarez/);assert.match(entries,/Mesa &amp; 4 bebidas/);assert.match(entries,/=SUM\(1,2\)/);assert.ok(!entries.includes('<f>'));
 assert.match(entries,/<c r="G2" s="0"><v>201<\/v>/);assert.match(entries,/<c r="G8" s="0"><v>202<\/v>/);assert.match(entries,/<c r="G14" s="0"\/>/);
 assert.match(purchases,/<v>90000<\/v>/);assert.match(purchases,/<v>7500.5<\/v>/);assert.match(files['xl/styles.xml'],/CRC/);
 assert.match(entries,/<autoFilter/);assert.match(entries,/state="frozen"/);
 assert.ok(queries.some(sql=>sql.includes("c.estado = 'PAGADA'")&&sql.includes('p.id_compra = c.id_compra')));
 if(process.env.ZAIRO_EXCEL_FIXTURE_PATH)fs.writeFileSync(process.env.ZAIRO_EXCEL_FIXTURE_PATH,res.body);
});

test('empty report has headers and missing event returns a clear 404 without an attachment',async()=>{
 rows=[];const empty=response();await descargarReporteExcel({params:{id_evento:'1'}},empty);assert.match(parts(empty.body)['xl/worksheets/sheet1.xml'],/A1:M1/);
 events=[];const missing=response();await descargarReporteExcel({params:{id_evento:'999'}},missing);assert.equal(missing.code,404);assert.equal(missing.body.codigo,'ADMIN_NO_EXISTE');assert.equal(missing.headers['Content-Type'],undefined);events=[{nombre:'Evento ficticio Á'}];
});

test('Excel refuses invalid numeric data instead of inventing zero values',()=>{
 assert.throws(()=>workbook([{name:'Prueba',columns:[{title:'Importe',money:true}],rows:[[NaN]]}]),/no válido/);
});


test('PostgreSQL export filters paid/event rows and keeps frozen benefits independent by concrete package',async()=>{
 const {PGlite}=require('@electric-sql/pglite');database=new PGlite();
 try {
  await database.exec(`CREATE TABLE eventos(id_evento INT PRIMARY KEY,nombre TEXT);
   CREATE TABLE entrada_tiers(id_tier INT PRIMARY KEY,nombre TEXT);
   CREATE TABLE compras_entradas(id_compra INT PRIMARY KEY,id_evento INT,id_tier INT,correo_comprador TEXT,telefono_comprador TEXT,zona TEXT,beneficios_paquete TEXT,total NUMERIC,cantidad INT,estado TEXT,fecha_creacion TIMESTAMPTZ);
   CREATE TABLE compra_entrada_detalles(id_detalle INT PRIMARY KEY,id_compra INT,id_paquete INT,nombre_completo TEXT,uuid_entrada TEXT,estado TEXT,fecha_invalidacion TIMESTAMPTZ);
   CREATE TABLE compra_paquetes(id_paquete INT PRIMARY KEY,id_compra INT,id_evento INT,promocion TEXT,beneficios_descripcion TEXT,mesa_tipo TEXT);
   CREATE TABLE paquete_beneficios(id_beneficio INT PRIMARY KEY,id_paquete INT,nombre TEXT,cantidad INT);
   INSERT INTO eventos VALUES(1,'Evento ficticio'),(2,'Otro evento ficticio');INSERT INTO entrada_tiers VALUES(1,'VIP actual');
   INSERT INTO compras_entradas VALUES(1,1,1,'ficticio@example.test','001234','VIP','Descripción compra',90000,12,'PAGADA','2026-10-01'),(2,1,1,NULL,NULL,'GENERAL','',1000,1,'PENDIENTE','2026-10-01'),(3,2,1,NULL,NULL,'GENERAL','',1000,1,'PAGADA','2026-10-01'),(4,1,1,NULL,NULL,'GENERAL','',7500.50,1,'PAGADA','2026-10-01');
   INSERT INTO compra_paquetes VALUES(201,1,1,'Promoción adquirida A','Paquete A','COCTEL'),(202,1,1,'Promoción adquirida B','Paquete B','COCTEL');
   INSERT INTO paquete_beneficios VALUES(1,201,'Bebida A',4),(2,202,'Bebida B',1);
   INSERT INTO compra_entrada_detalles SELECT n,1,CASE WHEN n<=6 THEN 201 ELSE 202 END,'Persona ficticia '||n,'ficticio-'||n,'CONFIRMADA',NULL FROM generate_series(1,12) n;
   INSERT INTO compra_entrada_detalles VALUES(13,4,201,'Legacy ficticia','ficticio-13','CONFIRMADA',NULL),(14,2,NULL,'No pagada','ficticio-14','PENDIENTE',NULL),(15,3,NULL,'Otro evento','ficticio-15','CONFIRMADA',NULL);
   UPDATE compra_entrada_detalles SET fecha_invalidacion='2026-10-02' WHERE id_detalle=1;`);
  const res=response();await descargarReporteExcel({params:{id_evento:1}},res);assert.equal(res.code,200);
  const files=parts(res.body),sheet=files['xl/worksheets/sheet1.xml'];
  assert.equal((sheet.match(/<row r=/g)||[]).length,14);assert.match(sheet,/Bebida A: 4 unidades incluidas/);assert.match(sheet,/Bebida B: 1 unidad incluida/);
  assert.match(sheet,/INVALIDADA/);assert.ok(!sheet.includes('No pagada'));assert.ok(!sheet.includes('Otro evento'));
  assert.match(sheet,/<c r="G14" s="0"\/>/);assert.match(sheet,/<c r="H14" s="0"\/>/);
  assert.equal((files['xl/worksheets/sheet2.xml'].match(/<row r=/g)||[]).length,3);
  assert.equal((await database.query('SELECT total FROM compras_entradas WHERE id_compra=1')).rows[0].total,'90000');
 }finally{await database.close();database=null;}
});
