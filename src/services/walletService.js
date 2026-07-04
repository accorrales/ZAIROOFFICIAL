const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// Imagenes de marca para el pase de Apple Wallet (se versionan en el repo).
const WALLET_ASSETS_DIR = path.join(__dirname, '..', 'assets', 'wallet');

const APPLE_PASS_IMAGES = [
  'icon.png',
  'icon@2x.png',
  'icon@3x.png',
  'logo.png',
  'logo@2x.png',
  'logo@3x.png'
];

const getFrontendUrl = () =>
  (process.env.FRONTEND_PUBLIC_URL || 'https://zairoclub.com').replace(/\/$/, '');

const getBackendUrl = () =>
  (process.env.BACKEND_PUBLIC_URL || 'https://zairoofficial-production.up.railway.app').replace(/\/$/, '');

const money = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const toIsoDate = (date) => {
  if (!date) return undefined;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

const toGoogleDateTime = (date) => toIsoDate(date);

// Fecha legible para mostrar dentro del pase (ej: "viernes, 5 de diciembre, 09:00 p. m.")
const formatEventDate = (date) => {
  if (!date) return undefined;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return undefined;
  try {
    return parsed.toLocaleString('es-CR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Costa_Rica'
    });
  } catch {
    return parsed.toISOString();
  }
};

// Lee las imagenes del pase desde el disco. El icono es obligatorio para Apple;
// el resto es opcional y se omite si faltara para no romper la generacion.
const loadApplePassImages = () => {
  const images = {};

  for (const name of APPLE_PASS_IMAGES) {
    try {
      images[name] = fs.readFileSync(path.join(WALLET_ASSETS_DIR, name));
    } catch {
      // imagen opcional faltante: se omite
    }
  }

  if (!images['icon.png']) {
    const error = new Error(
      'Falta el icono del pase de Apple Wallet (src/assets/wallet/icon.png)'
    );
    error.statusCode = 500;
    throw error;
  }

  return images;
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

const getWalletLogoUrl = () =>
  process.env.ZAIRO_LOGO_URL ||
  'https://www.zairoclub.com/assets/zairo-loader-logo.png';

// Imagen principal (heroImage) del pase de Google Wallet. Configurable por
// entorno; si no está definida, se arma a partir del frontend público.
const getGoogleWalletHeroImageUrl = () =>
  process.env.GOOGLE_WALLET_HERO_IMAGE_URL ||
  `${getFrontendUrl()}/wallet/zairo-lost-trip-wallet.png`;

// Color de fondo de marca para el pase de Google Wallet (formato #rrggbb)
const WALLET_BACKGROUND_COLOR = '#07120b';

const buildWalletImage = (uri, description) => ({
  sourceUri: { uri },
  contentDescription: {
    defaultValue: {
      language: 'es-CR',
      value: description || 'ZAIRO'
    }
  }
});

const getGoogleClassId = (issuerId, entrada = {}) => {
  if (process.env.GOOGLE_WALLET_CLASS_ID) {
    return process.env.GOOGLE_WALLET_CLASS_ID;
  }

  const suffix = process.env.GOOGLE_WALLET_CLASS_SUFFIX || 'zairo_event_tickets';
  const eventoId =
    entrada.id_evento != null
      ? String(entrada.id_evento).replace(/[^a-zA-Z0-9._-]/g, '_')
      : null;

  // Una clase por evento: cada evento crea su propia clase ya con la marca
  // (logo, color de fondo y banner). Así el QR queda enmarcado y proporcionado
  // en Android, en vez de compartir una clase sin estilo.
  return eventoId
    ? `${issuerId}.${suffix}_evt_${eventoId}`
    : `${issuerId}.${suffix}`;
};

const GOOGLE_WALLET_SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';
const GOOGLE_WALLET_API_BASE = 'https://walletobjects.googleapis.com/walletobjects/v1';

// Autenticación server-to-server contra la API de Google Wallet (distinta del
// JWT "savetowallet" que recibe el botón: este token es para llamar a la REST API).
const getGoogleWalletAccessToken = async (serviceAccountEmail, privateKey) => {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: serviceAccountEmail,
      scope: GOOGLE_WALLET_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    },
    privateKey,
    { algorithm: 'RS256' }
  );

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!response.ok) {
    throw new Error(`No se pudo obtener el token de Google Wallet (${response.status})`);
  }

  const data = await response.json();
  return data.access_token;
};

// Si la clase de Google Wallet ya existe, insertarla de nuevo dentro del JWT no
// tiene efecto (Google ignora la definición y conserva la ya guardada). Por eso
// aquí se consulta primero y, si existe, se actualiza con PATCH (heroImage,
// logo, color); si no existe, se crea con POST.
const ensureGoogleWalletClass = async (eventTicketClass, serviceAccountEmail, privateKey) => {
  const accessToken = await getGoogleWalletAccessToken(serviceAccountEmail, privateKey);
  const classUrl = `${GOOGLE_WALLET_API_BASE}/eventTicketClass/${encodeURIComponent(eventTicketClass.id)}`;

  const getResponse = await fetch(classUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (getResponse.status === 404) {
    const insertResponse = await fetch(`${GOOGLE_WALLET_API_BASE}/eventTicketClass`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventTicketClass)
    });

    if (!insertResponse.ok) {
      const body = await insertResponse.text();
      throw new Error(`No se pudo crear la clase de Google Wallet: ${insertResponse.status} ${body}`);
    }
    return;
  }

  if (!getResponse.ok) {
    const body = await getResponse.text();
    throw new Error(`No se pudo consultar la clase de Google Wallet: ${getResponse.status} ${body}`);
  }

  const patchResponse = await fetch(classUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      heroImage: eventTicketClass.heroImage,
      logo: eventTicketClass.logo,
      hexBackgroundColor: eventTicketClass.hexBackgroundColor
    })
  });

  if (!patchResponse.ok) {
    const body = await patchResponse.text();
    throw new Error(`No se pudo actualizar la clase de Google Wallet: ${patchResponse.status} ${body}`);
  }
};

const generarApplePass = async (entrada) => {
  if (!isAppleWalletConfigured()) {
    const error = new Error('Apple Wallet todavía no tiene certificados configurados');
    error.statusCode = 501;
    throw error;
  }

  const { PKPass } = require('passkit-generator');

  const nombreEvento = entrada.evento || 'ZAIRO Experience';
  const qrData = entrada.qr_data || getTicketUrl(entrada.uuid_entrada);
  const fechaLegible = formatEventDate(entrada.fecha_evento);
  const usada = String(entrada.estado || '').toUpperCase() === 'USADA';

  const auxiliaryFields = [
    { key: 'venue', label: 'LUGAR', value: entrada.ubicacion_evento || 'ZAIRO Experience' }
  ];

  if (fechaLegible) {
    auxiliaryFields.push({ key: 'datetime', label: 'CUÁNDO', value: fechaLegible });
  }

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_IDENTIFIER,
    teamIdentifier: process.env.APPLE_TEAM_IDENTIFIER,
    organizationName: 'ZAIRO',
    description: `Entrada ${nombreEvento}`,
    serialNumber: entrada.uuid_entrada,
    logoText: 'ZAIRO',
    foregroundColor: 'rgb(255,255,255)',
    backgroundColor: 'rgb(4,12,7)',
    labelColor: 'rgb(198,255,87)',
    sharingProhibited: true,
    voided: usada,
    relevantDate: toIsoDate(entrada.fecha_evento),
    barcodes: [
      {
        message: qrData,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1',
        altText: 'ZAIRO'
      }
    ],
    eventTicket: {
      headerFields: fechaLegible
        ? [{ key: 'header', label: 'ZAIRO', value: 'ENTRADA' }]
        : [],
      primaryFields: [
        { key: 'event', label: 'EVENTO', value: nombreEvento }
      ],
      secondaryFields: [
        { key: 'ticket', label: 'ENTRADA', value: entrada.entrada || 'Entrada' },
        { key: 'name', label: 'PERSONA', value: entrada.nombre_completo || '' }
      ],
      auxiliaryFields,
      backFields: [
        {
          key: 'terms',
          label: 'Importante',
          value: 'Entrada personal válida para un único ingreso. Se solicitará identificación oficial al ingresar.'
        },
        {
          key: 'estado',
          label: 'Estado',
          value: usada ? 'Entrada ya utilizada' : 'Entrada válida'
        },
        {
          key: 'url',
          label: 'Ver entrada online',
          value: getTicketUrl(entrada.uuid_entrada),
          dataDetectorTypes: ['PKDataDetectorTypeLink']
        },
        { key: 'serial', label: 'ID de entrada', value: entrada.uuid_entrada }
      ]
    }
  };

  const pass = new PKPass(
    {
      'pass.json': Buffer.from(JSON.stringify(passJson)),
      ...loadApplePassImages()
    },
    {
      signerCert: Buffer.from(process.env.APPLE_WALLET_CERT_PEM.replace(/\\n/g, '\n')),
      signerKey: Buffer.from(process.env.APPLE_WALLET_KEY_PEM.replace(/\\n/g, '\n')),
      wwdr: Buffer.from(process.env.APPLE_WWDR_PEM.replace(/\\n/g, '\n')),
      signerKeyPassphrase: process.env.APPLE_WALLET_KEY_PASSPHRASE || undefined
    }
  );

  return pass.getAsBuffer();
};

const generarGoogleWalletUrl = async (entrada) => {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const serviceAccountEmail = process.env.GOOGLE_WALLET_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY;

  if (!issuerId || !serviceAccountEmail || !privateKey) {
    return null;
  }

  const safeUuid = String(entrada.uuid_entrada).replace(/[^a-zA-Z0-9._-]/g, '_');
  const classId = getGoogleClassId(issuerId, entrada);
  const objectId = `${issuerId}.${safeUuid}`;
  const qrData = entrada.qr_data || getTicketUrl(entrada.uuid_entrada);
  const normalizedPrivateKey = privateKey.replace(/\\n/g, '\n');

  const eventTicketClass = {
    id: classId,
    issuerName: 'ZAIRO',
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: WALLET_BACKGROUND_COLOR,
    logo: buildWalletImage(getWalletLogoUrl(), 'ZAIRO'),
    heroImage: buildWalletImage(
      getGoogleWalletHeroImageUrl(),
      entrada.evento || 'ZAIRO Experience'
    ),
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
  };

  // Si la clase ya existe (evento creado previamente), se actualiza vía la API
  // REST para que el heroImage/logo/color reflejen el valor actual; si falla
  // (p. ej. sin conectividad puntual), no se interrumpe la generación del pase:
  // el JWT igual se firma y el botón "Save to Google Wallet" sigue funcionando.
  try {
    await ensureGoogleWalletClass(eventTicketClass, serviceAccountEmail, normalizedPrivateKey);
  } catch (error) {
    console.error('ERROR SINCRONIZANDO CLASE DE GOOGLE WALLET:', error.message);
  }

  const payload = {
    iss: serviceAccountEmail,
    aud: 'google',
    typ: 'savetowallet',
    origins: [getFrontendUrl(), getBackendUrl()],
    payload: {
      eventTicketClasses: [eventTicketClass],
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

  const token = jwt.sign(payload, normalizedPrivateKey, { algorithm: 'RS256' });
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
