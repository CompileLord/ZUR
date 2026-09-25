import crypto from 'node:crypto';
import { getDatabase } from './database.ts';
import { runMigrations } from './migrate.ts';
import { hashPassword } from '../services/password-service.ts';

const dbPath = process.env.DATABASE_URL || 'data/zur.sqlite';
runMigrations(dbPath);
const db = getDatabase(dbPath);

const accounts = [
  { email: 'student@zur.local', password: 'StudentPass123!', name: 'Demo Student', capabilities: ['student'] },
  { email: 'author@zur.local', password: 'AuthorPass123!', name: 'Demo Author', capabilities: ['student', 'author'] },
];

const insert = db.prepare(`
  INSERT INTO users (id, email, password_hash, display_name, email_verified, capabilities, account_status)
  VALUES (?, ?, ?, ?, 1, ?, 'active')
  ON CONFLICT(email) DO NOTHING
`);

for (const account of accounts) {
  const result = insert.run(
    `user-demo-${crypto.randomUUID()}`,
    account.email,
    hashPassword(account.password),
    account.name,
    JSON.stringify(account.capabilities),
  );
  console.log(`${account.email}: ${result.changes ? 'created' : 'already exists'}`);
}
