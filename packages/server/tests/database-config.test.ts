import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';

test('database configuration rejects a PostgreSQL URL instead of creating a SQLite file for it', () => {
  assert.throws(() => getDatabase('postgresql://example.invalid/zur'), /SQLite file paths only/);
});
