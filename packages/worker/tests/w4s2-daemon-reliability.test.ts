import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { runPythonIsolated, activeRunCount, killAllActiveRuns } from '../src/runner.ts';
import { runWorkerDaemon } from '../src/daemon-loop.ts';
import { getDatabase } from '../../server/src/db/database.ts';
import { runMigrations } from '../../server/src/db/migrate.ts';
import { seedDatabase } from '../../server/src/db/seed.ts';
import { ExecutionService } from '../../server/src/services/execution-service.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BIG_STDIN = 'x'.repeat(64 * 1024);

// The spawned daemon gets its own TMPDIR, so only its sandboxes are counted.
function sandboxDirs(root: string): string[] {
  return fs.readdirSync(root).filter((n) => n.startsWith('zur-sandbox-'));
}

test('stdin EPIPE does not crash the process (item 5)', async () => {
  let uncaught: unknown = null;
  const onUncaught = (e: unknown) => { uncaught = e; };
  process.on('uncaughtException', onUncaught);
  try {
    for (let i = 0; i < 4; i++) {
      const r1 = await runPythonIsolated('import sys\nsys.exit(0)\n', BIG_STDIN);
      assert.equal(r1.verdict, 'PASSED');
      const r2 = await runPythonIsolated('import os\nos.close(0)\n', BIG_STDIN);
      assert.ok(['PASSED', 'RUNTIME_ERROR'].includes(r2.verdict), r2.verdict);
    }
    await sleep(200);
    assert.equal(uncaught, null);
    assert.equal(activeRunCount(), 0);
  } finally { process.off('uncaughtException', onUncaught); }
});

test('daemon loop survives SQLITE_BUSY in heartbeat/claim and logs instead of swallowing (item 5)', async () => {
  const logged: string[] = [];
  const orig = console.error; console.error = (...a: unknown[]) => { logged.push(a.join(' ')); };
  let stop = false; let claims = 0; let completed = 0;
  const job = { jobId: 'j1', userId: 'u', stepId: 's', jobType: 'run_custom', code: '', testCases: [] } as any;
  const service: any = {
    claimNextJob: () => { claims++; if (claims === 1) throw new Error('SQLITE_BUSY: database is locked'); if (claims === 2) return job; if (claims > 3) stop = true; return null; },
    renewLease: () => { throw new Error('SQLITE_BUSY: heartbeat'); },
    completeJob: () => { completed++; },
    failJob: () => {},
    purgeExpiredRunJobs: () => 0,
    recoverStuckJobsSafe: () => 0,
    releaseJob: () => true,
  };
  try {
    await runWorkerDaemon({ service, workerId: 'w', shouldStop: () => stop, idleMs: 10, heartbeatMs: 10,
      process: async () => { await sleep(60); return { jobId: 'j1', verdict: 'PASSED' } as any; } });
  } finally { console.error = orig; }
  assert.equal(completed, 1);
  assert.ok(logged.some((l) => l.includes('claim failed') && l.includes('SQLITE_BUSY')));
  assert.ok(logged.some((l) => l.includes('lease heartbeat failed')));
});

test('daemon loop runs stuck-job recovery on a timer (item 5)', async () => {
  let recoveries = 0; let stop = false;
  const service: any = { claimNextJob: () => null, renewLease: () => true, completeJob: () => {}, failJob: () => {},
    purgeExpiredRunJobs: () => 0, recoverStuckJobsSafe: () => { recoveries++; return 0; }, releaseJob: () => true };
  setTimeout(() => { stop = true; }, 150);
  await runWorkerDaemon({ service, workerId: 'w', shouldStop: () => stop, idleMs: 10, recoveryMs: 30 });
  assert.ok(recoveries >= 2, `recoveries=${recoveries}`);
});

test('SIGTERM to the real daemon kills the container, removes temp dirs and re-queues the job (item 5)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-w4s2-daemon-'));
  const dbPath = path.join(dir, 'test.sqlite');
  runMigrations(dbPath);
  seedDatabase(dbPath);
  const db = getDatabase(dbPath);
  const service = new ExecutionService(db);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-w4s2-tmp-'));
  const { job } = service.enqueueJob({ userId: 'user-student-1', enrollmentId: 'enr-ada', stepId: 'step-6-python-evenodd',
    jobType: 'run_custom', code: '# w4s2-marker\nwhile True:\n    pass\n', stdin: '' });
  const child = spawn(process.execPath, ['--experimental-strip-types', path.resolve(import.meta.dirname, '../src/daemon.ts')], {
    env: { ...process.env, TMPDIR: tmp, DATABASE_URL: dbPath, ZUR_WORKER_SHUTDOWN_GRACE_MS: '300' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = ''; child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const row = db.prepare('SELECT status FROM execution_jobs WHERE id=?').get(job.id) as any;
      if (row.status === 'running' && sandboxDirs(tmp).length > 0) break;
      await sleep(100);
    }
    assert.equal((db.prepare('SELECT status s FROM execution_jobs WHERE id=?').get(job.id) as any).s, 'running');
    child.kill('SIGTERM');
    const code = await new Promise<number | null>((resolve) => { child.once('exit', (c) => resolve(c)); setTimeout(() => resolve(-999), 15_000); });
    assert.equal(code, 0, out);
    const row = db.prepare('SELECT status,worker_id,lease_expires_at FROM execution_jobs WHERE id=?').get(job.id) as any;
    assert.equal(row.status, 'queued', 'job released back to the queue');
    assert.equal(row.worker_id, null);
    assert.equal(row.lease_expires_at, null);
    assert.deepEqual(sandboxDirs(tmp), [], 'no leaked sandbox dirs');
    const ps = spawnSync('podman', ['ps', '-q'], { encoding: 'utf-8' });
    await sleep(500);
    const ps2 = spawnSync('podman', ['ps', '--filter', 'ancestor=docker.io/library/python@sha256:51dafde81dbdb6ebde285137a295cf18a47ca95234fe388a343719cb97305b3d', '-q'], { encoding: 'utf-8' });
    assert.equal(ps2.stdout.trim(), '', `containers left: ${ps.stdout}`);
  } finally {
    child.kill('SIGKILL'); killAllActiveRuns();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
