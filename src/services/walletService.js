const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');

const getFrontendUrl = () =>
  (process.env.FRONTEND_PUBLIC_URL || 'https://zairoclub.com').replace(/\/$/, '');

const getBackendUrl = () =>
  (process.env.BACKEND_PUBLIC_URL || 'https://zairoofficial-production.up.railway.app').replace(/\/$/, '');

const money = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const toGoogleDateTime = (date) => {
  if (!date) return undefined;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

const isAppleWalletConfigured = () =>
  Boolean(
    process.env.APPLE_PASS_TYPE_IDENTIFIER &&
    process.env.APPLE_TEAM_IDENTIFIER &&
    process.env.APPLE_WALLET_CERT_PEM &&
    process.env.APPLE_WALLET_KEY_PEM &&
    process.env.APPLE_WWDR_PEM
  );

const getTicketUrl = (uuidEntrada) => `${getFrontendUrl()}/t/${uuidEntrada}`;
const getQrUrl = (uuidEntrada) => `${getBackendUrl()}/api/compras-entradas/qr/${uuidEntrada}`;
const getAppleWalletUrl = (uuidEntrada) =>
  isAppleWalletConfigured()
    ? `${getBackendUrl()}/api/compras-entradas/wallet/apple/${uuidEntrada}`
    : null;

const generarApplePass = async (entrada) => {
  if (!isAppleWalletConfigured()) {
    const error = new Error('Apple Wallet todavía no tiene certificados configurados');
    error.statusCode = 501;
    throw error;
  }

  const { PKPass } = require('passkit-generator');

  const qrData = entrada.qr_data || getTicketUrl(entrada.uuid_entrada);
  const qrPng = await QRCode.toBuffer(qrData, { width: 600, margin: 1 });

  const pass = new PKPass({
    'pass.json': Buffer.from(JSON.stringify({
      formatVersion: 1,
      passTypeIdentifier: process.env.APPLE_PASS_TYPE_IDENTIFIER,
      teamIdentifier: process.env.APPLE_TEAM_IDENTIFIER,
      organizationName: 'ZAIRO',
      description: `Entrada ${entrada.evento}`,
      serialNumber: entrada.uuid_entrada,
      logoText: 'ZAIRO',
      foregroundColor: 'rgb(255,255,255)',
      backgroundColor: 'rgb(4,12,7)',
      labelColor: 'rgb(198,255,87)',
      relevantDate: entrada.fecha_evento ? new Date(entrada.fecha_evento).toISOString() : undefined,
      eventTicket: {
        primaryFields: [
          { key: 'event', label: 'EVENTO', value: entrada.evento || 'ZAIRO' }
        ],
        secondaryFields: [
          { key: 'ticket', label: 'ENTRADA', value: entrada.entrada || 'Entrada' },
          { key: 'name', label: 'PERSONA', value: entrada.nombre_completo || '' }
        ],
        auxiliaryFields: [
          { key: 'venue', label: 'LUGAR', value: entrada.ubicacion_evento || 'ZAIRO Experience' }
        ],
        backFields: [
          { key: 'terms', label: 'Importante', value: 'Entrada personal válida para un único ingreso. Se solicitará identificación.' },
          { key: 'url', label: 'Ver entrada', value: getTicketUrl(entrada.uuid_entrada) }
        ]
      },
      barcodes: [
        {
          message: qrData,
          format: 'PKBarcodeFormatQR',
          messageEncoding: 'iso-8859-1'
        }
      ]
    })),
    'icon.png': qrPng,
    'icon@2x.png': qrPng,
    'logo.png': qrPng,
    'logo@2x.png': qrPng
  }, {
    signerCert: Buffer.from(process.env.APPLE_WALLET_CERT_PEM.replace(/\\n/g, '\n')),
    signerKey: Buffer.from(process.env.APPLE_WALLET_KEY_PEM.replace(/\\n/g, '\n')),
    wwdr: Buffer.from(process.env.APPLE_WWDR_PEM.replace(/\\n/g, '\n')),
    signerKeyPassphrase: process.env.APPLE_WALLET_KEY_PASSPHRASE || undefined
  });

  return pass.getAsBuffer();
};

const generarGoogleWalletUrl = (entrada) => {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const serviceAccountEmail = process.env.GOOGLE_WALLET_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY;

  if (!issuerId || !serviceAccountEmail || !privateKey) {
    return null;
  }

  const safeUuid = String(entrada.uuid_entrada).replace(/[^a-zA-Z0-9._-]/g, '_');
  const classId = `${issuerId}.zairo_event_tickets`;
  const objectId = `${issuerId}.${safeUuid}`;
  const qrData = entrada.qr_data || getTicketUrl(entrada.uuid_entrada);

  const payload = {
    iss: serviceAccountEmail,
    aud: 'google',
    typ: 'savetowallet',
    origins: [getFrontendUrl(), getBackendUrl()],
    payload: {
      eventTicketClasses: [
        {
          id: classId,
          issuerName: 'ZAIRO',
          reviewStatus: 'UNDER_REVIEW',
          eventName: {
            defaultValue: {
              language: 'es-CR',
              value: entrada.evento || 'ZAIRO Experience'
            }
          },
          venue: {
            name: {
              defaultValue: {
                language: 'es-CR',
                value: entrada.ubicacion_evento || 'ZAIRO'
              }
            },
            address: {
              defaultValue: {
                language: 'es-CR',
                value: entrada.ubicacion_evento || 'Costa Rica'
              }
            }
          },
          dateTime: {
            start: toGoogleDateTime(entrada.fecha_evento)
          }
        }
      ],
      eventTicketObjects: [
        {
          id: objectId,
          classId,
          state: entrada.estado === 'USADA' ? 'INACTIVE' : 'ACTIVE',
          ticketHolderName: entrada.nombre_completo,
          ticketNumber: entrada.uuid_entrada,
          barcode: {
            type: 'QR_CODE',
            value: qrData,
            alternateText: 'ZAIRO QR'
          },
          seatInfo: {
            section: {
              defaultValue: {
                language: 'es-CR',
                value: entrada.entrada || 'Entrada General'
              }
            }
          },
          faceValue: {
            micros: String(Math.round(money(entrada.precio) * 1000000)),
            currencyCode: 'CRC'
          },
          textModulesData: [
            {
              header: 'Importante',
              body: 'Entrada personal válida para un único ingreso. Se solicitará identificación.'
            }
          ],
          linksModuleData: {
            uris: [
              {
                uri: getTicketUrl(entrada.uuid_entrada),
                description: 'Ver entrada ZAIRO'
              }
            ]
          }
        }
      ]
    }
  };

  const token = jwt.sign(payload, privateKey.replace(/\\n/g, '\n'), { algorithm: 'RS256' });
  return `https://pay.google.com/gp/v/save/${token}`;
};

module.exports = {
  getTicketUrl,
  getQrUrl,
  getAppleWalletUrl,
  isAppleWalletConfigured,
  generarApplePass,
  generarGoogleWalletUrl
};
