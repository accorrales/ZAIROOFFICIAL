const {test}=require('node:test'),assert=require('node:assert/strict');const {guard}=require('./guard.cjs');
const valid={ZAIRO_PHONE_QA:'1',NODE_ENV:'development',LOCATION_NOTIFICATIONS_ENABLED:'false',DATABASE_URL:'postgresql://zairo_phone_qa:fake@127.0.0.1:5546/zairo_phone_qa',JWT_SECRET:'x'.repeat(60)};
test('physical QA guard requires independent local database, opt-in, JWT and notifications off',()=>{
 assert.ok(guard(valid));assert.ok(guard({...valid,DATABASE_URL:valid.DATABASE_URL.replace('127.0.0.1','pg-ensayo')}));
 for(const bad of [{DATABASE_URL:valid.DATABASE_URL+'?host=production.example.invalid'},{ZAIRO_PHONE_QA:'0'},{NODE_ENV:'production'},{LOCATION_NOTIFICATIONS_ENABLED:'true'},{JWT_SECRET:'short'},{DATABASE_URL:valid.DATABASE_URL.replace('127.0.0.1','production.example.invalid')},{DATABASE_URL:valid.DATABASE_URL.replace('/zairo_phone_qa','/zairo_dev')},{DATABASE_URL:valid.DATABASE_URL.replace('zairo_phone_qa:fake','production:fake')}])assert.throws(()=>guard({...valid,...bad}));
});
