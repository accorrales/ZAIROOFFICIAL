const {test}=require('node:test');
const assert=require('node:assert/strict');
const {adminError}=require('./utils/adminErrors');

test('admin SQL errors explain causes without exposing database details or user values',()=>{
 const cases=[
  [{code:'23503'},'concepto','eliminar',409,'historial'],
  [{code:'23503'},'planilla','eliminar',409,'detalles de pago'],
  [{code:'23503',constraint:'fk_novedad_concepto'},'novedad','crear',409,'concepto seleccionado'],
  [{code:'23505',constraint:'empleados_cedula_key'},'empleado','actualizar',409,'cédula'],
  [{code:'23505',constraint:'conceptos_pago_nombre_key'},'concepto','crear',409,'nombre de concepto'],
  [{code:'23502',column:'cantidad'},'novedad','crear',400,'cantidad'],
  [{code:'23514',constraint:'conceptos_pago_tipo_check'},'concepto','actualizar',422,'Pago o Deducción'],
  [{code:'23514',constraint:'empleados_salario_base_check'},'empleado','actualizar',422,'no puede ser negativo'],
  [{code:'22007'},'planilla','crear',400,'fecha'],
  [{code:'22P02'},'novedad','actualizar',400,'formato'],
  [{code:'22003'},'empleado','actualizar',400,'rango'],
  [{code:'ECONNRESET'},'resumen','consultar',503,'consultar'],
  [{code:'08006'},'novedad','crear',503,'confirmar'],
  [{code:'XX000'},'planilla','procesar',500,'parcialmente'],
  [{code:'XX000'},'resumen','consultar',500,'servidor']
 ];
 for(const [error,resource,action,status,text] of cases){
  const result=adminError({...error,message:'SELECT secreto FROM tabla',detail:'DATO_PERSONAL_FICTICIO'},resource,action);
  assert.equal(result.status,status);assert.ok(result.body.error.includes(text));
  assert.ok(!JSON.stringify(result).includes('DATO_PERSONAL'));assert.ok(!JSON.stringify(result).includes('SELECT'));
  if(error.constraint)assert.ok(!JSON.stringify(result).includes(error.constraint));
 }
});

test('controllers preserve linked concepts/payroll and report missing, invalid and duplicate records',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 await db.exec(`CREATE TABLE conceptos_pago(id_concepto SERIAL PRIMARY KEY,nombre TEXT UNIQUE NOT NULL,tipo TEXT CHECK(tipo IN ('PAGO','DEDUCCION')),descripcion TEXT,porcentaje NUMERIC,monto_fijo NUMERIC,estado BOOLEAN DEFAULT true);
 CREATE TABLE planillas(id_planilla SERIAL PRIMARY KEY,nombre_periodo TEXT,fecha_inicio DATE,fecha_fin DATE,estado TEXT DEFAULT 'PENDIENTE',total_bruto NUMERIC DEFAULT 0,total_deducciones NUMERIC DEFAULT 0,total_neto NUMERIC DEFAULT 0,fecha_proceso TIMESTAMP);
 CREATE TABLE empleados(id_empleado INT PRIMARY KEY,salario_base NUMERIC,estado BOOLEAN);
 CREATE TABLE novedades(id_novedad SERIAL PRIMARY KEY,id_empleado INT CONSTRAINT fk_novedad_empleado REFERENCES empleados,id_planilla INT CONSTRAINT fk_novedad_planilla REFERENCES planillas,id_concepto INT CONSTRAINT fk_novedad_concepto REFERENCES conceptos_pago,cantidad NUMERIC NOT NULL,monto NUMERIC,observacion TEXT);
 CREATE TABLE detalle_planilla(id_planilla INT REFERENCES planillas,id_empleado INT REFERENCES empleados,salario_base NUMERIC,total_ingresos NUMERIC,total_deducciones NUMERIC,salario_neto NUMERIC,UNIQUE(id_planilla,id_empleado));
 INSERT INTO empleados VALUES(1,100,true);INSERT INTO conceptos_pago(nombre,tipo) VALUES('Concepto ficticio','PAGO');
 INSERT INTO planillas(nombre_periodo,estado,total_neto) VALUES('Período ficticio','CONFIRMADA',100),('Período pendiente','PENDIENTE',0);
 INSERT INTO novedades(id_empleado,id_planilla,id_concepto,cantidad,monto) VALUES(1,1,1,1,10);
 INSERT INTO detalle_planilla VALUES(1,1,100,0,0,100);`);
 const key=require.resolve('./config/database');require.cache[key]={id:key,filename:key,loaded:true,exports:{query:(...args)=>db.query(...args)}};
 const audit=require.resolve('./utils/auditoria');require.cache[audit]={id:audit,filename:audit,loaded:true,exports:async()=>{}};
 const concepts=require('./controllers/conceptosController'),payroll=require('./controllers/planillasController'),news=require('./controllers/novedadesController');
 const response=()=>({statusCode:200,status(s){this.statusCode=s;return this;},json(b){this.body=b;return this;}});
 const call=async(fn,id,body={})=>{const r=response();await fn({params:{id},body},r);return r;};
 try {
  const totals=(await db.query('SELECT * FROM detalle_planilla')).rows;
  assert.equal((await call(concepts.eliminarConcepto,1)).statusCode,409);
  assert.equal((await call(payroll.eliminarPlanilla,1)).statusCode,409);
  assert.equal((await call(payroll.confirmarPlanilla,1)).body.codigo,'ADMIN_PLANILLA_CONFIRMADA');
  assert.equal((await call(payroll.confirmarPlanilla,2)).body.codigo,'ADMIN_PLANILLA_PENDIENTE');
  assert.equal((await call(payroll.procesarPlanilla,999)).statusCode,404);
  assert.equal((await call(concepts.actualizarConcepto,999)).statusCode,404);
  assert.equal((await call(payroll.actualizarPlanilla,999)).statusCode,404);
  assert.equal((await call(news.actualizarNovedad,999)).statusCode,404);
  assert.equal((await call(news.eliminarNovedad,999)).statusCode,404);
  assert.equal((await call(concepts.eliminarConcepto,'not-an-id')).statusCode,400);
  const duplicate=await call(concepts.crearConcepto,null,{nombre:'Concepto ficticio',tipo:'PAGO'});assert.equal(duplicate.statusCode,409);
  const invalidReference=await call(news.crearNovedad,null,{id_empleado:1,id_planilla:1,id_concepto:999,cantidad:1,monto:10});assert.equal(invalidReference.statusCode,409);assert.match(invalidReference.body.error,/concepto seleccionado/);
  assert.deepEqual((await db.query('SELECT * FROM detalle_planilla')).rows,totals);
  assert.equal((await db.query('SELECT count(*)::int n FROM novedades')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM conceptos_pago')).rows[0].n,1);
  assert.equal((await db.query('SELECT total_neto FROM planillas WHERE id_planilla=1')).rows[0].total_neto,'100');
 }finally{await db.close();}
});
