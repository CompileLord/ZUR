import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startHarness, rawRequest, PNG_BASE64, McpHttpClient, type Harness } from './mcp-w6-helper.ts';

// W6-M Part 1: end-to-end feature coverage over real HTTP (random port, in-memory disposable DB).
test('W6-M MCP feature coverage over real HTTP', async (t) => {
  const h: Harness = await startHarness();
  t.after(() => h.close());

  const tok = await h.createToken({ label: 'w6 full' });
  const c: McpHttpClient = await h.connect(tok.rawToken);

  async function ok(name: string, args: any) {
    const r = await c.call(name, args);
    assert.equal(r.isError, false, `${name} failed: ${r.text}`);
    return r.json;
  }
  async function rev(courseId: string): Promise<number> {
    return (await ok('get_course', { course_id: courseId })).draftRevision;
  }

  // Fixture course
  const course = await ok('create_course', { title: 'W6 Fixture Course' });
  const cid: string = course.id;
  const mod = await ok('create_module', { course_id: cid, title: 'M1' });
  const les = await ok('create_lesson', { course_id: cid, module_id: mod.id, title: 'L1' });
  const step = await ok('create_step', {
    course_id: cid, lesson_id: les.id, title: 'S1', type: 'theory',
    content: { kind: 'theory', markdown: '# hello' },
  });

  await t.test('image upload session: create_image_upload + PUT + complete_image_upload + get_image', async () => {
    const bytes = Buffer.from(PNG_BASE64, 'base64');
    const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
    const up = await ok('create_image_upload', {
      course_id: cid, filename: 'px.png', mime_type: 'image/png', file_size: bytes.length, checksum,
    });
    assert.ok(up.upload_id && up.upload_token && up.upload_url);

    // bearer credentials are refused by the upload endpoint
    const withBearer = await rawRequest(h.port, up.upload_url, 'PUT', {
      'Content-Type': 'image/png', 'X-Upload-Token': up.upload_token, Authorization: `Bearer ${tok.rawToken}`,
    }, bytes);
    assert.equal(withBearer.status, 401);
    // wrong token
    const badTok = await rawRequest(h.port, up.upload_url, 'PUT', { 'Content-Type': 'image/png', 'X-Upload-Token': 'nope' }, bytes);
    assert.equal(badTok.status, 401);
    // wrong content type
    const badCt = await rawRequest(h.port, up.upload_url, 'PUT', { 'Content-Type': 'image/jpeg', 'X-Upload-Token': up.upload_token }, bytes);
    assert.equal(badCt.status, 400);
    // complete before upload
    const early = await c.call('complete_image_upload', { course_id: cid, upload_id: up.upload_id, alt_text: 'x' });
    assert.equal(early.isError, true);

    const put = await rawRequest(h.port, up.upload_url, 'PUT', { 'Content-Type': 'image/png', 'X-Upload-Token': up.upload_token }, bytes);
    assert.ok(put.status >= 200 && put.status < 300, `PUT ${put.status} ${put.raw}`);
    // replay refused
    const replay = await rawRequest(h.port, up.upload_url, 'PUT', { 'Content-Type': 'image/png', 'X-Upload-Token': up.upload_token }, bytes);
    assert.equal(replay.status, 400);

    const done = await ok('complete_image_upload', { course_id: cid, upload_id: up.upload_id, alt_text: 'A pixel', caption: 'cap' });
    assert.match(done.markdown_reference, /^!\[A pixel\]\(zur-asset:/);
    assert.equal(done.mime_type, 'image/png');
    const got = await ok('get_image', { asset_id: done.asset_id });
    assert.equal(got.altText ?? got.alt_text, 'A pixel');
    (globalThis as any).__asset = done.asset_id;
  });

  await t.test('update_image / update_image_metadata / attach_image / detach_image', async () => {
    const assetId: string = (globalThis as any).__asset;
    let r = await rev(cid);
    const u1 = await ok('update_image', { asset_id: assetId, expected_revision: r, idempotency_key: 'ui-1', alt_text: 'Updated alt', caption: 'c2' });
    assert.ok(JSON.stringify(u1).includes('Updated alt'));
    r = await rev(cid);
    const u2 = await ok('update_image_metadata', { asset_id: assetId, expected_revision: r, idempotency_key: 'ui-2', alt_text: 'Alias alt' });
    assert.ok(JSON.stringify(u2).includes('Alias alt'));
    r = await rev(cid);
    await ok('attach_image', { course_id: cid, step_id: step.id, asset_id: assetId, expected_revision: r, idempotency_key: 'at-1', alt_text: 'attached' });
    r = await rev(cid);
    await ok('detach_image', { course_id: cid, step_id: step.id, asset_id: assetId, expected_revision: r, idempotency_key: 'de-1' });
    const stale = await c.call('attach_image', { course_id: cid, step_id: step.id, asset_id: assetId, expected_revision: 1, idempotency_key: 'at-stale' });
    assert.equal(stale.isError, true);
  });

  await t.test('prepare_course_changes + apply_course_changes (+ replay)', async () => {
    const r = await rev(cid);
    const prep = await ok('prepare_course_changes', {
      course_id: cid, expected_revision: r,
      operations: [{ op: 'create_module', temp_id: 'm', title: 'Prepared M' }, { op: 'create_lesson', temp_id: 'l', module_id: 'm', title: 'Prepared L' }],
    });
    assert.equal(prep.summary.modules_created, 1);
    const applied = await ok('apply_course_changes', { course_id: cid, plan_id: prep.plan_id, expected_revision: r, idempotency_key: 'apply-1' });
    assert.equal(applied.operations_applied, 2);
    const replay = await ok('apply_course_changes', { course_id: cid, plan_id: prep.plan_id, expected_revision: r, idempotency_key: 'apply-1' });
    assert.deepEqual(replay, applied);
    const again = await c.call('apply_course_changes', { course_id: cid, plan_id: prep.plan_id, expected_revision: r, idempotency_key: 'apply-2' });
    assert.equal(again.isError, true);
  });

  await t.test('batch_author success, partial failure rolls back, idempotent replay', async () => {
    const r = await rev(cid);
    const args = {
      course_id: cid, expected_revision: r, idempotency_key: 'batch-ok',
      operations: [
        { op: 'create_module', temp_id: 'bm', title: 'Batch M' },
        { op: 'create_lesson', temp_id: 'bl', module_id: 'bm', title: 'Batch L' },
        { op: 'create_step', temp_id: 'bs', lesson_id: 'bl', title: 'Batch S', type: 'theory', content: { kind: 'theory', markdown: 'x' } },
      ],
    };
    const first = await ok('batch_author', args);
    assert.equal(first.operations_applied, 3);
    assert.ok(first.created_ids.bm && first.created_ids.bl && first.created_ids.bs);
    const replay = await ok('batch_author', args);
    assert.deepEqual(replay, first);
    // same key, different payload -> conflict
    const clash = await c.call('batch_author', { ...args, operations: [{ op: 'create_module', title: 'Other' }] });
    assert.equal(clash.isError, true);

    // partial failure: second op references a missing module => whole batch rejected, nothing created
    const before = await rev(cid);
    const modsBefore = (await ok('get_course', { course_id: cid, projection: 'outline' })).structure.modules.length;
    const bad = await c.call('batch_author', {
      course_id: cid, expected_revision: before, idempotency_key: 'batch-bad',
      operations: [
        { op: 'create_module', temp_id: 'x', title: 'Should roll back' },
        { op: 'update_module', module_id: 'does-not-exist', title: 'nope' },
      ],
    });
    assert.equal(bad.isError, true);
    assert.equal(await rev(cid), before);
    const modsAfter = (await ok('get_course', { course_id: cid, projection: 'outline' })).structure.modules.length;
    assert.equal(modsAfter, modsBefore);
  });

  await t.test('get_change + list_agent_activity + get_agent_activity', async () => {
    const list = await ok('list_agent_activity', { course_id: cid });
    assert.ok(list.items.length > 0);
    const alias = await ok('get_agent_activity', { course_id: cid });
    assert.equal(alias.items.length, list.items.length);
    assert.equal(list.items[0].tokenId, undefined);
    const changeId = list.items[0].id;
    const ch = await ok('get_change', { change_id: changeId });
    assert.equal(ch.course_id, cid);
    assert.ok('diff' in ch);
    const missing = await c.call('get_change', { change_id: 'nope' });
    assert.equal(missing.isError, true);
  });

  await t.test('move_content, duplicate_content, duplicate_step', async () => {
    const outline = async () => (await ok('get_course', { course_id: cid, projection: 'outline' })).structure.modules;
    const mods = await outline();
    assert.ok(mods.length >= 3);
    const last = mods[mods.length - 1];
    let r = await rev(cid);
    const mv = await ok('move_content', { course_id: cid, content_type: 'module', id: last.id, position: 0, expected_revision: r });
    assert.ok(mv.new_revision > r);
    assert.equal((await outline())[0].id, last.id);
    r = await rev(cid);
    const dup = await ok('duplicate_content', { course_id: cid, content_type: 'lesson', id: les.id, expected_revision: r });
    assert.ok(dup.duplicate_id);
    const ds = await ok('duplicate_step', { course_id: cid, step_id: step.id });
    assert.notEqual(ds.id, step.id);
    const stale = await c.call('move_content', { course_id: cid, content_type: 'module', id: last.id, position: 1, expected_revision: 1 });
    assert.equal(stale.isError, true);
  });

  await t.test('restore_draft_revision', async () => {
    const m = await ok('create_module', { course_id: cid, title: 'To be restored away' });
    // delete creates an automatic recovery snapshot
    await ok('delete_module', { course_id: cid, module_id: m.id });
    const recoveries = h.db.prepare('SELECT id, revision_number FROM recovery_revisions WHERE course_id = ? ORDER BY revision_number DESC').all(cid) as any[];
    assert.ok(recoveries.length > 0);
    const r = await rev(cid);
    const restored = await ok('restore_draft_revision', { course_id: cid, revision_id: recoveries[0].id, expected_revision: r });
    assert.ok(restored.newRevision > r);
    const outline = (await ok('get_course', { course_id: cid, projection: 'outline' })).structure.modules;
    assert.ok(outline.some((x: any) => x.id === m.id), 'module present again after restore');
    const stale = await c.call('restore_draft_revision', { course_id: cid, revision_id: recoveries[0].id, expected_revision: 1 });
    assert.equal(stale.isError, true);
  });

  await t.test('delete_step / delete_lesson / delete_module honour confirm_delete_children', async () => {
    const m = await ok('create_module', { course_id: cid, title: 'Del M' });
    const l = await ok('create_lesson', { course_id: cid, module_id: m.id, title: 'Del L' });
    const s = await ok('create_step', { course_id: cid, lesson_id: l.id, title: 'Del S', type: 'theory' });
    const noConfirmMod = await c.call('delete_module', { course_id: cid, module_id: m.id });
    assert.equal(noConfirmMod.isError, true);
    assert.match(noConfirmMod.text, /confirm_delete_children/);
    const noConfirmLes = await c.call('delete_lesson', { course_id: cid, lesson_id: l.id });
    assert.equal(noConfirmLes.isError, true);
    await ok('delete_step', { course_id: cid, step_id: s.id });
    await ok('delete_lesson', { course_id: cid, lesson_id: l.id });
    const l2 = await ok('create_lesson', { course_id: cid, module_id: m.id, title: 'Del L2' });
    await ok('create_step', { course_id: cid, lesson_id: l2.id, title: 'S', type: 'theory' });
    await ok('delete_module', { course_id: cid, module_id: m.id, confirm_delete_children: true });
    const outline = (await ok('get_course', { course_id: cid, projection: 'outline' })).structure.modules;
    assert.ok(!outline.some((x: any) => x.id === m.id));
  });

  await t.test('archive_course / restore_course', async () => {
    const tmp = await ok('create_course', { title: 'Archivable' });
    const arch = await ok('archive_course', { course_id: tmp.id });
    assert.equal(arch.publicationStatus ?? arch.publication_status, 'archived');
    const rest = await ok('restore_course', { course_id: tmp.id });
    assert.notEqual(rest.publicationStatus ?? rest.publication_status, 'archived');
  });

  await t.test('concurrent calls with the same expected_revision: exactly one wins', async () => {
    const r = await rev(cid);
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((i) => c.call('update_course_metadata', { course_id: cid, expected_revision: r, metadata: { description: `race ${i}` } }))
    );
    const wins = results.filter((x) => !x.isError).length;
    assert.equal(wins, 1, results.map((x) => x.text.slice(0, 80)).join(' | '));
    assert.equal(await rev(cid), r + 1);
  });

  await t.test('token expiry: expired token is rejected on existing session and new connections', async () => {
    const t2 = await h.createToken({ label: 'to expire' });
    const c2 = await h.connect(t2.rawToken);
    assert.equal((await c2.call('get_author_context')).isError, false);
    h.db.prepare("UPDATE author_access_tokens SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 60_000).toISOString(), t2.id);
    const res = await c2.rpc('tools/list');
    assert.equal(res.status, 401);
    assert.match(JSON.stringify(res.body), /expired/i);
    const fresh = new McpHttpClient(h.port, t2.rawToken);
    const init = await fresh.initialize();
    assert.equal(init.status, 401);
  });

  await t.test('token replace: old token revoked, new token works, cannot widen scopes', async () => {
    const t3 = await h.createToken({ label: 'to replace', scopes: ['courses:read', 'content:write'] });
    const c3 = await h.connect(t3.rawToken);
    assert.equal((await c3.call('get_author_context')).isError, false);
    const rep = await h.api('POST', `/api/author/tokens/${t3.id}/replace`, { password: 'AuthorPass123!', expiryDays: 7 }, t3.session);
    assert.equal(rep.status, 201, rep.raw);
    assert.ok(rep.body.rawToken && rep.body.rawToken !== t3.rawToken);
    const old = await c3.rpc('tools/list');
    assert.equal(old.status, 401);
    const c4 = await h.connect(rep.body.rawToken);
    assert.equal((await c4.call('get_author_context')).isError, false);
    const wide = await h.api('POST', `/api/author/tokens/${rep.body.token.id}/replace`, { password: 'AuthorPass123!', scopes: ['courses:read', 'courses:publish'] }, t3.session);
    assert.equal(wide.status, 400);
  });

  await t.test('resources/list + resources/read for all three resources, unknown URI', async () => {
    const list = await c.rpc('resources/list');
    const uris = list.body.result.resources.map((x: any) => x.uri).sort();
    assert.deepEqual(uris, ['zur://connection-info', 'zur://markdown-guide', 'zur://schema']);
    for (const uri of uris) {
      const r = await c.rpc('resources/read', { uri });
      assert.equal(r.body.result.contents[0].uri, uri);
      assert.ok(r.body.result.contents[0].text.length > 50);
    }
    const bad = await c.rpc('resources/read', { uri: 'zur://nope' });
    assert.ok(bad.body.error, 'unknown resource must error');
  });

  await t.test('official @modelcontextprotocol/sdk client: initialize, listTools, callTool, readResource', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${h.port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${tok.rawToken}` } },
    });
    const client = new Client({ name: 'w6-official', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);
    try {
      assert.ok(client.getServerVersion()?.name);
      const tools = await client.listTools();
      assert.ok(tools.tools.length >= 30);
      const res: any = await client.callTool({ name: 'get_course', arguments: { course_id: cid } });
      assert.ok(!res.isError);
      assert.equal(JSON.parse(res.content[0].text).id, cid);
      const err: any = await client.callTool({ name: 'get_course', arguments: { course_id: 'missing' } });
      assert.equal(err.isError, true);
      const rr = await client.readResource({ uri: 'zur://schema' });
      assert.ok((rr.contents[0] as any).text);
    } finally {
      await client.close();
    }
  });
});
