// Database connection (SQLite, built into Node.js 22.13+).
// The schema and sample data are loaded from database/database.sql when the
// database file does not exist yet.
//
// On Vercel the project folder is read-only, so the database and uploaded
// images live in /tmp. Each new server instance starts from database.sql.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ON_VERCEL = !!process.env.VERCEL;
const DATA_DIR = ON_VERCEL ? '/tmp' : path.join(__dirname, 'database');
const DB_FILE = path.join(DATA_DIR, 'shop.db');
const SQL_FILE = path.join(__dirname, 'database', 'database.sql');
const UPLOAD_DIR = ON_VERCEL ? '/tmp/uploads' : path.join(__dirname, 'public', 'uploads');

function loadSchema(db) {
  db.exec(fs.readFileSync(SQL_FILE, 'utf8'));
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const isNew = !fs.existsSync(DB_FILE);
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON;');
if (isNew) {
  loadSchema(db);
  console.log('Database created from database/database.sql');
}

// Small helpers so route code stays short and readable.
module.exports = {
  db,
  all: (sql, ...params) => db.prepare(sql).all(...params),
  get: (sql, ...params) => db.prepare(sql).get(...params),
  run: (sql, ...params) => db.prepare(sql).run(...params),
  transaction(fn) {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  },
  loadSchema,
  DB_FILE,
  UPLOAD_DIR,
};
