const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // CWE-295 — Render usa certificados autofirmados internos, rejectUnauthorized:false es requerido
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10
});

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en cliente idle:', err.message);
});

const ready = pool.query(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    telefono TEXT,
    google_id TEXT UNIQUE,
    rol TEXT DEFAULT 'cliente',
    push_subscription TEXT,
    suspendido BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS vehiculos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    marca TEXT NOT NULL,
    modelo TEXT NOT NULL,
    anio INTEGER,
    patente TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS turnos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    estado TEXT DEFAULT 'pendiente',
    notas_admin TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS trabajos (
    id SERIAL PRIMARY KEY,
    turno_id INTEGER NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
    descripcion TEXT NOT NULL,
    costo NUMERIC DEFAULT 0,
    estado TEXT DEFAULT 'en_proceso',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(fecha);
  CREATE INDEX IF NOT EXISTS idx_turnos_usuario ON turnos(usuario_id);
  CREATE INDEX IF NOT EXISTS idx_vehiculos_usuario ON vehiculos(usuario_id);
  CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
  ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS suspendido BOOLEAN DEFAULT false;
`).catch(err => {
  console.error('[DB] Error al inicializar tablas:', err.message);
  process.exit(1);
});

// CWE-89 — convierte ? a $1,$2... para queries parametrizadas de pg
// Los valores NUNCA se interpolan en el SQL, siempre van como params separados
function toPositional(sql) {
  if (sql.includes('${')) throw new Error('SQL no debe contener interpolaciones de template');
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const db = {
  ready,

  prepare(sql) {
    const pgSql = toPositional(sql);
    return {
      async run(...params) {
        const res = await pool.query(pgSql + ' RETURNING id', params);
        return { lastInsertRowid: res.rows[0]?.id };
      },
      async get(...params) {
        const res = await pool.query(pgSql, params);
        return res.rows[0];
      },
      async all(...params) {
        const res = await pool.query(pgSql, params);
        return res.rows;
      }
    };
  },

  query(...args) {
    return pool.query(...args);
  },

  async exec(sql) {
    await pool.query(sql);
  }
};

module.exports = { db, pool };
