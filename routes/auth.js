const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { db } = require('../database');
const { authMiddleware } = require('../middleware');
const { encrypt, decrypt } = require('../crypto');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const signToken = (user) =>
  jwt.sign({ id: user.id, rol: user.rol, nombre: user.nombre }, process.env.JWT_SECRET, { expiresIn: '24h' });

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const sanitize = (str) => (str || '').toString().trim().slice(0, 200);

// #3 — eliminado decryptUser que no se usaba

// Wrapper para capturar errores async — #2
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/register', asyncHandler(async (req, res) => {
  const nombre = sanitize(req.body.nombre);
  const email = sanitize(req.body.email).toLowerCase();
  const password = (req.body.password || '').toString();
  const telefono = sanitize(req.body.telefono);

  if (!nombre || !email || !password) return res.status(400).json({ error: 'Campos requeridos' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Email inválido' });
  if (password.length < 6 || password.length > 100) return res.status(400).json({ error: 'Contraseña debe tener entre 6 y 100 caracteres' });
  if (!telefono) return res.status(400).json({ error: 'El teléfono es obligatorio' });

  const existe = await db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (existe) return res.status(409).json({ error: 'El email ya está registrado' });

  const hash = bcrypt.hashSync(password, 12);
  const result = await db.prepare(
    'INSERT INTO usuarios (nombre, email, password, telefono) VALUES (?, ?, ?, ?)'
  ).run(nombre, email, hash, encrypt(telefono));

  const user = await db.prepare('SELECT id, nombre, rol FROM usuarios WHERE id = ?').get(result.lastInsertRowid);
  res.json({ token: signToken(user), user });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const email = sanitize(req.body.email).toLowerCase();
  const password = (req.body.password || '').toString();

  if (!email || !password) return res.status(400).json({ error: 'Campos requeridos' });

  const user = await db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!user || !user.password) {
    console.warn(`[LOGIN FALLIDO] email=${email} ip=${req.ip}`);
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    console.warn(`[LOGIN FALLIDO] email=${email} ip=${req.ip}`);
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  if (user.suspendido) return res.status(403).json({ error: 'Tu cuenta está suspendida. Contactá al taller.' });

  res.json({ token: signToken(user), user: { id: user.id, nombre: user.nombre, rol: user.rol } });
}));

router.post('/google', asyncHandler(async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Token de Google requerido' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Token de Google inválido' });
  }

  const { sub: google_id, email, name: nombre } = payload;
  let user = await db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email.toLowerCase());

  if (!user) {
    const result = await db.prepare(
      'INSERT INTO usuarios (nombre, email, google_id) VALUES (?, ?, ?)'
    ).run(sanitize(nombre), email.toLowerCase(), encrypt(google_id));
    user = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(result.lastInsertRowid);
  } else if (!user.google_id) {
    await db.prepare('UPDATE usuarios SET google_id = ? WHERE id = ?').run(encrypt(google_id), user.id);
  }

  if (user.suspendido) return res.status(403).json({ error: 'Tu cuenta está suspendida. Contactá al taller.' });

  res.json({ token: signToken(user), user: { id: user.id, nombre: user.nombre, rol: user.rol }, sinTelefono: !user.telefono });
}));

router.post('/update-telefono', authMiddleware, asyncHandler(async (req, res) => {
  const telefono = sanitize(req.body.telefono);
  if (!telefono) return res.status(400).json({ error: 'Teléfono requerido' });
  await db.prepare('UPDATE usuarios SET telefono = ? WHERE id = ?').run(encrypt(telefono), req.user.id);
  res.json({ ok: true });
}));

// #11 — limpiar suscripciones push viejas al registrar una nueva
router.post('/push-subscription', authMiddleware, asyncHandler(async (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'Suscripción requerida' });
  await db.prepare('UPDATE usuarios SET push_subscription = ? WHERE id = ?')
    .run(JSON.stringify(subscription), req.user.id);
  res.json({ ok: true });
}));

module.exports = router;
