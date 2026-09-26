import fs from 'node:fs';
import path from 'node:path';

export interface DeletionTombstone {
  userId: string;
  emailHash: string;
  requestedAt: string;
  purgedAt: string;
}

function registryPath(): string {
  const value = process.env.DELETION_REGISTRY_PATH;
  if (!value || !path.isAbsolute(value)) throw new Error('DELETION_REGISTRY_PATH must be an absolute path on storage independent of database backups.');
  return value;
}

export function appendDeletionTombstone(entry: DeletionTombstone): void {
  const filename = registryPath();
  const descriptor = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT, 0o600);
  try {
    fs.writeSync(descriptor, JSON.stringify(entry) + '\n');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function readDeletionTombstones(): DeletionTombstone[] {
  const lines = fs.readFileSync(registryPath(), 'utf8').split('\n').filter(Boolean);
  return lines.map((line) => {
    const entry = JSON.parse(line) as DeletionTombstone;
    if (typeof entry.userId !== 'string' || !entry.userId || entry.userId.length > 128 || !/^[0-9a-f]{64}$/i.test(entry.emailHash) || !Number.isFinite(Date.parse(entry.purgedAt))) {
      throw new Error('Deletion registry contains an invalid tombstone; restore must remain closed.');
    }
    return entry;
  });
}
