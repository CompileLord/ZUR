import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { getDatabase, closeDatabase } from '../src/db/database.ts';
import { createServer } from '../src/server.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { runMigrations } from '../src/db/migrate.ts';

const fixturePythonRunner = async (code: string, stdin: string = '', options: any = {}) => {
  return new Promise<any>((resolve) => {
    const cp = spawn('python3', ['-c', code], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    cp.stdout.on('data', (d) => (stdout += d));
    cp.stderr.on('data', (d) => (stderr += d));
    cp.on('close', (exitCode) => {
      resolve({
        verdict: exitCode === 0 ? 'PASSED' : 'RUNTIME_ERROR',
        stdout,
        stderr,
        exitCode,
        executionTimeMs: 15,
      });
    });
    cp.on('error', (err) => {
      resolve({
        verdict: 'INTERNAL_ERROR',
        stdout: '',
        stderr: err.message,
        exitCode: 1,
        executionTimeMs: 0,
        errorMessage: err.message,
      });
    });
    if (stdin) {
      cp.stdin.write(stdin);
    }
    cp.stdin.end();
  });
};

function createTestServer(dependencies: { runner?: any } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-ref-check-'));
  const dbPath = path.join(tempDir, 'test.sqlite');
  runMigrations(dbPath);
  seedDatabase(dbPath);
  const db = getDatabase(dbPath);
  const server = createServer(db, dependencies);
  return { server, db, dbPath, tempDir };
}

async function request(
  server: http.Server,
  path: string,
  method: string = 'GET',
  body?: any,
  token?: string
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        socketPath: undefined,
        host: '127.0.0.1',
        port: (server.address() as any).port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('F03: Author Reference Solution Validation Endpoint', async (t) => {
  const { server, db, dbPath, tempDir } = createTestServer({ runner: fixturePythonRunner });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    closeDatabase(dbPath);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // Login as author
  const loginRes = await request(server, '/api/auth/sign-in', 'POST', {
    email: 'guido@zur.internal',
    password: 'AuthorPass123!',
  });
  assert.strictEqual(loginRes.status, 200);
  const authorToken = loginRes.body.token;

  // Login as student
  const studentLoginRes = await request(server, '/api/auth/sign-in', 'POST', {
    email: 'ada@zur.internal',
    password: 'StudentPass123!',
  });
  assert.strictEqual(studentLoginRes.status, 200);
  const studentToken = studentLoginRes.body.token;

  await t.test('Rejects unauthenticated requests', async () => {
    const res = await request(server, '/api/author/steps/step-4-python-echo/check-reference', 'POST', {
      referenceSolution: 'print("hello")',
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test('Rejects requests from non-authors', async () => {
    const res = await request(
      server,
      '/api/author/steps/step-4-python-echo/check-reference',
      'POST',
      { referenceSolution: 'print("hello")' },
      studentToken
    );
    assert.strictEqual(res.status, 403);
  });

  await t.test('Rejects empty reference solution', async () => {
    const res = await request(
      server,
      '/api/author/steps/step-4-python-echo/check-reference',
      'POST',
      { referenceSolution: '   ' },
      authorToken
    );
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error?.message?.includes('cannot be empty'));
  });

  await t.test('Rejects when platform execution is paused', async () => {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('execution_paused', 'true', datetime('now'))").run();
    try {
      const res = await request(
        server,
        '/api/author/steps/step-4-python-echo/check-reference',
        'POST',
        { referenceSolution: 'print("hello")' },
        authorToken
      );
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error?.message?.includes('paused'));
    } finally {
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('execution_paused', 'false', datetime('now'))").run();
    }
  });

  await t.test('Rejects more than 25 test cases', async () => {
    const manyTests = Array.from({ length: 26 }, (_, i) => ({
      stdin: `${i}`,
      expectedStdout: `${i}`,
    }));
    const res = await request(
      server,
      '/api/author/steps/step-4-python-echo/check-reference',
      'POST',
      {
        referenceSolution: 'import sys; print(sys.stdin.read().strip())',
        publicTests: manyTests,
      },
      authorToken
    );
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error?.message?.includes('25 test cases'));
  });

  await t.test('Rejects when exercise has no tests configured', async () => {
    const res = await request(
      server,
      '/api/author/steps/step-4-python-echo/check-reference',
      'POST',
      {
        referenceSolution: 'print("ok")',
        publicTests: [],
        hiddenTests: [],
      },
      authorToken
    );
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error?.message?.includes('no test cases'));
  });

  await t.test('Rejects oversized reference solution exceeding 64 KiB', async () => {
    const oversizedSolution = 'x = 1\n'.repeat(12000); // > 64 KiB
    const res = await request(
      server,
      '/api/author/steps/step-4-python-echo/check-reference',
      'POST',
      { referenceSolution: oversizedSolution },
      authorToken
    );
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error?.message?.includes('64 KiB'));
  });

  await t.test('Rejects oversized test case stdin exceeding 64 KiB', async () => {
    const res = await request(
      server,
      '/api/author/steps/step-4-python-echo/check-reference',
      'POST',
      {
        referenceSolution: 'print("ok")',
        publicTests: [{ stdin: 'a'.repeat(65537), expectedStdout: 'ok' }],
      },
      authorToken
    );
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error?.message?.includes('64 KiB'));
  });

  await t.test('Rejects oversized test case expectedStdout exceeding 64 KiB', async () => {
    const res = await request(
      server,
      '/api/author/steps/step-4-python-echo/check-reference',
      'POST',
      {
        referenceSolution: 'print("ok")',
        publicTests: [{ stdin: '1', expectedStdout: 'b'.repeat(65537) }],
      },
      authorToken
    );
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error?.message?.includes('64 KiB'));
  });

  await t.test('Enforces concurrency limit (max 2 concurrent reference checks per author)', async () => {
    // Launch 3 requests concurrently
    const p1 = request(server, '/api/author/steps/step-4-python-echo/check-reference', 'POST', {
      referenceSolution: 'import time; time.sleep(0.5); print("1")',
      publicTests: [{ stdin: '1', expectedStdout: '1' }],
    }, authorToken);

    const p2 = request(server, '/api/author/steps/step-4-python-echo/check-reference', 'POST', {
      referenceSolution: 'import time; time.sleep(0.5); print("2")',
      publicTests: [{ stdin: '2', expectedStdout: '2' }],
    }, authorToken);

    const p3 = request(server, '/api/author/steps/step-4-python-echo/check-reference', 'POST', {
      referenceSolution: 'print("3")',
      publicTests: [{ stdin: '3', expectedStdout: '3' }],
    }, authorToken);

    const results = await Promise.all([p1, p2, p3]);
    const statuses = results.map(r => r.status);
    assert.ok(statuses.includes(429), `One of concurrent requests must receive 429 Rate Limited, got: ${statuses.join(', ')}`);
  });

  await t.test('Processes unsaved test case payloads provided in request', async () => {
    const res = await request(
      server,
      '/api/author/steps/step-4-python-echo/check-reference',
      'POST',
      {
        referenceSolution: 'import sys; print(sys.stdin.read().strip())',
        publicTests: [{ name: 'Custom Sample', stdin: 'Hello Unsaved', expectedStdout: 'Hello Unsaved' }],
        hiddenTests: [{ name: 'Custom Secret', stdin: 'Secret 42', expectedStdout: 'Secret 42' }],
      },
      authorToken
    );
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.tests), 'Response must have tests array');
    assert.strictEqual(res.body.tests.length, 2);
    assert.strictEqual(res.body.tests[0].name, 'Custom Sample');
    assert.strictEqual(res.body.tests[1].name, 'Custom Secret');
    assert.strictEqual(res.body.allPassed, true);
    assert.strictEqual(res.body.validationStatus, 'valid');
    assert.strictEqual(res.body.tests[0].passed, true);
    assert.strictEqual(res.body.tests[1].passed, true);
  });

  await t.test('Real execution: correct reference passes all public and hidden tests (host diagnostic)', async () => {
    const res = await request(
      server,
      '/api/author/steps/step-4-python-echo/check-reference',
      'POST',
      {
        referenceSolution: 'print(int(input()) * 2)',
        publicTests: [{ name: 'Public double', stdin: '21\n', expectedStdout: '42\n' }],
        hiddenTests: [{ name: 'Hidden double', stdin: '4\n', expectedStdout: '8\n' }],
      },
      authorToken
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.allPassed, true, 'All tests must pass for correct reference solution');
    assert.strictEqual(res.body.validationStatus, 'valid');
    assert.strictEqual(res.body.tests.length, 2);
    assert.strictEqual(res.body.tests[0].passed, true, 'Public test must pass');
    assert.strictEqual(res.body.tests[1].passed, true, 'Hidden test must pass');
  });

  await t.test('Real execution: wrong reference fails public and hidden tests', async () => {
    const res = await request(
      server,
      '/api/author/steps/step-4-python-echo/check-reference',
      'POST',
      {
        referenceSolution: 'print(int(input()) + 1)',
        publicTests: [{ name: 'Public double', stdin: '21\n', expectedStdout: '42\n' }],
        hiddenTests: [{ name: 'Hidden double', stdin: '4\n', expectedStdout: '8\n' }],
      },
      authorToken
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.allPassed, false, 'Reference solution with wrong logic must not pass');
    assert.strictEqual(res.body.validationStatus, 'invalid');
    assert.strictEqual(res.body.tests.length, 2);
    assert.strictEqual(res.body.tests[0].passed, false, 'Public test must fail with output mismatch');
    assert.strictEqual(res.body.tests[1].passed, false, 'Hidden test must fail with output mismatch');
    assert.ok(res.body.tests[0].error.includes('Output mismatch'), 'Public error must mention output mismatch');
    assert.ok(res.body.tests[1].error.includes('Output mismatch on hidden test case'), 'Hidden error must not leak expected output');
  });

  await t.test('Real execution: changed unsaved public test fails while hidden test passes', async () => {
    const res = await request(
      server,
      '/api/author/steps/step-4-python-echo/check-reference',
      'POST',
      {
        referenceSolution: 'print(int(input()) * 2)',
        publicTests: [{ name: 'Modified public test', stdin: '21\n', expectedStdout: '999\n' }],
        hiddenTests: [{ name: 'Unchanged hidden test', stdin: '4\n', expectedStdout: '8\n' }],
      },
      authorToken
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.allPassed, false, 'Overall validation must fail when public test fails');
    assert.strictEqual(res.body.validationStatus, 'invalid');
    assert.strictEqual(res.body.tests.length, 2);
    assert.strictEqual(res.body.tests[0].passed, false, 'Modified public test expecting 999 must fail');
    assert.strictEqual(res.body.tests[1].passed, true, 'Unchanged hidden test expecting 8 must pass');
  });
});
