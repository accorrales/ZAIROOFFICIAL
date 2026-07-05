const express = require('express');
const cors = require('cors');
const compression = require('compression');
require('dotenv').config();

const pool = require('./config/database');

const departamentosRoutes = require('./routes/departamentosRoutes');
const empleadosRoutes = require('./routes/empleadosRoutes');
const conceptosRoutes = require('./routes/conceptosRoutes');
const planillasRoutes = require('./routes/planillasRoutes');
const novedadesRoutes = require('./routes/novedadesRoutes');
const auditoriaRoutes = require('./routes/auditoriaRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const authRoutes = require('./routes/authRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const eventosRoutes = require('./routes/eventosRoutes');
const entradasRoutes = require('./routes/entradasRoutes');
const entradaTiersRoutes = require('./routes/entradaTiersRoutes');
const comprasEntradasRoutes = require('./routes/comprasEntradasRoutes');
const codigosDescuentoRoutes = require('./routes/codigosDescuentoRoutes');
const entradasConfirmadasRoutes = require('./routes/entradasConfirmadasRoutes');
const whatsappRoutes = require('./modules/whatsapp/whatsapp.routes');

const { iniciarLocationNotificationCron } = require('./jobs/locationNotificationCron');
const { ensureSchema } = require('./config/ensureSchema');
const whatsappConfig = require('./modules/whatsapp/whatsapp.config');

const app = express();
const PORT = process.env.PORT || 3000;

// Comprime las respuestas JSON (gzip/br) antes de enviarlas: mismo contenido,
// muchos menos bytes por la red, sobre todo en datos móviles.
app.use(compression());

app.use(cors({
  origin: [
    'http://localhost:4200',
    'https://zairo-frontend-theta.vercel.app',
    'https://zairoclub.com',
    'https://www.zairoclub.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Guarda el cuerpo crudo del request para poder validar la firma
// X-Hub-Signature-256 del webhook de WhatsApp (Meta firma el body sin parsear).
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use('/api/auth', authRoutes);
app.use('/api/departamentos', departamentosRoutes);
app.use('/api/empleados', empleadosRoutes);
app.use('/api/conceptos', conceptosRoutes);
app.use('/api/planillas', planillasRoutes);
app.use('/api/novedades', novedadesRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/eventos', eventosRoutes);
app.use('/api/entradas', entradasRoutes);
app.use('/api/entrada-tiers', entradaTiersRoutes);
app.use('/api/compras-entradas', comprasEntradasRoutes);
app.use('/api/codigos-descuento', codigosDescuentoRoutes);
app.use('/api/dashboard-entradas', entradasConfirmadasRoutes);
app.use('/api/whatsapp', whatsappRoutes);

app.get('/api/prueba-dashboard', (req, res) => {
  res.json({ mensaje: 'Ruta directa funcionando' });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Servidor funcionando'
  });
});

app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');

    res.json({
      mensaje: 'Backend funcionando correctamente',
      hora_servidor: result.rows[0]
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error conectando con la base de datos'
    });
  }
});

app.listen(PORT, async () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  await ensureSchema();
  iniciarLocationNotificationCron();
  // Informa si el módulo WhatsApp está activo o desactivado por variables
  // faltantes. Nunca tumba el arranque; solo registra el estado.
  whatsappConfig.registrarEstado();
});