const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { packageQuote, validateTier } = require('./utils/ticketPackage');

test('package validation rejects partial groups, invalid limits and unavailable promotions', () => {
  const tier={precio:20000,entradas_por_paquete:4,cantidad_disponible:3,estado:true};
  assert.deepEqual(packageQuote(tier,4),{units:1,subtotal:20000});
  assert.deepEqual(packageQuote(tier,8),{units:2,subtotal:40000});
  assert.throws(()=>packageQuote(tier,3));
  assert.throws(()=>packageQuote({...tier,cantidad_disponible:0},4));
  assert.throws(()=>packageQuote({...tier,estado:false},4));
  assert.throws(()=>packageQuote({...tier,fecha_inicio:'2099-01-01'},4));
  assert.throws(()=>packageQuote({...tier,fecha_fin:'2000-01-01'},4));
  assert.throws(()=>validateTier({nombre:'Promo',precio:20000,entradas_por_paquete:4}));
  assert.equal(validateTier({nombre:'Promo',precio:20000,entradas_por_paquete:4,cantidad_disponible:0}).stock,0);
  assert.throws(()=>validateTier({nombre:'Promo',precio:20000,entradas_por_paquete:2.5,cantidad_disponible:2}));
  assert.deepEqual(packageQuote({...tier,entradas_por_paquete:1,precio:7000,cantidad_disponible:null},3),{units:3,subtotal:21000});
});

test('PostgreSQL purchase lifecycle: migration, totals, inventory, rollback, QR and privacy', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE eventos (id_evento INT PRIMARY KEY, nombre TEXT, fecha TIMESTAMPTZ, estado BOOLEAN, ubicacion TEXT, imagen TEXT);
    CREATE TABLE entrada_tiers (id_tier SERIAL PRIMARY KEY, id_evento INT REFERENCES eventos, nombre TEXT, descripcion TEXT, precio NUMERIC, cantidad_disponible INT, estado BOOLEAN DEFAULT true, fecha_inicio TIMESTAMPTZ, fecha_fin TIMESTAMPTZ);
    CREATE TABLE compras_entradas (id_compra SERIAL PRIMARY KEY, id_evento INT REFERENCES eventos, id_tier INT REFERENCES entrada_tiers, correo_comprador TEXT, telefono_comprador TEXT, cantidad INT, subtotal NUMERIC, descuento NUMERIC, total NUMERIC, id_codigo INT, bebida_cortesia TEXT, estado TEXT DEFAULT 'PENDIENTE', fecha_creacion TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE compra_entrada_detalles (id_detalle SERIAL PRIMARY KEY, id_compra INT REFERENCES compras_entradas, nombre_completo TEXT, fecha_nacimiento DATE, bebida_cortesia TEXT, uuid_entrada TEXT, qr_data TEXT, estado TEXT, fecha_invalidacion TIMESTAMPTZ, estado_anterior TEXT, fecha_ingreso TIMESTAMPTZ);
  `);
  const sql=fs.readFileSync(require.resolve('./sql/paquetes_promocionales.sql'),'utf8');
  await db.exec(sql); await db.exec(sql);
  await db.exec(`INSERT INTO eventos VALUES (1,'INFAMOUS','2099-10-31',true,'Venue','image'); INSERT INTO entrada_tiers (id_evento,nombre,precio,cantidad_disponible,entradas_por_paquete) VALUES (1,'Promo General 4',20000,2,4), (1,'Individual',7000,10,1), (1,'Doble',12000,3,2);`);
  let queue=Promise.resolve(), failDetails=false;
  const queries=[];
  const pool={
    query: async(sql,args)=>{ queries.push(sql); return db.query(sql,args); },
    connect: async()=>{
      const prior=queue; let unlock; queue=new Promise(r=>{unlock=r;}); await prior;
      return {query: async(sql,args)=>{ queries.push(sql); if(failDetails && sql.includes('INSERT INTO compra_entrada_detalles')) throw new Error('simulated storage failure'); return db.query(sql,args); },release:unlock};
    }
  };
  const mail=[],wallet=[];
  function mock(file,exports){const p=require.resolve(file);require.cache[p]={id:p,filename:p,loaded:true,exports};}
  mock('./config/database',pool);
  mock('./services/emailService',{enviarEntradas:async data=>{mail.push(data);}});
  mock('./services/walletService',{getTicketUrl:id=>'https://test/t/'+id,getQrUrl:id=>'https://test/qr/'+id,getAppleWalletUrl:id=>'https://test/apple/'+id,generarGoogleWalletUrl:async ticket=>{wallet.push(ticket);return 'https://test/google';}});
  mock('./controllers/codigosDescuentoController',{evaluarCodigo:async()=>({ok:true,descuento:1000,codigo:{id_codigo:1}})});
  const controller=require('./controllers/comprasEntradasController');
  const tiers=require('./controllers/entradaTiersController');
  const sales=require('./controllers/entradasConfirmadasController');
  const confirm=require('./services/confirmarCompraService');
  function response(){return {code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}};}
  const people=n=>Array.from({length:n},(_,i)=>({nombre_completo:'Persona '+i,fecha_nacimiento:'2000-01-01'}));
  async function buy(tier,count,extra={}){const res=response();await controller.crearCompra({body:{id_evento:1,id_tier:tier,correo_comprador:'test@example.com',telefono_comprador:'88888888',personas:people(count),...extra}},res);return res;}
  await db.exec("INSERT INTO eventos VALUES (2,'Otro evento','2099-10-31',true,'Otro','image'); INSERT INTO entrada_tiers (id_evento,nombre,precio,cantidad_disponible,entradas_por_paquete,zona,beneficios_paquete) VALUES (1,'VIP Red Bull',75000,2,6,'VIP','1 mesa, 1 litro Jack y 4 Red Bulls')");
  assert.equal((await buy(4,6,{id_evento:2})).code,404);
  assert.equal((await buy(4,5)).code,400);
  assert.equal((await buy(4,6,{codigo_descuento:'EXTRA'})).code,400);
  const vip=await buy(4,6);assert.equal(vip.code,201);assert.equal(Number(vip.body.compra.total),75000);assert.equal(vip.body.compra.zona,'VIP');
  assert.equal(vip.body.compra.unidades_reservadas,1);
  const vipConfirmed=await confirm.confirmarCompra(vip.body.compra.id_compra);
  assert.equal(vipConfirmed.personas.length,6);assert.equal(mail[0].beneficios_paquete,'1 mesa, 1 litro Jack y 4 Red Bulls');assert.equal(mail[0].unidades_paquete,1);
  assert.equal(new Set((await db.query('SELECT uuid_entrada FROM compra_entrada_detalles WHERE id_compra=$1',[vip.body.compra.id_compra])).rows.map(r=>r.uuid_entrada)).size,6);
  await assert.rejects(confirm.confirmarCompra(vip.body.compra.id_compra),/ya fue confirmada/);
  const changeZone=response();await tiers.actualizarTier({params:{id:4},body:{nombre:'VIP',precio:75000,entradas_por_paquete:6,cantidad_disponible:1,estado:true,zona:'GENERAL'}},changeZone);assert.equal(changeZone.code,409);
  await db.exec('DELETE FROM compra_entrada_detalles; DELETE FROM compras_entradas');mail.length=0;wallet.length=0;
  const publicRes=response();await tiers.obtenerTiersPorEvento({params:{id_evento:1}},publicRes);
  assert.equal(publicRes.code,200); assert.equal(publicRes.body.find(t=>t.id_tier===1).entradas_por_paquete,4);
  assert.ok(publicRes.body.every(t=>!Object.hasOwn(t,'cantidad_disponible')));
  const adminRes=response();await tiers.obtenerTiersPorEvento({params:{id_evento:1},user:{rol:'admin'}},adminRes);
  assert.equal(adminRes.body.find(t=>t.id_tier===1).cantidad_disponible,2);
  const invalidConfig=response();await tiers.crearTier({body:{id_evento:1,nombre:'Sin límite',precio:20000,entradas_por_paquete:4}},invalidConfig);assert.equal(invalidConfig.code,400);
  const draft=response();await tiers.crearTier({body:{id_evento:1,nombre:'Otra promo',precio:20000,entradas_por_paquete:4,cantidad_disponible:5,estado:false}},draft);assert.equal(draft.code,201);assert.equal(draft.body.estado,false);assert.equal(draft.body.cantidad_disponible,5);
  const bad=await buy(1,3);assert.equal(bad.code,400);
  const discounted=await buy(1,4,{codigo_descuento:'EXTRA'});assert.equal(discounted.code,400);
  const originalError=console.error; console.error=()=>{};
  failDetails=true;const failed=await buy(1,4);failDetails=false;console.error=originalError;
  assert.equal(failed.code,500);
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM compras_entradas')).rows[0].n,0);
  const results=await Promise.all([buy(1,4),buy(1,4),buy(1,4)]);
  assert.deepEqual(results.map(r=>r.code).sort(),[201,201,400]);
  assert.equal((await db.query('SELECT cantidad_disponible FROM entrada_tiers WHERE id_tier=1')).rows[0].cantidad_disponible,0);
  const purchase=results.find(r=>r.code===201).body.compra;
  assert.equal(Number(purchase.total),20000); assert.equal(purchase.cantidad,4);
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM compra_entrada_detalles WHERE id_compra=$1',[purchase.id_compra])).rows[0].n,4);
  const confirmed=await confirm.confirmarCompra(purchase.id_compra);
  assert.equal(confirmed.personas.length,4);assert.equal(mail.length,1);assert.ok(wallet.every(t=>t.precio===5000));
  const issued=(await db.query('SELECT uuid_entrada FROM compra_entrada_detalles WHERE id_compra=$1',[purchase.id_compra])).rows;
  assert.equal(new Set(issued.map(p=>p.uuid_entrada)).size,4);
  const report=response();await sales.obtenerEntradasPorEvento({params:{id_evento:1}},report);
  assert.equal(report.code,200);assert.equal(report.body.totales.total_entradas,4);assert.equal(report.body.totales.total_dinero,20000);assert.ok(report.body.entradas.every(row=>Number(row.precio)===5000));
  const resize=response();await tiers.actualizarTier({params:{id:1},body:{nombre:'Promo General 4',precio:20000,entradas_por_paquete:2,cantidad_disponible:5,estado:true}},resize);assert.equal(resize.code,409);
  await assert.rejects(confirm.confirmarCompra(purchase.id_compra),/ya fue confirmada/);
  const rejectPaid=response();await controller.rechazarCompra({params:{id:purchase.id_compra}},rejectPaid);assert.equal(rejectPaid.code,409);
  const pending=results.filter(r=>r.code===201)[1].body.compra;
  for(let i=0;i<2;i++){const rejected=response();await controller.rechazarCompra({params:{id:pending.id_compra}},rejected);assert.equal(rejected.code,200);}
  assert.equal((await db.query('SELECT cantidad_disponible FROM entrada_tiers WHERE id_tier=1')).rows[0].cantidad_disponible,1);
  await assert.rejects(confirm.confirmarCompra(pending.id_compra),/rechazada/);
  assert.equal((await buy(1,4)).code,201);
  const single=await buy(2,2,{codigo_descuento:'NORMAL'});assert.equal(Number(single.body.compra.total),13000);
  const double=await buy(3,2);assert.equal(Number(double.body.compra.total),12000);
  assert.ok(queries.some(q=>q.includes('FOR UPDATE')));
  await db.close();
});
