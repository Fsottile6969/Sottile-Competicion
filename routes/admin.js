const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware');
const { enviarNotificacion } = require('../notifications');

// Todos los turnos
router.get('/turnos', authMiddleware, adminMiddleware, (req, res) => {
  const { fecha, estado } = req.query;
  let query = `
    SELECT t.*, v.marca, v.modelo, v.patente, u.nombre, u.email, u.telefono
    FROM turnos t
    JOIN vehiculos v ON t.vehiculo_id = v.id
    JOIN usuarios u ON t.usuario_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (fecha) { query += ' AND t.fecha = ?'; params.push(fecha); }
  if (estado) { query += ' AND t.estado = ?'; params.push(estado); }
  query += ' ORDER BY t.fecha ASC, t.hora ASC';
  res.json(db.prepare(query).all(...params));
});

// Actualizar estado del turno
router.patch('/turnos/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { estado, notas_admin } = req.body;
  const turno = db.prepare(`
    SELECT t.*, u.push_subscription, u.nombre, v.patente
    FROM turnos t
    JOIN usuarios u ON t.usuario_id = u.id
    JOIN vehiculos v ON t.vehiculo_id = v.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });

  db.prepare('UPDATE turnos SET estado = ?, notas_admin = ? WHERE id = ?')
    .run(estado || turno.estado, notas_admin ?? turno.notas_admin, req.params.id);

  // Notificar al cliente si el vehículo está terminado
  if (estado === 'terminado' && turno.push_subscription) {
    await enviarNotificacion(JSON.parse(turno.push_subscription), {
      title: '🎉 ¡Tu vehículo está listo!',
      body: `El ${turno.patente} ya puede ser retirado del taller.`,
      url: '/cliente.html'
    });
  }

  res.json({ ok: true });
});

// Trabajos de un turno
router.get('/turnos/:id/trabajos', authMiddleware, adminMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM trabajos WHERE turno_id = ?').all(req.params.id));
});

router.post('/turnos/:id/trabajos', authMiddleware, adminMiddleware, (req, res) => {
  const { descripcion, costo } = req.body;
  if (!descripcion) return res.status(400).json({ error: 'Descripción requerida' });
  const result = db.prepare(
    'INSERT INTO trabajos (turno_id, descripcion, costo) VALUES (?, ?, ?)'
  ).run(req.params.id, descripcion, costo || 0);
  res.json(db.prepare('SELECT * FROM trabajos WHERE id = ?').get(result.lastInsertRowid));
});

router.patch('/trabajos/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { descripcion, costo, estado } = req.body;
  const trabajo = db.prepare('SELECT * FROM trabajos WHERE id = ?').get(req.params.id);
  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });
  db.prepare('UPDATE trabajos SET descripcion = ?, costo = ?, estado = ? WHERE id = ?')
    .run(descripcion ?? trabajo.descripcion, costo ?? trabajo.costo, estado ?? trabajo.estado, req.params.id);
  res.json({ ok: true });
});

router.delete('/trabajos/:id', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM trabajos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Estadísticas del dashboard
router.get('/stats', authMiddleware, adminMiddleware, (req, res) => {
  const hoy = new Date().toISOString().split('T')[0];
  res.json({
    turnosHoy: db.prepare("SELECT COUNT(*) as c FROM turnos WHERE fecha = ? AND estado != 'cancelado'").get(hoy).c,
    pendientes: db.prepare("SELECT COUNT(*) as c FROM turnos WHERE estado = 'pendiente'").get().c,
    enProceso: db.prepare("SELECT COUNT(*) as c FROM turnos WHERE estado = 'en_proceso'").get().c,
    terminados: db.prepare("SELECT COUNT(*) as c FROM turnos WHERE estado = 'terminado'").get().c,
    clientes: db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE rol = 'cliente'").get().c,
  });
});

// Todos los clientes
router.get('/clientes', authMiddleware, adminMiddleware, (req, res) => {
  res.json(db.prepare("SELECT id, nombre, email, telefono, created_at FROM usuarios WHERE rol = 'cliente' ORDER BY nombre").all());
});

module.exports = router;
