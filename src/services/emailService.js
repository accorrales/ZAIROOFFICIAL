const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const getLogoUrl = () => {
  return (
    process.env.ZAIRO_LOGO_URL ||
    'https://www.zairoclub.com/assets/zairo-loader-logo.png'
  );
};

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const botonWallet = (href, label, bg, color = '#07120b') => {
  if (!href) return '';

  return `
    <a href="${href}" target="_blank" style="
      display:inline-block;
      margin:6px 5px 0;
      padding:13px 16px;
      border-radius:999px;
      background:${bg};
      color:${color};
      text-decoration:none;
      font-size:12px;
      font-weight:900;
      letter-spacing:.6px;
      border:1px solid rgba(255,255,255,.14);
    ">
      ${label}
    </a>
  `;
};

exports.enviarEntradas = async ({
  correo,
  evento,
  entrada,
  personas
}) => {
  const logoUrl = getLogoUrl();

  const tarjetasEntradas = personas.map((p, index) => `
    <div style="
      margin-bottom:24px;
      padding:24px;
      border-radius:26px;
      background:
        radial-gradient(circle at top, rgba(196,255,87,0.10), transparent 45%),
        #07120b;
      border:1px solid rgba(196,255,87,0.24);
      text-align:center;
      box-shadow:
        0 18px 42px rgba(0,0,0,0.28),
        inset 0 0 30px rgba(255,214,10,0.04);
    ">

      <div style="
        display:inline-block;
        padding:7px 12px;
        border-radius:999px;
        background:rgba(196,255,87,0.10);
        border:1px solid rgba(196,255,87,0.28);
        font-size:11px;
        letter-spacing:2px;
        color:#c6ff57;
        margin-bottom:12px;
        font-weight:800;
      ">
        ENTRADA #${index + 1}
      </div>

      <div style="
        font-size:21px;
        font-weight:900;
        margin-bottom:6px;
        color:#ffffff;
      ">
        ${escapeHtml(p.nombre_completo)}
      </div>

      <div style="
        font-size:13px;
        color:#b8c7a5;
        margin-bottom:18px;
      ">
        Código QR individual de acceso
      </div>

      <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:22px auto 0; border-collapse:separate; border-spacing:0;">
        <tr>
          <td align="center" valign="middle" style="
            width:248px;
            height:248px;
            padding:14px;
            border-radius:26px;
            background:linear-gradient(135deg, #baff39, #f4e900);
            box-shadow:0 0 28px rgba(198,255,87,0.18), 0 0 38px rgba(255,214,10,0.12);
            text-align:center;
            line-height:0;
            font-size:0;
          ">
            <img
              src="${p.qr_url}"
              alt="QR Entrada ${index + 1}"
              width="220"
              height="220"
              style="
                width:220px;
                height:220px;
                display:block;
                margin:0 auto;
                background:#ffffff;
                padding:12px;
                border-radius:18px;
                box-sizing:border-box;
                border:0;
                outline:none;
                text-decoration:none;
              "
            />
          </td>
        </tr>
      </table>

      <div style="margin-top:18px;">
        ${botonWallet(p.qr_url, 'Abrir QR', '#ffd60a', '#07120b')}
        ${botonWallet(p.apple_wallet_url, 'Agregar a Apple Wallet', '#ffffff', '#050505')}
        ${botonWallet(p.google_wallet_url, 'Agregar a Google Wallet', '#c6ff57', '#07120b')}
        ${botonWallet(p.ticket_url, 'Ver entrada online', 'transparent', '#c6ff57')}
      </div>

      <p style="
        margin-top:16px;
        font-size:12px;
        color:#8fa27d;
      ">
        Si la imagen del QR no carga en tu correo, tocá “Abrir QR”. Esta entrada es personal y válida para un único ingreso.
      </p>

    </div>
  `).join('');

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'ZAIRO <onboarding@resend.dev>',
    to: [correo],
    subject: `Tus entradas oficiales para ${evento}`,
    html: `
      <div style="
        margin:0;
        padding:44px 18px;
        background:
          radial-gradient(circle at top left, rgba(198,255,87,0.16), transparent 28%),
          radial-gradient(circle at top right, rgba(255,214,10,0.14), transparent 30%),
          linear-gradient(180deg, #020403 0%, #061008 42%, #020403 100%);
        font-family:Arial, Helvetica, sans-serif;
        color:#ffffff;
      ">

        <div style="
          max-width:720px;
          margin:0 auto;
          background:linear-gradient(180deg, rgba(7,18,11,0.98), rgba(3,10,6,0.98));
          border-radius:32px;
          overflow:hidden;
          border:1px solid rgba(198,255,87,0.22);
          box-shadow:0 28px 80px rgba(0,0,0,0.45), 0 0 55px rgba(198,255,87,0.08);
        ">

          <div style="
            padding:54px 32px 44px;
            background:radial-gradient(circle at center top, rgba(198,255,87,0.18), transparent 42%), linear-gradient(135deg, #07120b 0%, #020403 100%);
            text-align:center;
            border-bottom:1px solid rgba(198,255,87,0.16);
          ">

            <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto; border-collapse:separate;">
              <tr>
                <td align="center" valign="middle" style="
                  width:112px;
                  height:112px;
                  border-radius:28px;
                  background:radial-gradient(circle at top, rgba(198,255,87,0.18), transparent 55%), rgba(3,14,8,0.92);
                  border:1px solid rgba(198,255,87,0.38);
                  box-shadow:0 0 28px rgba(198,255,87,0.20), 0 0 44px rgba(255,214,10,0.10), inset 0 0 24px rgba(255,255,255,0.04);
                  padding:10px;
                  box-sizing:border-box;
                  text-align:center;
                  line-height:0;
                  font-size:0;
                ">
                  <img
                    src="${logoUrl}"
                    alt="Logo ZAIRO"
                    width="92"
                    height="92"
                    style="
                      width:92px;
                      height:92px;
                      object-fit:contain;
                      display:block;
                      margin:0 auto;
                      border-radius:20px;
                      border:0;
                      outline:none;
                      text-decoration:none;
                    "
                  />
                </td>
              </tr>
            </table>

            <h1 style="
              margin:24px 0 8px;
              font-size:44px;
              letter-spacing:5px;
              line-height:1;
              color:#ffffff;
            ">
              ZAIRO
            </h1>

            <p style="
              color:#c6ff57;
              font-size:13px;
              letter-spacing:3px;
              font-weight:800;
              margin:0;
            ">
              LOST TRIP • OFFICIAL ACCESS
            </p>

          </div>

          <div style="padding:42px 34px;">

            <div style="
              display:inline-block;
              padding:8px 13px;
              border-radius:999px;
              background:rgba(255,214,10,0.10);
              border:1px solid rgba(255,214,10,0.25);
              color:#ffd60a;
              font-size:11px;
              letter-spacing:2px;
              font-weight:900;
              margin-bottom:16px;
            ">
              COMPRA CONFIRMADA
            </div>

            <h2 style="
              margin:0 0 14px;
              font-size:32px;
              line-height:1.1;
              color:#ffffff;
            ">
              Tus entradas ya están listas 🔥
            </h2>

            <p style="
              color:#cbd5c1;
              line-height:1.75;
              font-size:15px;
              margin:0;
            ">
              Tu compra fue confirmada correctamente. Cada persona registrada tiene
              su propio código QR individual para ingresar al evento.
            </p>

            <div style="
              margin:32px 0;
              padding:24px;
              border-radius:24px;
              background:linear-gradient(135deg, rgba(198,255,87,0.08), rgba(255,214,10,0.04)), #08130c;
              border:1px solid rgba(198,255,87,0.20);
              color:#ffffff;
            ">

              <h3 style="
                margin:0 0 18px;
                color:#c6ff57;
                font-size:18px;
                letter-spacing:1px;
              ">
                Información del evento
              </h3>

              <p style="margin:10px 0; color:#e5f2dc;">
                <strong style="color:#ffffff;">Evento:</strong> ${escapeHtml(evento)}
              </p>

              <p style="margin:10px 0; color:#e5f2dc;">
                <strong style="color:#ffffff;">Entrada:</strong> ${escapeHtml(entrada)}
              </p>

              <p style="margin:10px 0; color:#e5f2dc;">
                <strong style="color:#ffffff;">Fecha confirmación:</strong> ${new Date().toLocaleString('es-CR')}
              </p>

              <p style="margin:10px 0; color:#e5f2dc;">
                <strong style="color:#ffffff;">Correo:</strong> ${escapeHtml(correo)}
              </p>

            </div>

            <div style="margin:34px 0;">
              <h3 style="
                color:#ffffff;
                margin:0 0 18px;
                font-size:22px;
              ">
                Entradas registradas
              </h3>

              ${tarjetasEntradas}
            </div>

            <div style="
              margin-top:40px;
              padding:24px;
              border-radius:22px;
              background:radial-gradient(circle at top left, rgba(198,255,87,0.12), transparent 45%), #03170e;
              border:1px solid rgba(52,211,153,0.30);
            ">

              <h3 style="
                margin:0 0 14px;
                color:#c6ff57;
                font-size:18px;
              ">
                Información importante
              </h3>

              <ul style="
                padding-left:18px;
                margin:0;
                line-height:1.8;
                color:#d8e8ce;
                font-size:14px;
              ">
                <li>Presentá el QR correspondiente a cada persona.</li>
                <li>No compartás tus códigos QR.</li>
                <li>Se solicitará identificación en la entrada.</li>
                <li>Cada entrada es válida únicamente una vez.</li>
              </ul>

            </div>

            <div style="
              margin-top:42px;
              padding-top:24px;
              border-top:1px solid rgba(198,255,87,0.14);
              text-align:center;
              color:#8fa27d;
              font-size:13px;
            ">
              <strong style="color:#c6ff57;">ZAIRO EXPERIENCE</strong><br>
              © 2026 • Official Digital Access
            </div>

          </div>

        </div>

      </div>
    `
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
};
