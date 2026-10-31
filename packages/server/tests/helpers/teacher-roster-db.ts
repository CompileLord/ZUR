import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../../src/db/database.ts';
import { runMigrations } from '../../src/db/migrate.ts';
import { seedDatabase } from '../../src/db/seed.ts';

export function setupTestDb(dbPath = ':memory:'): DatabaseSync {
  runMigrations(dbPath);
  seedDatabase(dbPath);
  return getDatabase(dbPath);
}
