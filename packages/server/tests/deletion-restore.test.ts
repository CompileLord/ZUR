import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDatabase, closeDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { appendDeletionTombstone } from '../src/db/deletion-registry.ts';
import { reapplyDeletions } from '../src/db/reapply-deletions.ts';

test('AC-20 reapplies an external deletion record to a backup older than the purge', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-deletion-'));
  const databasePath = path.join(directory, 'active.sqlite');
  const backupPath = path.join(directory, 'old-backup.sqlite');
  const oldRegistryPath = process.env.DELETION_REGISTRY_PATH;
  process.env.DELETION_REGISTRY_PATH = path.join(directory, 'independent-registry.jsonl');
  const userId = crypto.randomUUID();
  try {
    runMigrations(databasePath);
    const db = getDatabase(databasePath);
    db.prepare('INSERT INTO users(id,email,password_hash,display_name,email_verified) VALUES(?,?,?,?,1)')
      .run(userId, 'delete@example.test', 'hash', 'Deleted Student');
    db.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)')
      .run(crypto.randomUUID(), userId, 'token-hash', new Date(Date.now() + 3600000).toISOString());
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    closeDatabase(databasePath);
    fs.copyFileSync(databasePath, backupPath);
    appendDeletionTombstone({ userId, emailHash: crypto.createHash('sha256').update('delete@example.test').digest('hex'), requestedAt: new Date().toISOString(), purgedAt: new Date().toISOString() });
    assert.equal(reapplyDeletions(backupPath), 1);
    const restored = getDatabase(backupPath);
    const user = restored.prepare('SELECT email,display_name,password_hash,account_status FROM users WHERE id=?').get(userId) as any;
    assert.equal(user.account_status, 'purged');
    assert.equal(user.display_name, 'Deleted learner');
    assert.equal(user.password_hash, '');
    assert.notEqual(user.email, 'delete@example.test');
    assert.equal((restored.prepare('SELECT count(*) count FROM sessions WHERE user_id=?').get(userId) as any).count, 0);
    assert.equal(reapplyDeletions(backupPath), 0);
  } finally {
    closeDatabase();
    if (oldRegistryPath === undefined) delete process.env.DELETION_REGISTRY_PATH;
    else process.env.DELETION_REGISTRY_PATH = oldRegistryPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
