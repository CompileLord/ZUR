import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const instances = new Map<string, DatabaseSync>();

export function getDatabase(dbPath?: string): DatabaseSync {
  const targetPath = dbPath || process.env.DATABASE_URL || 'data/zur.sqlite';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(targetPath) || process.env.NODE_ENV === 'production') {
    throw new Error('This build supports SQLite file paths only. Configure a database adapter before staging or production deployment.');
  }

  const existing = instances.get(targetPath);
  if (existing) {
    return existing;
  }

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(targetPath);

  // Enforce authoritative invariants: foreign keys and WAL mode
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  if (targetPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  instances.set(targetPath, db);
  return db;
}

export function closeDatabase(dbPath?: string): void {
  if (dbPath) {
    const db = instances.get(dbPath);
    if (db) {
      db.close();
      instances.delete(dbPath);
    }
  } else {
    for (const [key, db] of instances.entries()) {
      db.close();
    }
    instances.clear();
  }
}
