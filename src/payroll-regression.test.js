const {test}=require('node:test');const assert=require('node:assert/strict');const {PGlite}=require('@electric-sql/pglite');
test('existing payroll processing preserves gross, deductions, net and per-employee detail on repeat',async()=>{
 const db=new PGlite();await db.exec(`CREATE TABLE empleados(id_empleado INT PRIMARY KEY,salario_base NUMERIC,estado BOOLEAN);
 CREATE TABLE conceptos_pago(id_concepto INT PRIMARY KEY,tipo TEXT);
 CREATE TABLE novedades(id_empleado INT,id_planilla INT,id_concepto INT,monto NUMERIC);
 CREATE TABLE planillas(id_planilla INT PRIMARY KEY,estado TEXT,fecha_proceso TIMESTAMP,total_bruto NUMERIC,total_deducciones NUMERIC,total_neto NUMERIC);
 CREATE TABLE detalle_planilla(id_planilla INT,id_empleado INT,salario_base NUMERIC,total_ingresos NUMERIC,total_deducciones NUMERIC,salario_neto NUMERIC,UNIQUE(id_planilla,id_empleado));
 INSERT INTO empleados VALUES(1,10000,true),(2,20000,true),(3,99999,false);
 INSERT INTO conceptos_pago VALUES(1,'PAGO'),(2,'DEDUCCION');
 INSERT INTO planillas VALUES(1,'PENDIENTE',NULL,0,0,0);
 INSERT INTO novedades VALUES(1,1,1,1000),(1,1,2,500),(2,1,1,2000),(2,1,2,1500);`);
 const cache=(file,exports)=>{const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports};};
 cache('./config/database',{query:(sql,args)=>db.query(sql,args)});const audit=[];cache('./utils/auditoria',async(...args)=>audit.push(args));
 const controller=require('./controllers/planillasController');const response=()=>({code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
 try {for(let i=0;i<2;i++){const r=response();await controller.procesarPlanilla({params:{id:1}},r);assert.equal(r.code,200);assert.deepEqual([r.body.totalBruto,r.body.totalDeducciones,r.body.totalNeto],[33000,2000,31000]);}
 const rows=(await db.query('SELECT * FROM detalle_planilla ORDER BY id_empleado')).rows;assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>Number(r.salario_neto)),[10500,20500]);
 const header=(await db.query('SELECT * FROM planillas')).rows[0];assert.equal(header.estado,'PROCESADA');assert.deepEqual([header.total_bruto,header.total_deducciones,header.total_neto].map(Number),[33000,2000,31000]);assert.equal(audit.length,2);
 }finally{await db.close();}
});
