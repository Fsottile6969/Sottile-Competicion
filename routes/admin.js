const express = require('express');
const router = express.Router();
const { db, pool } = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware');
const { enviarNotificacion } = require('../notifications');
const { decrypt } = require('../crypto');

// Descifra telefono en un array de objetos
function decryptTelefono(rows) {
  return rows.map(r => ({ ...r, telefono: decrypt(r.telefono) }));
}

router.get('/turnos', authMiddleware, adminMiddleware, async (req, res) => {
  const { fecha, estado } = req.query;
  let query = `
    SELECT t.*, v.marca, v.modelo, v.patente, u.nombre, u.email, u.telefono
    FROM turnos t
    JOIN vehiculos v ON t.vehiculo_id = v.id
    JOIN usuarios u ON t.usuario_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (fecha) { params.push(fecha); query += ` AND t.fecha = $${params.length}`; }
  if (estado) { params.push(estado); query += ` AND t.estado = $${params.length}`; }
  query += ' ORDER BY t.fecha ASC, t.hora ASC';
  const { rows } = await pool.query(query, params);
  res.json(decryptTelefono(rows));
});

router.patch('/turnos/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { estado, notas_admin } = req.body;
  const turno = await db.prepare(`
    SELECT t.*, u.push_subscription, u.nombre, v.patente
    FROM turnos t
    JOIN usuarios u ON t.usuario_id = u.id
    JOIN vehiculos v ON t.vehiculo_id = v.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });

  await db.prepare('UPDATE turnos SET estado = ?, notas_admin = ? WHERE id = ?')
    .run(estado || turno.estado, notas_admin ?? turno.notas_admin, req.params.id);

  if (estado === 'terminado' && turno.push_subscription) {
    await enviarNotificacion(JSON.parse(turno.push_subscription), {
      title: '🎉 ¡Tu vehículo está listo!',
      body: `El ${turno.patente} ya puede ser retirado del taller.`,
      url: '/cliente.html'
    });
  }

  res.json({ ok: true });
});

router.get('/turnos/:id/trabajos', authMiddleware, adminMiddleware, async (req, res) => {
  res.json(await db.prepare('SELECT * FROM trabajos WHERE turno_id = ?').all(req.params.id));
});

router.post('/turnos/:id/trabajos', authMiddleware, adminMiddleware, async (req, res) => {
  const { descripcion, costo } = req.body;
  if (!descripcion) return res.status(400).json({ error: 'Descripción requerida' });
  const result = await db.prepare(
    'INSERT INTO trabajos (turno_id, descripcion, costo) VALUES (?, ?, ?)'
  ).run(req.params.id, descripcion, costo || 0);
  res.json(await db.prepare('SELECT * FROM trabajos WHERE id = ?').get(result.lastInsertRowid));
});

router.patch('/trabajos/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { descripcion, costo, estado } = req.body;
  const trabajo = await db.prepare('SELECT * FROM trabajos WHERE id = ?').get(req.params.id);
  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });
  await db.prepare('UPDATE trabajos SET descripcion = ?, costo = ?, estado = ? WHERE id = ?')
    .run(descripcion ?? trabajo.descripcion, costo ?? trabajo.costo, estado ?? trabajo.estado, req.params.id);
  res.json({ ok: true });
});

router.delete('/trabajos/:id', authMiddleware, adminMiddleware, async (req, res) => {
  await db.prepare('DELETE FROM trabajos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  const hoy = new Date().toISOString().split('T')[0];
  const [turnosHoy, pendientes, enProceso, terminados, clientes] = await Promise.all([
    db.prepare("SELECT COUNT(*) as c FROM turnos WHERE fecha = ? AND estado != 'cancelado'").get(hoy),
    db.prepare("SELECT COUNT(*) as c FROM turnos WHERE estado = 'pendiente'").get(),
    db.prepare("SELECT COUNT(*) as c FROM turnos WHERE estado = 'en_proceso'").get(),
    db.prepare("SELECT COUNT(*) as c FROM turnos WHERE estado = 'terminado'").get(),
    db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE rol = 'cliente'").get(),
  ]);
  res.json({
    turnosHoy: Number(turnosHoy.c),
    pendientes: Number(pendientes.c),
    enProceso: Number(enProceso.c),
    terminados: Number(terminados.c),
    clientes: Number(clientes.c),
  });
});

router.get('/clientes', authMiddleware, adminMiddleware, async (req, res) => {
  res.json(await db.prepare(
    "SELECT id, nombre, email, telefono, suspendido, created_at FROM usuarios WHERE rol = 'cliente' ORDER BY nombre"
  ).all().then(rows => rows.map(r => ({ ...r, telefono: decrypt(r.telefono) }))));
});

router.patch('/clientes/:id/suspender', authMiddleware, adminMiddleware, async (req, res) => {
  const cliente = await db.prepare("SELECT id, rol FROM usuarios WHERE id = ? AND rol = 'cliente'").get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  await db.prepare('UPDATE usuarios SET suspendido = NOT COALESCE(suspendido, false) WHERE id = ?').run(req.params.id);
  const updated = await db.prepare('SELECT suspendido FROM usuarios WHERE id = ?').get(req.params.id);
  console.warn(`[ADMIN] cliente_id=${req.params.id} ${updated.suspendido ? 'SUSPENDIDO' : 'REACTIVADO'} por admin_id=${req.user.id}`);
  res.json({ ok: true, suspendido: updated.suspendido });
});

router.delete('/clientes/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const cliente = await db.prepare("SELECT id, rol FROM usuarios WHERE id = ? AND rol = 'cliente'").get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  await db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
  console.warn(`[ADMIN] cliente_id=${req.params.id} ELIMINADO por admin_id=${req.user.id}`);
  res.json({ ok: true });
});

module.exports = router;
