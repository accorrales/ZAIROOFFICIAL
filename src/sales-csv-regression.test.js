const { test } = require('node:test');
const assert = require('node:assert/strict');

test('sales CSV declares CRC while keeping raw numeric prices and escaping fields', async () => {
  const db = require.resolve('./config/database');
  let query = 0;
  require.cache[db] = { id: db, filename: db, loaded: true, exports: { query: async () => ({ rows: ++query === 1 ? [{ nombre: 'Evento ficticio' }] : [{ nombre_completo: 'Persona, ficticia', correo_comprador: 'prueba@example.invalid', precio: '7500.50', tier: 'General', zona: 'GENERAL', id_compra: 1, estado: 'CONFIRMADA' }] }) } };
  const { descargarReporteCsv } = require('./controllers/entradasConfirmadasController');
  let csv;
  await descargarReporteCsv({ params: { id_evento: '1' } }, { setHeader() {}, send(value) { csv = value; } });
  assert.ok(csv.startsWith('\uFEFF'));
  const [header, row] = csv.trim().replace(/^\uFEFF/, '').split('\r\n');
  assert.ok(header.includes('Precio (CRC)'));
  assert.ok(row.includes('"Persona, ficticia"'));
  assert.ok(row.includes(',"7500.5",'));
  assert.ok(!row.includes('CRC 7'));
});
