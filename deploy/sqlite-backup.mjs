#!/usr/bin/env node
// Consistent online SQLite backup without the sqlite3 CLI.
// Usage: node --experimental-strip-types deploy/sqlite-backup.mjs <src.sqlite> <dest.sqlite>
//        node deploy/sqlite-backup.mjs --check <file.sqlite>   (integrity_check + foreign_key_check)
import { DatabaseSync } from 'node:sqlite';
import { existsSync, rmSync } from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === '--check') {
  const db = new DatabaseSync(args[1], { readOnly: true });
  const ic = db.prepare('PRAGMA integrity_check').all();
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  db.close();
  if (ic.length !== 1 || ic[0].integrity_check !== 'ok' || fk.length) {
    console.error('integrity check FAILED', JSON.stringify({ ic, fk: fk.slice(0, 5) }));
    process.exit(1);
  }
  console.log('integrity ok');
} else {
  const [src, dest] = args;
  if (!src || !dest) { console.error('usage: sqlite-backup.mjs <src> <dest>'); process.exit(2); }
  if (existsSync(dest)) rmSync(dest);
  const db = new DatabaseSync(src);
  db.exec('PRAGMA busy_timeout = 10000');
  // VACUUM INTO produces a consistent, WAL-free snapshot while the server keeps running.
  db.prepare('VACUUM INTO ?').run(dest);
  db.close();
  console.log(`backup written: ${dest}`);
}
