const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const {ageAtEvent}=require('./eventAge');
const event={id_evento:71,fecha:'2026-11-01T02:00:00Z',estado:true};
test('age uses the Costa Rica calendar, including the sixteenth birthday',()=>{
 assert.equal(ageAtEvent('2010-10-31',event.fecha),16);
 assert.equal(ageAtEvent('2010-11-01',event.fecha),15);
 assert.equal(ageAtEvent('2008-10-31',event.fecha),18);
 assert.equal(ageAtEvent('2010-02-30',event.fecha),null);
 assert.equal(ageAtEvent('',event.fecha),null);
 assert.equal(ageAtEvent('2010-10-31','2026-10-31'),16);
});
for(const [birth,expected] of [['2010-10-31',201],['2009-10-31',201],['2008-10-31',201],['2010-11-01',400],['2027-01-01',400],['2010-02-30',400]]){
 test(`real purchase controller validates ${birth}`,async()=>{
  const writes=[];const pool={query:async sql=>{if(sql.includes('FROM eventos'))return {rows:[event]};if(sql.includes('FROM entrada_tiers'))return {rows:[{id_tier:2,precio:6000}]};writes.push(sql);return {rows:[{id_compra:'MOCK'}]}}};
  const sandbox={exports:{},console,require:name=>name==='../config/database'?pool:name==='../utils/eventAge'?{ageAtEvent}:{}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/../controllers/comprasEntradasController.js','utf8'),sandbox);
  const req={body:{id_evento:71,id_tier:2,correo_comprador:'qa@example.test',telefono_comprador:'88888888',personas:[{nombre_completo:'Prueba',fecha_nacimiento:birth}]}};
  const res={status(code){this.code=code;return this},json(data){this.body=data;return this}};
  await sandbox.exports.crearCompra(req,res);assert.equal(res.code,expected);
  if(expected===201)assert.equal(writes.length,2);else assert.equal(writes.length,0);
  if(birth==='2010-11-01'){assert.match(res.body.message,/16 años/);assert.match(res.body.message,/acompañante mayor de 18/);}
 });
}
