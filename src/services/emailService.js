const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const enviarEntradaPorCorreo = async ({ para, nombreEvento, fechaEvento, codigoQR, qrBase64 }) => {
  await transporter.sendMail({
    from: `"ZAIRO" <${process.env.EMAIL_USER}>`,
    to: para,
    subject: `Tu entrada para ${nombreEvento}`,
    html: `
      <div style="font-family: Arial, sans-serif; background:#0f172a; color:white; padding:30px;">
        <div style="max-width:600px; margin:auto; background:#111827; padding:25px; border-radius:16px;">
          <h1 style="color:#a855f7;">ZAIRO</h1>
          <h2>Entrada confirmada</h2>

          <p>Tu compra para el evento <strong>${nombreEvento}</strong> fue confirmada.</p>
          <p><strong>Fecha:</strong> ${fechaEvento}</p>

          <div style="text-align:center; margin:30px 0;">
            <img src="cid:qrentrada" style="width:240px; height:240px;" />
          </div>

          <p style="font-size:14px; color:#cbd5e1;">
            Código de entrada: ${codigoQR}
          </p>

          <p style="font-size:13px; color:#94a3b8;">
            Presentá este QR el día del evento. Este código es único y solo puede usarse una vez.
          </p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: 'entrada-zairo.png',
        content: qrBase64.split('base64,')[1],
        encoding: 'base64',
        cid: 'qrentrada'
      }
    ]
  });
};

module.exports = {
  enviarEntradaPorCorreo
};