import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';

const dataDir = path.resolve('data');
const dbFile = path.join(dataDir, 'placement.sqlite');
fs.mkdirSync(dataDir, { recursive: true });

let db;

export async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs({ locateFile: file => path.join(process.cwd(), 'node_modules/sql.js/dist', file) });
  if (fs.existsSync(dbFile)) {
    db = new SQL.Database(fs.readFileSync(dbFile));
  } else {
    db = new SQL.Database();
  }
  db.run(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student','placement')),
      branch TEXT DEFAULT '',
      cgpa REAL DEFAULT 0,
      backlogs INTEGER DEFAULT 0,
      skills TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS drives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT DEFAULT '',
      package_lpa REAL NOT NULL,
      min_cgpa REAL DEFAULT 0,
      allowed_branches TEXT DEFAULT '',
      max_backlogs INTEGER DEFAULT 0,
      deadline TEXT NOT NULL,
      location TEXT DEFAULT 'On Campus',
      work_mode TEXT DEFAULT 'On-site',
      skills TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drive_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Applied' CHECK(status IN ('Applied','Shortlisted','Selected','Rejected')),
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(drive_id, student_id),
      FOREIGN KEY(drive_id) REFERENCES drives(id) ON DELETE CASCADE,
      FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  persist();
  return db;
}

export function persist() {
  if (!db) return;
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
}

export function rows(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

export function row(sql, params = []) {
  return rows(sql, params)[0] || null;
}

export function run(sql, params = []) {
  db.run(sql, params);
  const id = row('SELECT last_insert_rowid() AS id')?.id;
  persist();
  return id;
}
