import { getDatabase } from '../../src/db/database.ts';
import { runMigrations } from '../../src/db/migrate.ts';
import { seedDatabase } from '../../src/db/seed.ts';
import crypto from 'node:crypto';
import { closeDatabase } from '../../src/db/database.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function setup(){const path=`file:admin-${crypto.randomUUID()}?mode=memory&cache=shared`;runMigrations(path);seedDatabase(path);return {db:getDatabase(path),cleanup:()=>closeDatabase(path)};}
export function useDeletionRegistry(t: any) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-admin-registry-'));
  const previous = process.env.DELETION_REGISTRY_PATH;
  process.env.DELETION_REGISTRY_PATH = path.join(directory, 'tombstones.jsonl');
  t.after(() => { if (previous === undefined) delete process.env.DELETION_REGISTRY_PATH; else process.env.DELETION_REGISTRY_PATH = previous; fs.rmSync(directory, { recursive: true, force: true }); });
}
