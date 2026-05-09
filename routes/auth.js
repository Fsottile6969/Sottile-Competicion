const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');

const signToken = (user) =>
  jwt.sign({ id: user.id, rol: user.rol, nombre: user.nombre }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Registro
router.post('/register', (req, res) => {
  const { nombre, email, password, telefono } = req.body;
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Campos requeridos' });

  const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (existe) return res.status(409).json({ error: 'El email ya está registrado' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO usuarios (nombre, email, password, telefono) VALUES (?, ?, ?, ?)'
  ).run(nombre, email, hash, telefono || null);

  const user = db.prepare('SELECT id, nombre, rol FROM usuarios WHERE id = ?').get(result.lastInsertRowid);
  res.json({ token: signToken(user), user });
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!user || !user.password) return res.status(401).json({ error: 'Credenciales inválidas' });

  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Credenciales inválidas' });

  res.json({ token: signToken(user), user: { id: user.id, nombre: user.nombre, rol: user.rol } });
});

// Login con Google (recibe el perfil desde el frontend)
router.post('/google', (req, res) => {
  const { google_id, email, nombre } = req.body;
  if (!google_id || !email) return res.status(400).json({ error: 'Datos de Google inválidos' });

  let user = db.prepare('SELECT * FROM usuarios WHERE google_id = ? OR email = ?').get(google_id, email);

  if (!user) {
    const result = db.prepare(
      'INSERT INTO usuarios (nombre, email, google_id) VALUES (?, ?, ?)'
    ).run(nombre, email, google_id);
    user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(result.lastInsertRowid);
  } else if (!user.google_id) {
    db.prepare('UPDATE usuarios SET google_id = ? WHERE id = ?').run(google_id, user.id);
  }

  res.json({ token: signToken(user), user: { id: user.id, nombre: user.nombre, rol: user.rol } });
});

// Guardar suscripción push
router.post('/push-subscription', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    db.prepare('UPDATE usuarios SET push_subscription = ? WHERE id = ?')
      .run(JSON.stringify(req.body.subscription), decoded.id);
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

module.exports = router;
