// Dedicated test entrypoint. Never used by npm start or production.
const {guard} = require('./guard.cjs');
guard();
const path = require('node:path');
const {createRequire} = require('node:module');
const req = createRequire(path.resolve(__dirname, '../../package.json'));
// Remove real outbound credentials before importing any application module.
for (const key of Object.keys(process.env)) {
  if (/^(WHATSAPP_|GOOGLE_|APPLE_|RESEND_|SMTP_|EMAIL_)/.test(key)) delete process.env[key];
}
process.env.DOTENV_CONFIG_PATH = '/nonexistent-phone-qa.env';
const stub = (name, exports) => {const id = req.resolve(name);require.cache[id] = {id,filename:id,loaded:true,exports};};
stub('./node_modules/dotenv', {config:()=>({parsed:{}})});
stub('./src/services/emailService', new Proxy({}, {get:()=>async()=>({simulated:true})}));
stub('./src/services/walletService', {
  getTicketUrl:uuid=>'/t/'+uuid, getQrUrl:uuid=>'/api/compras-entradas/qr/'+uuid,
  getAppleWalletUrl:()=>null, generarGoogleWalletUrl:async()=>null
});
const express = req('express'), originalListen = express.application.listen;
express.application.listen = function(port, callback) {
  this.get('/api/qa-safety', (_req,res)=>res.json({phoneQA:true,emailStub:true,whatsapp:false,notifications:false}));
  return originalListen.call(this, port, process.env.PHONE_QA_BIND || '127.0.0.1', callback);
};
req('./src/app.js');
