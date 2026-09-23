import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './database.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runMigrations(dbPath?: string): string[] {
  const db = getDatabase(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedRows = db.prepare('SELECT filename FROM _migrations').all() as Array<{ filename: string }>;
  const appliedSet = new Set(appliedRows.map((r) => r.filename));

  const newlyApplied: string[] = [];

  for (const file of files) {
    if (!appliedSet.has(file)) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      
      // Execute migration script
      db.exec('BEGIN TRANSACTION;');
      try {
        db.exec(sql);
        db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
        db.exec('COMMIT;');
        newlyApplied.push(file);
      } catch (err) {
        db.exec('ROLLBACK;');
        throw new Error(`Failed to apply migration ${file}: ${(err as Error).message}`);
      }
    }
  }

  return newlyApplied;
}

if (process.argv[1] === __filename) {
  try {
    const applied = runMigrations();
    console.log(`Migrations complete. Applied: ${applied.length ? applied.join(', ') : 'none (up to date)'}`);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}
