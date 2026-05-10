const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { authMiddleware } = require('../middleware');
const { enviarNotificacion } = require('../notifications');

const sanitize = (str) => (str || '').toString().trim().slice(0, 500);
const HORARIOS = ['08:00','09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00','18:00'];
const ESTADOS_VALIDOS = ['pendiente', 'en_proceso', 'terminado', 'cancelado'];

// #2 — wrapper async
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/disponibilidad/:fecha', authMiddleware, asyncHandler(async (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.fecha)) return res.status(400).json({ error: 'Fecha inválida' });
  const ocupados = await db.prepare(
    "SELECT hora FROM turnos WHERE fecha = ? AND estado != 'cancelado'"
  ).all(req.params.fecha);
  const ocupadasHoras = ocupados.map(t => t.hora);
  res.json({ disponibles: HORARIOS.filter(h => !ocupadasHoras.includes(h)) });
}));

router.post('/', authMiddleware, asyncHandler(async (req, res) => {
  const vehiculo_id = parseInt(req.body.vehiculo_id);
  const fecha = sanitize(req.body.fecha);
  const hora = sanitize(req.body.hora);
  const descripcion = sanitize(req.body.descripcion);

  if (!vehiculo_id || !fecha || !hora || !descripcion)
    return res.status(400).json({ error: 'Campos requeridos' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'Fecha inválida' });
  if (!HORARIOS.includes(hora)) return res.status(400).json({ error: 'Horario inválido' });

  // #5 — verificar que el vehículo pertenece al usuario
  const vehiculo = await db.prepare('SELECT id FROM vehiculos WHERE id = ? AND usuario_id = ?').get(vehiculo_id, req.user.id);
  if (!vehiculo) return res.status(403).json({ error: 'Vehículo no válido' });

  // #6 — límite de turnos pendientes por usuario
  const turnosPendientes = await db.prepare(
    "SELECT COUNT(*) as c FROM turnos WHERE usuario_id = ? AND estado = 'pendiente'"
  ).get(req.user.id);
  if (Number(turnosPendientes.c) >= 3) return res.status(429).json({ error: 'Tenés el máximo de 3 turnos pendientes' });

  const ocupado = await db.prepare(
    "SELECT id FROM turnos WHERE fecha = ? AND hora = ? AND estado != 'cancelado'"
  ).get(fecha, hora);
  if (ocupado) return res.status(409).json({ error: 'Horario no disponible' });

  const result = await db.prepare(
    'INSERT INTO turnos (usuario_id, vehiculo_id, fecha, hora, descripcion) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, vehiculo_id, fecha, hora, descripcion);

  const turno = await db.prepare(`
    SELECT t.*, v.marca, v.modelo, v.patente, u.nombre, u.email, u.telefono, u.push_subscription
    FROM turnos t
    JOIN vehiculos v ON t.vehiculo_id = v.id
    JOIN usuarios u ON t.usuario_id = u.id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  if (turno.push_subscription) {
    await enviarNotificacion(JSON.parse(turno.push_subscription), {
      title: '✅ Turno confirmado',
      body: `Tu turno para el ${fecha} a las ${hora} fue registrado.`,
      url: '/cliente'
    });
  }

  const admin = await db.prepare("SELECT push_subscription FROM usuarios WHERE rol = 'admin'").get();
  if (admin?.push_subscription) {
    await enviarNotificacion(JSON.parse(admin.push_subscription), {
      title: '🔔 Nuevo turno',
      body: `${turno.nombre} reservó para el ${fecha} a las ${hora} - ${turno.patente}`,
      url: '/admin'
    });
  }

  res.json(turno);
}));

router.get('/mis-turnos', authMiddleware, asyncHandler(async (req, res) => {
  const turnos = await db.prepare(`
    SELECT t.*, v.marca, v.modelo, v.patente
    FROM turnos t
    JOIN vehiculos v ON t.vehiculo_id = v.id
    WHERE t.usuario_id = ?
    ORDER BY t.fecha DESC, t.hora DESC
    LIMIT 50
  `).all(req.user.id);
  res.json(turnos);
}));

router.patch('/:id/cancelar', authMiddleware, asyncHandler(async (req, res) => {
  const turno = await db.prepare('SELECT * FROM turnos WHERE id = ? AND usuario_id = ?').get(req.params.id, req.user.id);
  if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
  if (turno.estado !== 'pendiente') return res.status(400).json({ error: 'Solo se pueden cancelar turnos pendientes' });
  await db.prepare("UPDATE turnos SET estado = 'cancelado' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

router.get('/vehiculos', authMiddleware, asyncHandler(async (req, res) => {
  res.json(await db.prepare('SELECT * FROM vehiculos WHERE usuario_id = ?').all(req.user.id));
}));

router.post('/vehiculos', authMiddleware, asyncHandler(async (req, res) => {
  const marca = sanitize(req.body.marca);
  const modelo = sanitize(req.body.modelo);
  const anio = parseInt(req.body.anio) || null;
  const patente = sanitize(req.body.patente).toUpperCase();

  if (!marca || !modelo || !patente) return res.status(400).json({ error: 'Campos requeridos' });
  if (!/^[A-Z0-9]{6,7}$/.test(patente)) return res.status(400).json({ error: 'Patente inválida' });

  // #8 — validación de año en servidor
  if (anio && (anio < 1950 || anio > new Date().getFullYear() + 1))
    return res.status(400).json({ error: 'Año del vehículo inválido' });

  // #5 — límite de vehículos por usuario
  const totalVehiculos = await db.prepare('SELECT COUNT(*) as c FROM vehiculos WHERE usuario_id = ?').get(req.user.id);
  if (Number(totalVehiculos.c) >= 10) return res.status(429).json({ error: 'Máximo 10 vehículos por cuenta' });

  const existe = await db.prepare('SELECT id FROM vehiculos WHERE patente = ?').get(patente);
  if (existe) return res.status(409).json({ error: 'Patente ya registrada' });

  const result = await db.prepare(
    'INSERT INTO vehiculos (usuario_id, marca, modelo, anio, patente) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, marca, modelo, anio, patente);

  res.json(await db.prepare('SELECT * FROM vehiculos WHERE id = ?').get(result.lastInsertRowid));
}));

module.exports = router;
