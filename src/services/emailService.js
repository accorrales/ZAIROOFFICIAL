const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

exports.enviarEntradas = async ({
  correo,
  evento,
  entrada,
  personas
}) => {

  const attachments = personas.map((p, index) => ({
    filename: `Entrada-${index + 1}-${p.nombre_completo}.png`,
    content: p.qr_base64.split(',')[1]
  }));

  const tarjetasEntradas = personas.map((p, index) => `
    <div style="
      margin-bottom:22px;
      padding:22px;
      border-radius:22px;
      background:#111827;
      border:1px solid #263244;
      text-align:center;
    ">

      <div style="
        font-size:12px;
        letter-spacing:2px;
        color:#34d399;
        margin-bottom:8px;
        font-weight:bold;
      ">
        ENTRADA #${index + 1}
      </div>

      <div style="
        font-size:20px;
        font-weight:800;
        margin-bottom:6px;
        color:#ffffff;
      ">
        ${p.nombre_completo}
      </div>

      <div style="
        font-size:13px;
        color:#9ca3af;
        margin-bottom:18px;
      ">
        Código QR individual adjunto a este correo.
      </div>

      <p style="
        margin-top:14px;
        font-size:12px;
        color:#9ca3af;
      ">
        Esta entrada es personal y válida para un único ingreso.
      </p>

    </div>
  `).join('');

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'ZAIRO <onboarding@resend.dev>',
    to: [correo],
    subject: `Tus entradas para ${evento}`,

    html: `
      <div style="
        background:#050816;
        padding:40px 20px;
        font-family:Arial,sans-serif;
        color:white;
      ">

        <div style="
          max-width:700px;
          margin:auto;
          background:#0f172a;
          border-radius:28px;
          overflow:hidden;
          border:1px solid #263244;
        ">

          <div style="
            padding:60px 40px;
            background:#0b1120;
            text-align:center;
          ">

            <div style="
              width:90px;
              height:90px;
              margin:auto;
              border-radius:50%;
              background:linear-gradient(135deg,#7c3aed,#10b981);
              font-size:42px;
              font-weight:900;
              line-height:90px;
              color:#ffffff;
            ">
              Z
            </div>

            <h1 style="
              margin:24px 0 10px;
              font-size:42px;
              letter-spacing:4px;
              color:#ffffff;
            ">
              ZAIRO
            </h1>

            <p style="
              color:#9ca3af;
              font-size:16px;
              margin:0;
            ">
              EXPERIENCE • OFFICIAL TICKET
            </p>

          </div>

          <div style="padding:40px;">

            <h2 style="
              margin-top:0;
              font-size:30px;
              color:#ffffff;
            ">
              Compra confirmada 🔥
            </h2>

            <p style="
              color:#cbd5e1;
              line-height:1.7;
            ">
              Tus entradas oficiales han sido confirmadas correctamente.
              Cada persona registrada tiene su propio código QR individual.
            </p>

            <div style="
              margin:30px 0;
              padding:24px;
              border-radius:20px;
              background:#111827;
              border:1px solid #263244;
              color:#ffffff;
            ">

              <h3 style="margin-top:0; color:#ffffff;">
                Información del evento
              </h3>

              <p><strong>Evento:</strong> ${evento}</p>
              <p><strong>Entrada:</strong> ${entrada}</p>
              <p><strong>Fecha confirmación:</strong> ${new Date().toLocaleString('es-CR')}</p>
              <p><strong>Correo:</strong> ${correo}</p>

            </div>

            <div style="margin:30px 0;">
              <h3 style="color:#ffffff;">
                Entradas registradas
              </h3>

              ${tarjetasEntradas}
            </div>

            <div style="
              margin-top:40px;
              padding:22px;
              border-radius:18px;
              background:#052e2b;
              border:1px solid #064e3b;
            ">

              <h3 style="
                margin-top:0;
                color:#34d399;
              ">
                Información importante
              </h3>

              <ul style="
                padding-left:18px;
                line-height:1.8;
                color:#cbd5e1;
              ">
                <li>Presentá el QR correspondiente a cada persona.</li>
                <li>No compartás tus códigos QR.</li>
                <li>Se solicitará identificación en la entrada.</li>
                <li>Cada entrada es válida únicamente una vez.</li>
              </ul>

            </div>

            <div style="
              margin-top:40px;
              text-align:center;
              color:#64748b;
              font-size:13px;
            ">
              ZAIRO EXPERIENCE © 2026
            </div>

          </div>

        </div>

      </div>
    `,

    attachments
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
};