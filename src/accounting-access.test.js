const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');

test('accounting can use financial APIs while unrelated operations remain denied', async () => {
  // Exercise the real app and route middleware; controller stubs prevent any
  // database writes, ticket issuance or messages during authorization checks.
  for (const file of fs.readdirSync(path.join(__dirname, 'controllers'))) {
    const full = path.join(__dirname, 'controllers', file);
    const source = fs.readFileSync(full, 'utf8');
    const names = [...source.matchAll(/(?:const|exports\.)\s*([a-zA-Z]\w*)\s*=/g)].map(m=>m[1]);
    const exports = Object.fromEntries(names.map(name=>[name, (req,res)=>res.json({ ok: true })]));
    require.cache[full] = { id: full, filename: full, loaded: true, exports };
  }
  const db = require.resolve('./config/database');
  require.cache[db] = { id: db, filename: db, loaded: true, exports: { query: async()=>({ rows: [] }) } };
  const wa = require.resolve('./modules/whatsapp/whatsapp.routes');
  require.cache[wa] = { id: wa, filename: wa, loaded: true, exports: express.Router() };
  const cron = require.resolve('./jobs/locationNotificationCron');
  require.cache[cron] = { id: cron, filename: cron, loaded: true, exports: { iniciarLocationNotificationCron() {} } };
  const listen = express.application.listen;
  let app;
  express.application.listen = function() { app = this; };
  process.env.JWT_SECRET = 'local-authorization-test-only';
  require('./app');
  // Schema preparation now completes before the application listens.
  await new Promise(resolve => setImmediate(resolve));
  express.application.listen = listen;
  app.listen = listen;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve=>server.on('listening',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const cases = [
    ['GET','/api/empleados',200], ['GET','/api/departamentos',200],
    ['GET','/api/conceptos',200], ['GET','/api/novedades',200],
    ['GET','/api/planillas',200], ['GET','/api/planillas/1/detalle',200],
    ['POST','/api/planillas/confirmar/1',200],
    ['GET','/api/eventos/admin/todos',200],
    ['GET','/api/compras-entradas/pendientes',403],
    ['GET','/api/compras-entradas/1',403],
    ['PATCH','/api/compras-entradas/1/confirmar',403],
    ['PATCH','/api/compras-entradas/1/rechazar',403],
    ['GET','/api/dashboard-entradas/evento/1',200],
    ['GET','/api/dashboard-entradas/evento/1/reporte.csv',200],
    ['PATCH','/api/dashboard-entradas/detalle/1/invalidar',403],
    ['GET','/api/usuarios',403], ['POST','/api/eventos',403],
    ['POST','/api/compras-entradas/validar-qr',403]
  ];
  try {
    for (const [method,url,status] of cases) {
      const token = jwt.sign({rol:'contabilidad'},process.env.JWT_SECRET,{expiresIn:'1h'});
      const response = await fetch(origin+url,{method,headers:{Authorization:`Bearer ${token}`}});
      assert.equal(response.status,status,`${method} ${url}`);
    }
    const denied = await fetch(origin+'/api/dashboard-entradas/evento/1');
    assert.equal(denied.status,401);
    const token = jwt.sign({rol:'admin'},process.env.JWT_SECRET,{expiresIn:'1h'});
    const admin = await fetch(origin+'/api/dashboard-entradas/detalle/1/invalidar',{method:'PATCH',headers:{Authorization:`Bearer ${token}`}});
    assert.equal(admin.status,200);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
