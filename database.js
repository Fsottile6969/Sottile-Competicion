const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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
`);

// Convierte "WHERE campo = ?" a "WHERE campo = $1" automáticamente
function toPositional(sql) {
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

  async exec(sql) {
    await pool.query(sql);
  }
};

module.exports = { db, pool };
