import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startHarness, rawRequest, McpHttpClient, PNG_BASE64, type Harness } from './mcp-w6-helper.ts';
import { McpRateLimiter } from '../src/mcp/mcp-rate-limiter.ts';
import { suggestKey } from '../src/mcp/tool-validation.ts';
import { hashPassword } from '../src/db/seed.ts';

// W6-M Part 2: regression tests for MCP validation and behaviour fixes.
test('W6-M MCP validation and fixes', async (t) => {
  const h: Harness = await startHarness();
  t.after(() => h.close());

  const tok = await h.createToken({ label: 'w6 fixes' });
  const c = await h.connect(tok.rawToken);
  const ok = async (name: string, args: any) => {
    const r = await c.call(name, args);
    assert.equal(r.isError, false, `${name}: ${r.text}`);
    return r.json;
  };
  const course = await ok('create_course', { title: 'Fixes Course' });
  const cid: string = course.id;
  const mod = await ok('create_module', { course_id: cid, title: 'M' });
  const les = await ok('create_lesson', { course_id: cid, module_id: mod.id, title: 'L' });

  await t.test('1. argument validation: type, required, enum, integer, min, maxLength, array items', async () => {
    const stepsBefore = (h.db.prepare('SELECT COUNT(*) AS n FROM steps WHERE lesson_id = ?').get(les.id) as any).n;
    const pos = await c.call('create_step', { course_id: cid, lesson_id: les.id, title: 'x', type: 'theory', position: 'first' });
    assert.equal(pos.isError, true);
    assert.match(pos.text, /"position".*expected integer/);
    const stepsAfter = (h.db.prepare('SELECT COUNT(*) AS n FROM steps WHERE lesson_id = ?').get(les.id) as any).n;
    assert.equal(stepsAfter, stepsBefore, 'nothing is stored when validation fails');
    const textPos = h.db.prepare("SELECT COUNT(*) AS n FROM steps WHERE typeof(position) = 'text'").get() as any;
    assert.equal(textPos.n, 0);

    const title = await c.call('create_step', { course_id: cid, lesson_id: les.id, title: 5, type: 'theory' });
    assert.equal(title.isError, true);
    assert.match(title.text, /"title".*expected string/);
    assert.doesNotMatch(title.text, /is not a function/);

    const req = await c.call('create_module', { title: 'no course' });
    assert.match(req.text, /course_id is required/);
    const nullReq = await c.call('create_module', { course_id: null, title: 'x' });
    assert.match(nullReq.text, /course_id is required/);

    const en = await c.call('create_step', { course_id: cid, lesson_id: les.id, title: 'x', type: 'audio' });
    assert.match(en.text, /"type".*one of "theory", "video", "quiz", "python"/);

    const frac = await c.call('create_module', { course_id: cid, title: 'x', position: 1.5 });
    assert.match(frac.text, /"position".*expected integer/);
    const neg = await c.call('create_module', { course_id: cid, title: 'x', position: -1 });
    assert.match(neg.text, /"position".*>= 0/);
    const long = await c.call('create_module', { course_id: cid, title: 'x'.repeat(201) });
    assert.match(long.text, /"title".*at most 200/);
    const tags = await c.call('create_course', { title: 'T', tags: ['a', 2] });
    assert.match(tags.text, /"tags\[1\]".*expected string/);
    const manyTags = await c.call('create_course', { title: 'T', tags: ['1', '2', '3', '4', '5', '6'] });
    assert.match(manyTags.text, /"tags".*at most 5/);
    const bool = await c.call('delete_module', { course_id: cid, module_id: mod.id, confirm_delete_children: 'yes' });
    assert.match(bool.text, /"confirm_delete_children".*expected boolean/);
    const notObj = await c.call('create_module', 'oops' as any);
    assert.equal(notObj.isError, true);
  });

  await t.test('2. unknown / misnamed keys are rejected with a nearest-key suggestion', async () => {
    const rev = (await ok('get_course', { course_id: cid })).draftRevision;
    const lo = await c.call('update_course_metadata', { course_id: cid, expected_revision: rev, metadata: { learningOutcomes: ['a'] } });
    assert.equal(lo.isError, true);
    assert.match(lo.text, /Unknown argument "metadata\.learningOutcomes"\. Did you mean "metadata\.learning_outcomes"\?/);
    assert.equal((await ok('get_course', { course_id: cid })).draftRevision, rev, 'no revision bump on rejection');

    const tc = await c.call('create_step', {
      course_id: cid, lesson_id: les.id, title: 'py', type: 'python',
      test_cases: [{ stdin: '1', expectedStdout: '1' }],
    });
    assert.match(tc.text, /Unknown argument "test_cases\[0\]\.expectedStdout"\. Did you mean "test_cases\[0\]\.expected_stdout"\?/);
    const tc2 = await c.call('validate_exercise', {
      reference_solution: 'print(1)', test_cases: [{ stdin: '', expected_stdout: '1\n', hidden: true }],
    });
    assert.match(tc2.text, /Unknown argument "test_cases\[0\]\.hidden"\. Did you mean "test_cases\[0\]\.is_hidden"\?/);

    const rl = await c.call('validate_exercise', {
      reference_solution: 'print(1)', test_cases: [{ stdin: '', expected_stdout: '1\n' }],
      runtime_limits: { cpuTimeoutSeconds: 1 },
    });
    assert.match(rl.text, /Unknown argument "runtime_limits\.cpuTimeoutSeconds"\. Did you mean "runtime_limits\.cpu_timeout_seconds"\?/);

    const top = await c.call('create_module', { course_id: cid, title: 'x', positon: 0 });
    assert.match(top.text, /Unknown argument "positon"\. Did you mean "position"\?/);

    const batch = await c.call('batch_author', {
      course_id: cid, expected_revision: rev, idempotency_key: 'k-unknown',
      operations: [{ op: 'create_module', title: 'x', titel: 'typo' }],
    });
    assert.match(batch.text, /Unknown argument "operations\[0\]\.titel"\. Did you mean "operations\[0\]\.title"\?/);

    assert.equal(suggestKey('learningOutcomes', ['title', 'learning_outcomes']), 'learning_outcomes');
    assert.equal(suggestKey('zzzzzzzz', ['title', 'learning_outcomes']), null);

    const list = await c.rpc('tools/list');
    const tool = list.body.result.tools.find((x: any) => x.name === 'update_course_metadata');
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.inputSchema.properties.metadata.additionalProperties, false);
  });

  await t.test('2b. validate_exercise honours runtime_limits and rejects out-of-range values', async () => {
    const loop = await c.call('validate_exercise', {
      reference_solution: 'while True:\n    pass\n',
      test_cases: [{ stdin: '', expected_stdout: '' }],
      runtime_limits: { cpu_timeout_seconds: 1, wall_timeout_seconds: 1 },
    });
    assert.equal(loop.isError, false, loop.text);
    assert.equal(loop.json.valid, false);
    assert.notEqual(loop.json.results[0].verdict, 'PASSED');
    const high = await c.call('validate_exercise', {
      reference_solution: 'print(1)', test_cases: [{ stdin: '', expected_stdout: '1\n' }],
      runtime_limits: { cpu_timeout_seconds: 99 },
    });
    assert.equal(high.isError, true);
    assert.match(high.text, /runtime_limits\.cpu_timeout_seconds.*<= 5/);
    const zero = await c.call('validate_exercise', {
      reference_solution: 'print(1)', test_cases: [{ stdin: '', expected_stdout: '1\n' }],
      runtime_limits: { memory_limit_mib: -1 },
    });
    assert.match(zero.text, />= 16/);
    const schema = JSON.parse((await c.rpc('resources/read', { uri: 'zur://schema' })).body.result.contents[0].text);
    assert.deepEqual(
      Object.keys(schema.definitions.ValidateExerciseRuntimeLimitsArgument.properties),
      ['cpu_timeout_seconds', 'wall_timeout_seconds', 'memory_limit_mib']
    );
    const tools = (await c.rpc('tools/list')).body.result.tools;
    const ve = tools.find((x: any) => x.name === 'validate_exercise');
    assert.deepEqual(Object.keys(ve.inputSchema.properties.runtime_limits.properties), Object.keys(schema.definitions.ValidateExerciseRuntimeLimitsArgument.properties));
  });

  await t.test('3. rate limit: configurable, defaults to 300, error carries the request id', async () => {
    assert.equal(new McpRateLimiter().getMaxPerMinute(), 300);
    assert.equal(new McpRateLimiter(5, 2).getMaxPerMinute(), 5);
    const prior = process.env.MCP_RATE_LIMIT_PER_MINUTE;
    process.env.MCP_RATE_LIMIT_PER_MINUTE = '7';
    assert.equal(new McpRateLimiter().getMaxPerMinute(), 7);
    process.env.MCP_RATE_LIMIT_PER_MINUTE = 'garbage';
    assert.equal(new McpRateLimiter().getMaxPerMinute(), 300);
    if (prior === undefined) delete process.env.MCP_RATE_LIMIT_PER_MINUTE; else process.env.MCP_RATE_LIMIT_PER_MINUTE = prior;

    // Small limit through the real HTTP server
    process.env.MCP_RATE_LIMIT_PER_MINUTE = '3';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w6m-rate-'));
    const small = await startHarness(path.join(tmpDir, 'rate.sqlite'));
    if (prior === undefined) delete process.env.MCP_RATE_LIMIT_PER_MINUTE; else process.env.MCP_RATE_LIMIT_PER_MINUTE = prior;
    try {
      const st = await small.createToken();
      const sc = new McpHttpClient(small.port, st.rawToken);
      await sc.initialize(); // initialize + initialized notification = 2 budget units
      assert.equal((await sc.rpc('ping')).status, 200); // 3rd
      const blocked = await sc.post({ jsonrpc: '2.0', id: 'req-42', method: 'ping' });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.id, 'req-42');
      assert.equal(blocked.body.error.code, -32029);
      assert.match(blocked.body.error.message, /Maximum 3 calls per minute/);
      assert.ok(Number(blocked.headers['retry-after']) >= 1);
      assert.ok(blocked.body.error.data.retryAfterSeconds >= 1);
      const blockedBatch = await sc.post([{ jsonrpc: '2.0', id: 'a', method: 'ping' }, { jsonrpc: '2.0', id: 'b', method: 'ping' }]);
      assert.equal(blockedBatch.status, 429);
      assert.deepEqual(blockedBatch.body.map((m: any) => m.id), ['a', 'b']);
      const info = await rawRequest(small.port, '/mcp', 'POST', sc.headers(), JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
      assert.equal(info.status, 429);
    } finally {
      await small.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    const info = JSON.parse((await c.rpc('resources/read', { uri: 'zur://connection-info' })).body.result.contents[0].text);
    assert.equal(info.quotas.rateLimitPerMinute, 300);
    assert.match(info.quotas.rateLimitConfiguration, /MCP_RATE_LIMIT_PER_MINUTE/);
  });

  await t.test('4. nonexistent / foreign courses are not-found, restricted tokens get a clear message', async () => {
    h.db.prepare(`INSERT INTO users (id, email, password_hash, display_name, email_verified, capabilities, account_status, created_at, updated_at)
      VALUES ('user-barb', 'barb@zur.internal', ?, 'Barb', 1, ?, 'active', datetime('now'), datetime('now'))`).run(hashPassword('x'), JSON.stringify(['student', 'author']));
    h.db.prepare(`INSERT INTO courses (id, owner_id, title, description, category_id, visibility, enrollment_policy, draft_revision, created_at, updated_at)
      VALUES ('course-barb', 'user-barb', 'Barb', 'd', 'cat-programming', 'private', 'invitation_only', 1, datetime('now'), datetime('now'))`).run();

    const restricted = await h.createToken({ label: 'restricted', courseRestrictions: [cid] });
    const rc = await h.connect(restricted.rawToken);
    const missing = await rc.call('get_course', { course_id: 'does-not-exist' });
    const foreign = await rc.call('get_course', { course_id: 'course-barb' });
    assert.equal(missing.isError, true);
    assert.doesNotMatch(missing.text, /restriction/i);
    assert.match(missing.text, /isn't available/);
    assert.equal(missing.text, foreign.text, 'foreign course is indistinguishable from a missing one');

    // own course that the token is not allowed to touch -> explicit explanation incl. "created" rule
    const other = await ok('create_course', { title: 'Another owned course' });
    const excluded = await rc.call('get_course', { course_id: other.id });
    assert.equal(excluded.isError, true);
    assert.match(excluded.text, /not in allowed course restrictions/);
    assert.match(excluded.text, /courses it created/);

    // token with an empty restriction list (create-only) can only touch courses it created
    const createOnly = await h.createToken({ label: 'create only', scopes: ['courses:read', 'courses:create', 'content:write'], courseRestrictions: [] });
    const cc = await h.connect(createOnly.rawToken);
    const own = await cc.call('create_course', { title: 'Made by create-only token' });
    assert.equal(own.isError, false);
    assert.equal((await cc.call('get_course', { course_id: own.json.id })).isError, false);
    const denied = await cc.call('get_course', { course_id: cid });
    assert.equal(denied.isError, true);
    assert.match(denied.text, /courses it created/);
    const ctx = await cc.call('get_author_context');
    assert.deepEqual(ctx.json.token.courseRestrictions, [own.json.id]);
    const info = JSON.parse((await c.rpc('resources/read', { uri: 'zur://connection-info' })).body.result.contents[0].text);
    assert.match(info.courseAccess, /created through that token/);
  });

  await t.test('5. JSON-RPC: batch array -> array of responses, unknown resource -> -32002, zero-based positions', async () => {
    const batch = await c.post([{ jsonrpc: '2.0', id: 'b1', method: 'ping' }, { jsonrpc: '2.0', id: 'b2', method: 'resources/list' }]);
    assert.equal(batch.status, 200);
    assert.ok(Array.isArray(batch.body));
    assert.deepEqual(batch.body.map((m: any) => m.id).sort(), ['b1', 'b2']);

    const unknown = await c.rpc('resources/read', { uri: 'zur://does-not-exist' });
    assert.equal(unknown.body.error.code, -32002);
    assert.match(unknown.body.error.message, /Resource not found/);

    const c2 = await ok('create_course', { title: 'Positions' });
    const m1 = await ok('create_module', { course_id: c2.id, title: 'first' });
    const m2 = await ok('create_module', { course_id: c2.id, title: 'second' });
    const l1 = await ok('create_lesson', { course_id: c2.id, module_id: m1.id, title: 'l' });
    const s1 = await ok('create_step', { course_id: c2.id, lesson_id: l1.id, title: 's', type: 'theory' });
    assert.equal(m2.position, m1.position + 1);
    assert.deepEqual([l1.position, s1.position], [0, 0]);
    assert.equal((h.db.prepare('SELECT MIN(position) AS p FROM modules WHERE course_id = ?').get(c2.id) as any).p, 0);

    // move_content really lands the node on the requested index
    const rev = (await ok('get_course', { course_id: c2.id })).draftRevision;
    await ok('move_content', { course_id: c2.id, content_type: 'module', id: m2.id, position: 0, expected_revision: rev });
    const order = (await ok('get_course', { course_id: c2.id, projection: 'outline' })).structure.modules.map((m: any) => m.id);
    assert.equal(order[0], m2.id);
    assert.ok(order.includes(m1.id));
    const positions = h.db.prepare('SELECT position FROM modules WHERE course_id = ? ORDER BY position').all(c2.id).map((r: any) => r.position);
    assert.deepEqual(positions, positions.map((_: number, i: number) => i));
  });

  await t.test('6. duplicate tools stay as deprecated aliases', async () => {
    const tools = (await c.rpc('tools/list')).body.result.tools as any[];
    const by = (n: string) => tools.find((x) => x.name === n);
    assert.match(by('update_image_metadata').description, /^Deprecated alias of update_image/);
    assert.match(by('get_agent_activity').description, /^Deprecated alias of list_agent_activity/);
    assert.doesNotMatch(by('update_image').description, /Deprecated/);
    assert.doesNotMatch(by('list_agent_activity').description, /Deprecated/);
  });

  await t.test('7. list_categories, get_step, list_media: behaviour and denied cases', async () => {
    const cats = await ok('list_categories', {});
    assert.ok(cats.categories.length > 0);
    assert.ok(cats.categories[0].id && cats.categories[0].name && cats.categories[0].slug);

    const step = await ok('create_step', {
      course_id: cid, lesson_id: les.id, title: 'Py', type: 'python',
      content: { kind: 'python', problemStatement: 'p', starterCode: '', referenceSolution: 'print(1)' },
      test_cases: [{ stdin: '', expected_stdout: '1\n', is_hidden: true }],
    });
    const got = await ok('get_step', { course_id: cid, step_id: step.id });
    assert.equal(got.id, step.id);
    assert.equal(got.type, 'python');
    assert.equal(got.testCases.length, 1);
    assert.equal(got.testCases[0].expectedStdout, '1\n');
    assert.ok(got.content);

    const bytes = PNG_BASE64;
    const img = await ok('complete_image_upload', { course_id: cid, base64_data: bytes, filename: 'a.png', mime_type: 'image/png', alt_text: 'pic' });
    const media = await ok('list_media', { course_id: cid });
    assert.ok(media.assets.some((a: any) => a.asset_id === img.asset_id && a.alt_text === 'pic'));

    // denied: token without courses:read
    const noRead = await h.createToken({ label: 'no read', scopes: ['exercises:validate'] });
    const nc = await h.connect(noRead.rawToken);
    for (const [name, args] of [
      ['list_categories', {}],
      ['get_step', { course_id: cid, step_id: step.id }],
      ['list_media', { course_id: cid }],
    ] as Array<[string, any]>) {
      const r = await nc.call(name, args);
      assert.equal(r.isError, true, name);
      assert.match(r.text, /courses:read/);
    }

    // denied: course not in token restrictions
    const restricted = await h.createToken({ label: 'restricted2', scopes: ['courses:read'], courseRestrictions: [(await ok('create_course', { title: 'Allowed one' })).id] });
    const rc = await h.connect(restricted.rawToken);
    assert.equal((await rc.call('get_step', { course_id: cid, step_id: step.id })).isError, true);
    assert.equal((await rc.call('list_media', { course_id: cid })).isError, true);
    assert.equal((await rc.call('list_categories', {})).isError, false);

    // denied: other author's course and step/course mismatch
    assert.equal((await c.call('list_media', { course_id: 'course-barb' })).isError, true);
    assert.equal((await c.call('get_step', { course_id: 'course-barb', step_id: step.id })).isError, true);
    const otherCourse = await ok('create_course', { title: 'Mismatch' });
    const mismatch = await c.call('get_step', { course_id: otherCourse.id, step_id: step.id });
    assert.equal(mismatch.isError, true);
    assert.match(mismatch.text, /isn't available/);

    // unauthenticated is rejected by the transport
    const anon = await rawRequest(h.port, '/mcp', 'POST', { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_categories', arguments: {} } }));
    assert.equal(anon.status, 401);
  });

  await t.test('legacy argument forms still accepted (base_revision, image_id, new_position, expected_checksum)', async () => {
    const rev = (await ok('get_course', { course_id: cid })).draftRevision;
    const prep = await ok('prepare_course_changes', { course_id: cid, base_revision: rev, operations: [{ type: 'create_module', temp_id: 'm', title: 'legacy' }] });
    assert.equal(prep.summary.modules_created, 1);
    const img = await ok('complete_image_upload', { course_id: cid, base64_data: PNG_BASE64, filename: 'l.png', mime_type: 'image/png', alt_text: 'legacy' });
    const got = await ok('get_image', { image_id: img.asset_id });
    assert.equal(got.id ?? got.asset_id, img.asset_id);
    const wrongCourse = await c.call('update_image', { asset_id: img.asset_id, course_id: 'other', expected_revision: rev, idempotency_key: 'k-wc' });
    assert.equal(wrongCourse.isError, true);
  });
});
