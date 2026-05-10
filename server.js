require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression'); // #5
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db } = require('./database');

// Validar variables de entorno críticas al arrancar
const requiredEnv = ['JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'GOOGLE_CLIENT_ID', 'ENCRYPTION_KEY'];
requiredEnv.forEach(key => { if (!process.env[key]) { console.error(`❌ Falta variable de entorno: ${key}`); process.exit(1); } });
if (process.env.JWT_SECRET.length < 32) { console.error('❌ JWT_SECRET debe tener al menos 32 caracteres'); process.exit(1); }
if (process.env.ENCRYPTION_KEY.length !== 64) { console.error('❌ ENCRYPTION_KEY debe ser exactamente 64 caracteres hex'); process.exit(1); }

const app = express();

// Seguridad HTTP headers — #15 CSP habilitado
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'accounts.google.com', 'https://accounts.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https://www.gstatic.com'],
      connectSrc: ["'self'"],
      frameSrc: ['accounts.google.com'],
    }
  }
}));

// #5 — compresion HTTP
app.use(compression());

// CORS restringido
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error('CORS no permitido'))),
  methods: ['GET','POST','PATCH','DELETE'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// Forzar HTTPS en producción
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// Rate limiting global
app.set('trust proxy', 1);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false, skip: (req) => req.path === '/api/ping' }));

// Rate limiting estricto para auth
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados intentos, esperá 15 minutos.' } });

app.use(express.json({ limit: '10kb' }));

// #10 — validar Content-Type en requests con body
app.use((req, res, next) => {
  if (['POST','PATCH'].includes(req.method) && req.headers['content-type'] && !req.headers['content-type'].includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type debe ser application/json' });
  }
  next();
});

// #16 — X-Request-ID para correlacionar logs
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.set('X-Request-ID', req.requestId);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// #12 — health check real que verifica la DB
app.get('/api/ping', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, db: 'connected' });
  } catch {
    res.status(503).json({ ok: false, db: 'disconnected' });
  }
});

// Exponer config pública al frontend
app.get('/api/auth/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID });
});

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/turnos', require('./routes/turnos'));
app.use('/api/admin', require('./routes/admin'));

// Manejo de errores global
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  console.error(`[ERROR] requestId=${req.requestId} status=${status} method=${req.method} url=${req.url} msg=${err.message}`);
  // No exponer detalles internos en producción
  const message = status < 500 ? err.message : 'Error interno del servidor';
  res.status(status).json({ error: message });
});

const noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
};

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/login', noCache, (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', noCache, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/cliente', noCache, (req, res) => res.sendFile(path.join(__dirname, 'public', 'cliente.html')));

const PORT = process.env.PORT || 3000;

db.ready.then(async () => {
  const adminExiste = await db.prepare("SELECT id FROM usuarios WHERE rol = 'admin'").get();
  if (!adminExiste) {
    await db.prepare('INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)')
      .run('Administrador', process.env.ADMIN_EMAIL, bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12), 'admin');
    console.log(`✅ Admin creado: ${process.env.ADMIN_EMAIL}`);
  } else {
    // Siempre sincroniza email y password del admin con las variables de entorno
    await db.prepare('UPDATE usuarios SET email = ?, password = ? WHERE rol = ?')
      .run(process.env.ADMIN_EMAIL, bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12), 'admin');
    console.log(`🔄 Admin sincronizado: ${process.env.ADMIN_EMAIL}`);
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
