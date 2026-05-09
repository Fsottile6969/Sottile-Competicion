const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'taller.db');

let _db = null;

function save() {
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function init() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    _db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    _db = new SQL.Database();
  }

  _db.run(`PRAGMA foreign_keys = ON;`);

  _db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      telefono TEXT,
      google_id TEXT UNIQUE,
      rol TEXT DEFAULT 'cliente',
      push_subscription TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS vehiculos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      marca TEXT NOT NULL,
      modelo TEXT NOT NULL,
      anio INTEGER,
      patente TEXT UNIQUE NOT NULL,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
    CREATE TABLE IF NOT EXISTS turnos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      vehiculo_id INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      hora TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      estado TEXT DEFAULT 'pendiente',
      notas_admin TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id)
    );
    CREATE TABLE IF NOT EXISTS trabajos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turno_id INTEGER NOT NULL,
      descripcion TEXT NOT NULL,
      costo REAL DEFAULT 0,
      estado TEXT DEFAULT 'en_proceso',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (turno_id) REFERENCES turnos(id)
    );
  `);

  save();
  return _db;
}

// Wrapper sincrónico compatible con la API anterior
const db = {
  _ready: false,
  _instance: null,

  prepare(sql) {
    const instance = this._instance;
    return {
      run(...params) {
        instance.run(sql, params);
        save();
        // Devolver lastInsertRowid
        const res = instance.exec('SELECT last_insert_rowid() as id');
        return { lastInsertRowid: res[0]?.values[0][0] };
      },
      get(...params) {
        const stmt = instance.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          stmt.free();
          return row;
        }
        stmt.free();
        return undefined;
      },
      all(...params) {
        const stmt = instance.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
      }
    };
  },

  exec(sql) {
    this._instance.run(sql);
    save();
  }
};

// Inicializar y exportar promesa
const ready = init().then(instance => {
  db._instance = instance;
  db._ready = true;
});

db.ready = ready;
module.exports = db;
