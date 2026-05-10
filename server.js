require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db } = require('./database');

const app = express();

// Seguridad HTTP headers
app.use(helmet({ contentSecurityPolicy: false }));

// CORS restringido
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error('CORS no permitido'))),
  methods: ['GET','POST','PATCH','DELETE'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// Rate limiting global
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));

// Rate limiting estricto para auth
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Demasiados intentos, esperá 15 minutos.' } });

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/ping', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/turnos', require('./routes/turnos'));
app.use('/api/admin', require('./routes/admin'));

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: 'Error interno del servidor' });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/cliente', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cliente.html')));

const PORT = process.env.PORT || 3000;

db.ready.then(async () => {
  const adminExiste = await db.prepare("SELECT id FROM usuarios WHERE rol = 'admin'").get();
  if (!adminExiste) {
    await db.prepare('INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)')
      .run('Administrador', process.env.ADMIN_EMAIL, bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10), 'admin');
    console.log(`✅ Admin creado: ${process.env.ADMIN_EMAIL}`);
  }
  app.listen(PORT, () => {
    console.log(`🚀 Servidor en http://localhost:${PORT}`);
    if (process.env.RENDER_EXTERNAL_URL) {
      setInterval(() => {
        fetch(process.env.RENDER_EXTERNAL_URL + '/api/ping').catch(() => {});
      }, 10 * 60 * 1000);
      console.log('🔄 Keep-alive activado');
    }
  });
}).catch(err => {
  console.error('❌ Error conectando a la base de datos:', err.message);
  console.error('Verificá que DATABASE_URL esté configurada correctamente en las variables de entorno.');
  process.exit(1);
});
