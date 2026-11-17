// Offline preparation only: no deployment, tunnel, provider login or production credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const destination=path.resolve(process.argv[2]||'/workspace/work/phone-qa');
assert.ok(!fs.existsSync(destination), 'Use a new private output directory; never overwrite an active session');
const schema=fs.readFileSync(process.env.PHONE_QA_SCHEMA_SOURCE||'/workspace/local-setup/zairo-estructura.sql','utf8');
assert.ok(!/^\s*(INSERT\s+INTO|COPY\s+.*FROM\s+stdin|CREATE\s+ROLE|CREATE\s+DATABASE|\\connect|\\!)/im.test(schema),'Schema-only input required');
assert.equal((schema.match(/CREATE TABLE public\./g)||[]).length,19,'Expected prepared empty 19-table schema');
fs.mkdirSync(destination,{recursive:true,mode:0o700});
fs.mkdirSync(path.join(destination,'qr'),{mode:0o700});
const write=(name,value)=>fs.writeFileSync(path.join(destination,name),value,{mode:0o600,flag:'wx'});
write('schema.sql',schema);
// Only DDL; the parent directory stays private. PostgreSQL's container user must read the mounted file.
fs.chmodSync(path.join(destination,'schema.sql'),0o644);
const password=crypto.randomBytes(32).toString('hex'),jwt=crypto.randomBytes(48).toString('hex');
write('postgres.env',`POSTGRES_USER=zairo_phone_qa\nPOSTGRES_DB=zairo_phone_qa\nPOSTGRES_PASSWORD=${password}\n`);
write('backend.env',`ZAIRO_PHONE_QA=1\nNODE_ENV=development\nLOCATION_NOTIFICATIONS_ENABLED=false\nDATABASE_URL=postgresql://zairo_phone_qa:${password}@127.0.0.1:5546/zairo_phone_qa\nJWT_SECRET=${jwt}\nPORT=3006\nPHONE_QA_PRIVATE_DIR=${destination}\n`);
write('compose.env',`PHONE_QA_DB_PASSWORD=${password}\nPHONE_QA_JWT_SECRET=${jwt}\nPHONE_QA_SCHEMA=${path.join(destination,'schema.sql')}\nPHONE_QA_PRIVATE_DIR=${destination}\nPHONE_QA_FRONTEND=${path.resolve(__dirname,'../../../zairo-frontend')}\nPHONE_QA_UID=${process.getuid()}\nPHONE_QA_GID=${process.getgid()}\n`);
console.log('Prepared private schema/environment files. No service was published; no credentials printed.');
