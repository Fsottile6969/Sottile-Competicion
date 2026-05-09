require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db } = require('./database');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/turnos', require('./routes/turnos'));
app.use('/api/admin', require('./routes/admin'));

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
  app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));
});
