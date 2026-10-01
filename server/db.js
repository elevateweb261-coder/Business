// Baza de date SQLite (modulul `node:sqlite`, inclus în Node ≥ 22.13) și rularea migrațiilor.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './config.js';

const MIGRATIONS_DIR = join(ROOT, 'server', 'migrations');

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

/** Aplică, în ordine, fișierele `NNN_nume.sql` care nu au fost încă rulate. Fiecare într-o tranzacție. */
export function migrate(db, log = () => {}) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));
  const files = readdirSync(MIGRATIONS_DIR).filter(f => /^\d+_.+\.sql$/.test(f)).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      db.exec('COMMIT');
      log(`Migrație aplicată: ${file}`);
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migrația ${file} a eșuat: ${err.message}`);
    }
  }
}

/** Rulează funcția într-o tranzacție. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
