import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatabaseSync } from 'node:sqlite';

type Env = Record<string, string | undefined>;

export const requestContext = new AsyncLocalStorage<{ userId?: string }>();

/** LOG_FORMAT=json|off. Default: json in production, off otherwise (keeps test output clean). */
export function accessLogEnabled(env: Env = process.env): boolean {
  const v = (env.LOG_FORMAT ?? '').trim().toLowerCase();
  if (v === 'json') return true;
  if (v === 'off') return false;
  return env.NODE_ENV === 'production';
}

/** Path only (never the query string); long opaque segments (likely tokens) are masked. */
export function loggablePath(pathname: string): string {
  return pathname.split('/').map((seg) => (seg.length >= 40 && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) ? ':redacted' : seg)).join('/').slice(0, 300);
}

export function writeAccessLog(entry: { requestId: string; method: string; path: string; status: number; ms: number; userId?: string; ip: string }, sink: (line: string) => void = (l) => process.stdout.write(l + '\n')): void {
  sink(JSON.stringify({
    ts: new Date().toISOString(), level: 'info', event: 'http.access', requestId: entry.requestId,
    method: entry.method, path: loggablePath(entry.path), status: entry.status,
    ms: Math.round(entry.ms * 10) / 10, ...(entry.userId ? { userId: entry.userId } : {}), ip: entry.ip,
  }));
}

/** Request ids from clients are only echoed when they look harmless. */
export function resolveRequestId(header: string | string[] | undefined, generate: () => string): string {
  const v = Array.isArray(header) ? header[0] : header;
  return typeof v === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(v) ? v : generate();
}

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

export interface Readiness { ok: boolean; body: Record<string, unknown> }

export function checkReadiness(db: DatabaseSync, now: number = Date.now()): Readiness {
  try {
    db.prepare('SELECT 1').get();
  } catch {
    return { ok: false, body: { status: 'unavailable', reason: 'database_unavailable' } };
  }
  try {
    const expected = fs.existsSync(migrationsDir) ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')) : [];
    const applied = new Set((db.prepare('SELECT filename FROM _migrations').all() as Array<{ filename: string }>).map((r) => r.filename));
    const pending = expected.filter((f) => !applied.has(f));
    if (pending.length > 0) {
      return { ok: false, body: { status: 'unavailable', reason: 'migrations_pending', pendingMigrations: pending.length } };
    }
  } catch {
    return { ok: false, body: { status: 'unavailable', reason: 'migrations_unavailable' } };
  }
  // There is no worker heartbeat table; queue depth and oldest queued age are informational only.
  let queue: Record<string, unknown> = { available: false };
  try {
    const row = db.prepare(`SELECT COUNT(*) AS depth, MIN(created_at) AS oldest FROM execution_jobs WHERE status = 'queued'`).get() as { depth: number; oldest: string | null };
    const running = db.prepare(`SELECT COUNT(*) AS n FROM execution_jobs WHERE status = 'running'`).get() as { n: number };
    const oldestMs = row.oldest ? Date.parse(row.oldest) : NaN;
    queue = {
      available: true,
      queued: Number(row.depth),
      running: Number(running.n),
      oldestQueuedAgeSeconds: Number.isFinite(oldestMs) ? Math.max(0, Math.round((now - oldestMs) / 1000)) : null,
    };
  } catch { /* informational only */ }
  return { ok: true, body: { status: 'ready', database: 'ok', migrations: 'applied', queue } };
}
