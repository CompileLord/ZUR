import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureDeletionRegistry, readDeletionTombstones } from '../src/db/deletion-registry.ts';

test('ensureDeletionRegistry creates a missing registry once and never overwrites', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-reg-'));
  const file = path.join(dir, 'sub', 'tombstones.jsonl');
  const prev = process.env.DELETION_REGISTRY_PATH;
  process.env.DELETION_REGISTRY_PATH = file;
  try {
    assert.equal(ensureDeletionRegistry(), true);
    assert.deepEqual(readDeletionTombstones(), []);
    fs.writeFileSync(file, 'keep\n');
    assert.equal(ensureDeletionRegistry(), false);
    assert.equal(fs.readFileSync(file, 'utf8'), 'keep\n');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  } finally {
    if (prev === undefined) delete process.env.DELETION_REGISTRY_PATH; else process.env.DELETION_REGISTRY_PATH = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
