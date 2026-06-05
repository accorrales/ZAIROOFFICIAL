const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

exports.enviarEntradas = async ({
  correo,
  evento,
  entrada,
  personas
}) => {

  const attachments = personas.map((p, index) => ({
    filename: `Entrada-${index + 1}-${p.nombre_completo}.png`,
    content: Buffer.from(p.qr_base64.split(',')[1], 'base64'),
    cid: `qr${index + 1}`
  }));

  const tarjetasEntradas = personas.map((p, index) => `
    <div style="
      margin-bottom:22px;
      padding:22px;
      border-radius:22px;
      background:rgba(255,255,255,.05);
      border:1px solid rgba(255,255,255,.08);
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
        color:rgba(255,255,255,.55);
        margin-bottom:18px;
      ">
        Código QR individual de acceso
      </div>

      <img
        src="cid:qr${index + 1}"
        alt="QR ${index + 1}"
        style="
          width:190px;
          height:190px;
          background:white;
          padding:12px;
          border-radius:18px;
          margin:auto;
          display:block;
        "
      />

      <p style="
        margin-top:14px;
        font-size:12px;
        color:rgba(255,255,255,.45);
      ">
        Esta entrada es personal y válida para un único ingreso.
      </p>

    </div>
  `).join('');

  await transporter.sendMail({
    from: `"ZAIRO" <${process.env.EMAIL_USER}>`,
    to: correo,
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
          background:linear-gradient(145deg,#0f172a,#111827);
          border-radius:28px;
          overflow:hidden;
          border:1px solid rgba(255,255,255,0.08);
        ">

          <div style="
            padding:60px 40px;
            background:
              radial-gradient(circle at top left, rgba(124,58,237,.45), transparent 30%),
              radial-gradient(circle at bottom right, rgba(16,185,129,.35), transparent 30%),
              #0b1120;
            text-align:center;
          ">

            <div style="
              width:90px;
              height:90px;
              margin:auto;
              border-radius:50%;
              background:linear-gradient(135deg,#7c3aed,#10b981);
              display:flex;
              align-items:center;
              justify-content:center;
              font-size:42px;
              font-weight:900;
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
              color:rgba(255,255,255,.7);
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
              color:rgba(255,255,255,.72);
              line-height:1.7;
            ">
              Tus entradas oficiales han sido confirmadas correctamente.
              Cada persona registrada tiene su propio código QR individual de acceso.
            </p>

            <div style="
              margin:30px 0;
              padding:24px;
              border-radius:20px;
              background:rgba(255,255,255,.05);
              border:1px solid rgba(255,255,255,.08);
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
              background:rgba(16,185,129,.08);
              border:1px solid rgba(16,185,129,.2);
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
                color:rgba(255,255,255,.72);
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
              color:rgba(255,255,255,.4);
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

};