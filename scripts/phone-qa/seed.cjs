// Creates fresh, unconsumed fixtures. Unlike the automated verifier, this never scans them.
const {guard}=require('./guard.cjs');guard();
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const pool=require('../../src/config/database'),bcrypt=require('bcrypt'),QRCode=require('qrcode');
const root=process.env.PHONE_QA_PRIVATE_DIR||'/qa-private',manifestFile=path.join(root,'fixtures.json');
assert.ok(!fs.existsSync(manifestFile),'A session already exists; cleanup before a new seed');
const origin=process.env.PHONE_QA_LOCAL_API||'http://127.0.0.1:3006';
assert.ok(['127.0.0.1','localhost','api'].includes(new URL(origin).hostname));
const f={tag:crypto.randomUUID().slice(0,8),events:[],users:[],purchases:[],qr:[]};let token;
const save=()=>fs.writeFileSync(manifestFile,JSON.stringify(f,null,2),{mode:0o600});
async function api(route,body,method='POST',expected=200){const r=await fetch(origin+'/api'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,expected,route+' failed');return data;}
(async()=>{
 assert.deepEqual(await api('/qa-safety',null,'GET'),{phoneQA:true,emailStub:true,whatsapp:false,notifications:false});
 // Refuse mixing this session with any other data, even in the dedicated QA database.
 for(const table of ['eventos','usuarios','compras_entradas'])assert.equal(Number((await pool.query('SELECT count(*) n FROM '+table)).rows[0].n),0,'Dedicated empty QA database required');
 for(const alias of ['puerta-a','puerta-b','admin-a','admin-b']){
  const rol=alias.startsWith('admin')?'admin':'entrada',correo=`${alias}-${f.tag}@example.invalid`,password=crypto.randomBytes(10).toString('hex');
  const id=(await pool.query('INSERT INTO usuarios(nombre,correo,contrasena,rol) VALUES($1,$2,$3,$4) RETURNING id_usuario',['Ensayo '+alias,correo,await bcrypt.hash(password,10),rol])).rows[0].id_usuario;
  f.users.push({id,role:alias,rol,correo,password});save();
 }
 token=(await api('/auth/login',{correo:f.users[2].correo,password:f.users[2].password})).token;
 for(const name of ['ENSAYO ZAIRO · Puerta','ENSAYO ZAIRO · Otro evento']){
  const content=require('../../src/utils/eventContent').defaults({nombre:name,fecha:'2099-12-01',historia:'Contenido ficticio de ensayo físico'});
  f.events.push((await pool.query("INSERT INTO eventos(nombre,fecha,estado,publicacion,ventas_abiertas,mostrar_en_home,contenido_publicado,contenido_borrador) VALUES($1,'2099-12-01',true,'PUBLICADO',true,false,$2,$2) RETURNING id_evento",[name,content])).rows[0].id_evento);save();
 }
 const event=f.events[0];
 const vip=await api('/entrada-tiers',{id_evento:event,nombre:'Ensayo · seis VIP con mesa',precio:60000,cantidad_disponible:10,entradas_por_paquete:6,zona:'VIP',mesa_tipo:'COCTEL',beneficios_operativos:[{nombre:'Beneficio de una unidad (ficticio)',cantidad:1},{nombre:'Bebidas ficticias',cantidad:4}],estado:true},'POST',201);
 const general=await api('/entrada-tiers',{id_evento:event,nombre:'General ensayo',precio:1000,cantidad_disponible:30,entradas_por_paquete:1,zona:'GENERAL',estado:true},'POST',201);
 const other=await api('/entrada-tiers',{id_evento:f.events[1],nombre:'Otro evento ensayo',precio:1000,cantidad_disponible:2,entradas_por_paquete:1,zona:'GENERAL',estado:true},'POST',201);
 async function buy(tier,eventId,labels){
  const purchase=(await api('/compras-entradas',{id_evento:eventId,id_tier:tier,correo_comprador:'ensayo@example.invalid',telefono_comprador:'00000000',personas:labels.map(nombre_completo=>({nombre_completo,fecha_nacimiento:'2000-01-01'}))},'POST',201)).compra;
  f.purchases.push(purchase.id_compra);save();await api('/compras-entradas/'+purchase.id_compra+'/confirmar',{},'PATCH');
  const rows=(await pool.query('SELECT nombre_completo,uuid_entrada,id_paquete FROM compra_entrada_detalles WHERE id_compra=$1 ORDER BY id_detalle',[purchase.id_compra])).rows;
  for(const row of rows)f.qr.push({label:row.nombre_completo,uuid:row.uuid_entrada,packageId:row.id_paquete,purchase:purchase.id_compra,event:eventId});save();return rows;
 }
 const vipRows=await buy(vip.id_tier,event,[...Array.from({length:6},(_,i)=>'VIP-P1-'+(i+1)),...Array.from({length:6},(_,i)=>'VIP-P2-'+(i+1))]);
 f.packages={P1:vipRows[0].id_paquete,P2:vipRows[6].id_paquete};assert.notEqual(f.packages.P1,f.packages.P2);
 await buy(general.id_tier,event,['GENERAL-1','SIMULTANEO-1','SIN-RED-1',...Array.from({length:6},(_,i)=>'CAMARA-'+(i+1))]);
 await buy(other.id_tier,f.events[1],['OTRO-EVENTO-1']);
 for(const identifier of ['VIP A','VIP B','VIP C'])await api('/operacion/mesas',{id_evento:event,identificador:identifier,zona:'VIP',tipo:'COCTEL',capacidad:6,operation_id:crypto.randomUUID()});
 save();
 const cards=[];for(const item of f.qr){const png=await QRCode.toDataURL(item.uuid,{width:240,margin:4});cards.push(`<article><h2>${item.label}</h2><p>Evento ${item.event} · Paquete #${item.packageId} · Compra #${item.purchase}</p><img alt="QR ficticio ${item.label}" src="${png}" width="240" height="240"></article>`);}
 fs.mkdirSync(path.join(root,'qr'),{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(root,'qr','qr.html'),'<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>QR ficticios · Ensayo Zairo</title><style>body{font:16px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}article{border:1px solid #999;padding:12px;break-inside:avoid}h2{margin:0}img{display:block}@media print{main{grid-template-columns:1fr 1fr}body{margin:0}}</style><h1>ENSAYO ZAIRO · solo datos ficticios</h1><p>Mostrar en otra pantalla o imprimir al 100 %. Leer con el escáner de Zairo, no con la cámara del sistema. No usar QR de clientes.</p><main>'+cards.join('')+'</main></html>',{mode:0o600});
 fs.writeFileSync(path.join(root,'accesos.txt'),f.users.map(u=>`${u.role} (${u.rol})\nCorreo: ${u.correo}\nContraseña: ${u.password}\n`).join('\n'),{mode:0o600});
 assert.equal(Number((await pool.query('SELECT count(fecha_ingreso) n FROM compra_entrada_detalles')).rows[0].n),0);
 assert.equal(Number((await pool.query('SELECT coalesce(sum(entregada),0) n FROM paquete_beneficios')).rows[0].n),0);
 console.log('Prepared unconsumed fictitious QR, two independent VIP packages, General/camera/network cases, two events, three tables and four accounts. Private credentials were not printed.');
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>pool.end());
