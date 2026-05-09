const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware');
const { enviarNotificacion } = require('../notifications');

// Horarios disponibles
const HORARIOS = ['08:00','09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00','18:00'];

// Disponibilidad por fecha
router.get('/disponibilidad/:fecha', authMiddleware, (req, res) => {
  const { fecha } = req.params;
  const ocupados = db.prepare(
    "SELECT hora FROM turnos WHERE fecha = ? AND estado != 'cancelado'"
  ).all(fecha).map(t => t.hora);
  const disponibles = HORARIOS.filter(h => !ocupados.includes(h));
  res.json({ disponibles });
});

// Crear turno
router.post('/', authMiddleware, async (req, res) => {
  const { vehiculo_id, fecha, hora, descripcion } = req.body;
  if (!vehiculo_id || !fecha || !hora || !descripcion)
    return res.status(400).json({ error: 'Campos requeridos' });

  const ocupado = db.prepare(
    "SELECT id FROM turnos WHERE fecha = ? AND hora = ? AND estado != 'cancelado'"
  ).get(fecha, hora);
  if (ocupado) return res.status(409).json({ error: 'Horario no disponible' });

  const result = db.prepare(
    'INSERT INTO turnos (usuario_id, vehiculo_id, fecha, hora, descripcion) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, vehiculo_id, fecha, hora, descripcion);

  const turno = db.prepare(`
    SELECT t.*, v.marca, v.modelo, v.patente, u.nombre, u.email, u.telefono, u.push_subscription
    FROM turnos t
    JOIN vehiculos v ON t.vehiculo_id = v.id
    JOIN usuarios u ON t.usuario_id = u.id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  // Notificar al cliente
  if (turno.push_subscription) {
    await enviarNotificacion(JSON.parse(turno.push_subscription), {
      title: '✅ Turno confirmado',
      body: `Tu turno para el ${fecha} a las ${hora} fue registrado.`,
      url: '/cliente.html'
    });
  }

  // Notificar al admin
  const admin = db.prepare("SELECT push_subscription FROM usuarios WHERE rol = 'admin'").get();
  if (admin?.push_subscription) {
    await enviarNotificacion(JSON.parse(admin.push_subscription), {
      title: '🔔 Nuevo turno',
      body: `${turno.nombre} reservó para el ${fecha} a las ${hora} - ${turno.patente}`,
      url: '/admin.html'
    });
  }

  res.json(turno);
});

// Mis turnos
router.get('/mis-turnos', authMiddleware, (req, res) => {
  const turnos = db.prepare(`
    SELECT t.*, v.marca, v.modelo, v.patente
    FROM turnos t
    JOIN vehiculos v ON t.vehiculo_id = v.id
    WHERE t.usuario_id = ?
    ORDER BY t.fecha DESC, t.hora DESC
  `).all(req.user.id);
  res.json(turnos);
});

// Cancelar turno (cliente)
router.patch('/:id/cancelar', authMiddleware, (req, res) => {
  const turno = db.prepare('SELECT * FROM turnos WHERE id = ? AND usuario_id = ?').get(req.params.id, req.user.id);
  if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
  db.prepare("UPDATE turnos SET estado = 'cancelado' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// Vehículos del usuario
router.get('/vehiculos', authMiddleware, (req, res) => {
  const vehiculos = db.prepare('SELECT * FROM vehiculos WHERE usuario_id = ?').all(req.user.id);
  res.json(vehiculos);
});

router.post('/vehiculos', authMiddleware, (req, res) => {
  const { marca, modelo, anio, patente } = req.body;
  if (!marca || !modelo || !patente) return res.status(400).json({ error: 'Campos requeridos' });

  const existe = db.prepare('SELECT id FROM vehiculos WHERE patente = ?').get(patente.toUpperCase());
  if (existe) return res.status(409).json({ error: 'Patente ya registrada' });

  const result = db.prepare(
    'INSERT INTO vehiculos (usuario_id, marca, modelo, anio, patente) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, marca, modelo, anio || null, patente.toUpperCase());

  res.json(db.prepare('SELECT * FROM vehiculos WHERE id = ?').get(result.lastInsertRowid));
});

module.exports = router;
