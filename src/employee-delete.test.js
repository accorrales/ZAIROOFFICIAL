const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const express=require('express');
const jwt=require('jsonwebtoken');

test('employee deletion preserves linked payroll and existing role boundaries',async()=>{
 const db=new PGlite();
 await db.exec(`CREATE TABLE empleados(id_empleado INT PRIMARY KEY,cedula TEXT,nombre TEXT,apellido TEXT,correo TEXT,telefono TEXT,direccion TEXT,puesto TEXT,salario_base NUMERIC,fecha_ingreso DATE,estado BOOLEAN,id_departamento INT);
 CREATE TABLE detalle_planilla(id INT PRIMARY KEY,id_empleado INT REFERENCES empleados(id_empleado),salario_neto NUMERIC);
 CREATE TABLE novedades(id INT PRIMARY KEY,id_empleado INT REFERENCES empleados(id_empleado));
 INSERT INTO empleados VALUES(1,'ficticia-1','Prueba','Uno',NULL,NULL,NULL,'Prueba',100,'2026-01-01',true,1),(2,'ficticia-2','Prueba','Dos',NULL,NULL,NULL,'Prueba',200,'2026-01-01',true,1),(3,'ficticia-3','Prueba','Tres',NULL,NULL,NULL,'Prueba',300,'2026-01-01',true,1);
 INSERT INTO detalle_planilla VALUES(1,1,90);INSERT INTO novedades VALUES(1,3);`);
 const payroll=(await db.query('SELECT * FROM detalle_planilla')).rows;
 let queries=0;
 const key=require.resolve('./config/database');require.cache[key]={id:key,filename:key,loaded:true,exports:{query:(...args)=>{queries++;return db.query(...args)}}};
 process.env.JWT_SECRET='ficticio-local-employee-test';
 const {verificarToken,requiereRoles}=require('./middlewares/authMiddleware');
 const app=express();app.use(express.json());app.use('/api/empleados',verificarToken,requiereRoles('admin','rrhh','contabilidad'),require('./routes/empleadosRoutes'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const url=`http://127.0.0.1:${server.address().port}/api/empleados`;
 const request=(id,role='admin',method='DELETE',body)=>fetch(`${url}/${id}`,{method,headers:{'Content-Type':'application/json',...(role?{Authorization:`Bearer ${jwt.sign({rol:role},process.env.JWT_SECRET)}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try {
  for(const role of ['admin','rrhh','contabilidad']){const r=await request(1,role);assert.equal(r.status,409);assert.equal((await r.json()).codigo,'EMPLEADO_CON_HISTORIAL');}
  assert.equal((await request(3)).status,409);
  const count=queries;
  for(const role of ['visor','entrada','supervisor',null])assert.equal((await request(2,role)).status,role?403:401);
  assert.equal(queries,count);
  assert.equal((await request('invalid')).status,400);assert.equal((await request('0')).status,400);
  assert.equal((await request(999)).status,404);
  assert.equal((await request(2)).status,200);assert.equal((await request(2)).status,404);
  const r=await request(1,'admin','PUT',{cedula:'ficticia-1',nombre:'Prueba',apellido:'Uno',correo:null,telefono:null,direccion:null,puesto:'Prueba',salario_base:100,fecha_ingreso:'2026-01-01',estado:false,id_departamento:1});
  assert.equal(r.status,200);assert.equal((await r.json()).estado,false);
  assert.deepEqual((await db.query('SELECT * FROM detalle_planilla')).rows,payroll);
  assert.equal((await db.query('SELECT count(*)::int n FROM novedades')).rows[0].n,1);
  assert.deepEqual((await db.query('SELECT id_empleado FROM empleados ORDER BY id_empleado')).rows.map(x=>x.id_empleado),[1,3]);
 } finally {await new Promise(r=>server.close(r));await db.close();}
});
