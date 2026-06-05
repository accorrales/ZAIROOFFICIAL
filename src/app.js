const express = require('express');
const cors = require('cors');
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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: [
    'http://localhost:4200',
    'https://zairo-frontend-theta.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});