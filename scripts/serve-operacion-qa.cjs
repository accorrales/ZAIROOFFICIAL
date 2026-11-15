const { createRequire } = require('module');
const req = createRequire(require('path').resolve(__dirname, '../package.json'));
if (process.env.ZAIRO_OPERATION_TEST !== '1')
    throw new Error('Explicit QA opt-in required');
if (!['127.0.0.1', 'localhost'].includes(new URL(process.env.DATABASE_URL).hostname))
    throw new Error('Local database required');
if (process.env.LOCATION_NOTIFICATIONS_ENABLED !== 'false' || process.env.NODE_ENV !== 'development')
    throw new Error('Development mode and notifications off required');
const mock = (path, exports) => { const id = req.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports }; };
mock('./src/services/emailService', new Proxy({}, { get: () => async () => { process.stdout.write('QA: email stub only; no message sent\n'); } }));
mock('./src/services/walletService', { getTicketUrl: id => 'http://127.0.0.1:4302/t/' + id, getQrUrl: id => 'http://127.0.0.1:3002/api/compras-entradas/qr/' + id, getAppleWalletUrl: id => 'http://127.0.0.1:3002/api/compras-entradas/wallet/apple/' + id, generarGoogleWalletUrl: async () => null });
const express = req('express'), listen = express.application.listen;
express.application.listen = function (...args) { this.get('/api/qa-safety', (_req, res) => res.json({ emailStub: true, notifications: false })); return listen.apply(this, args); };
req('./src/app.js');
