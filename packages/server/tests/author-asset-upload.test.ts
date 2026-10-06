import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { getDatabase, closeDatabase } from '../src/db/database.ts';
import { createServer } from '../src/server.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { runMigrations } from '../src/db/migrate.ts';

function createTestServer() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-asset-upload-'));
  const dbPath = path.join(tempDir, 'test.sqlite');
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  runMigrations(dbPath);
  seedDatabase(dbPath);
  const db = getDatabase(dbPath);
  const server = createServer(db, { uploadDir });
  return { server, db, dbPath, tempDir, uploadDir };
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

test('F02: Author Asset Upload, Injection, Save, Reload, and Preview Contract', async (t) => {
  const { server, db, dbPath, tempDir, uploadDir } = createTestServer();
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

  const loginRes = await request(server, '/api/auth/sign-in', 'POST', {
    email: 'guido@zur.internal',
    password: 'AuthorPass123!',
  });
  assert.strictEqual(loginRes.status, 200);
  const authorToken = loginRes.body.token;

  const studentLoginRes = await request(server, '/api/auth/sign-in', 'POST', {
    email: 'ada@zur.internal',
    password: 'StudentPass123!',
  });
  assert.strictEqual(studentLoginRes.status, 200);
  const studentToken = studentLoginRes.body.token;

  // 1x1 valid PNG in base64
  const validPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  await t.test('Rejects unauthenticated upload', async () => {
    const res = await request(server, '/api/author/courses/course-python-foundations/assets', 'POST', {
      filename: 'diagram.png',
      mimeType: 'image/png',
      base64: validPngBase64,
      altText: 'Flowchart diagram',
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test('Rejects unsupported MIME type', async () => {
    const res = await request(
      server,
      '/api/author/courses/course-python-foundations/assets',
      'POST',
      {
        filename: 'malicious.exe',
        mimeType: 'application/x-msdownload',
        base64: Buffer.from('binary data').toString('base64'),
        altText: 'A binary',
      },
      authorToken
    );
    assert.strictEqual(res.status, 400);
  });

  let uploadedAssetId = '';

  await t.test('Successfully uploads valid PNG with altText into isolated temp storage', async () => {
    const beforeFiles = fs.readdirSync(uploadDir);
    const res = await request(
      server,
      '/api/author/courses/course-python-foundations/assets',
      'POST',
      {
        filename: 'architecture.png',
        mimeType: 'image/png',
        base64: validPngBase64,
        altText: 'Platform architecture diagram',
      },
      authorToken
    );
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.id, 'Asset ID must be returned');
    assert.strictEqual(res.body.altText, 'Platform architecture diagram');
    assert.strictEqual(res.body.mimeType, 'image/png');
    uploadedAssetId = res.body.id;

    // Verify written to injectable temp upload directory
    const courseUploadDir = path.join(uploadDir, 'course-python-foundations');
    assert.ok(fs.existsSync(courseUploadDir), 'Course upload directory must exist inside tempDir');
    const files = fs.readdirSync(courseUploadDir);
    assert.ok(files.some((f) => f.startsWith(uploadedAssetId)), 'Uploaded asset file must exist in isolated directory');

    // Verify retrieval via /api/assets/:id
    const serveRes = await request(server, `/api/assets/${res.body.id}`, 'GET', undefined, authorToken);
    assert.strictEqual(serveRes.status, 200);
    assert.strictEqual(serveRes.headers['content-type'], 'image/png');
    assert.strictEqual(serveRes.headers['x-content-type-options'], 'nosniff');
  });

  await t.test('Upload & Insert -> save -> reload -> authorized preview cycle', async () => {
    assert.ok(uploadedAssetId, 'Asset must be uploaded before insert test');

    // 1. Get initial step detail and revision
    const detailRes = await request(server, '/api/author/steps/step-1-theory/content', 'GET', undefined, authorToken);
    assert.strictEqual(detailRes.status, 200);
    const initialRevision = detailRes.body.revision || 1;

    // 2. Insert image markdown into theory content and save
    const insertedMarkdown = `# What is a variable?\n\n![Platform architecture diagram](/api/assets/${uploadedAssetId})\n\nA variable in Python binds a name to a value.`;
    const saveRes = await request(
      server,
      '/api/author/steps/step-1-theory/content',
      'PUT',
      {
        expectedRevision: initialRevision,
        payload: { markdown: insertedMarkdown },
      },
      authorToken
    );
    assert.strictEqual(saveRes.status, 200);
    assert.ok(saveRes.body.revision > initialRevision, 'Revision must increment after save');

    // 3. Reload step content and verify markdown persistence
    const reloadedRes = await request(server, '/api/author/steps/step-1-theory/content', 'GET', undefined, authorToken);
    assert.strictEqual(reloadedRes.status, 200);
    const savedMarkdown = reloadedRes.body.content?.markdown || '';
    assert.ok(savedMarkdown.includes(`/api/assets/${uploadedAssetId}`), 'Reloaded markdown must include asset image URL');
    assert.ok(savedMarkdown.includes('Platform architecture diagram'), 'Reloaded markdown must include asset alt text');

    // 4. Authorized author preview
    const previewRes = await request(
      server,
      '/api/author/courses/course-python-foundations/preview/step-1-theory',
      'GET',
      undefined,
      authorToken
    );
    assert.strictEqual(previewRes.status, 200);
    const previewMarkdown = previewRes.body.content?.markdown || '';
    assert.ok(previewMarkdown.includes(`/api/assets/${uploadedAssetId}`), 'Preview must contain asset URL');

    // 5. Unauthorized student preview access denied (safe 404 denial)
    const unauthPreviewRes = await request(
      server,
      '/api/author/courses/course-python-foundations/preview/step-1-theory',
      'GET',
      undefined,
      studentToken
    );
    assert.strictEqual(unauthPreviewRes.status, 404);
  });
});
