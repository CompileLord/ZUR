import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN_SCOPE_PRESETS } from 'zur-shared';
import type { S3AuditFixture } from './fixture.ts';

export async function planSecurityAndIdempotencyTests(t: TestContext, f: S3AuditFixture): Promise<void> {
  const { db, tokenService, authorId, authorPassword, callMcp, state } = f;

  await t.test('S3-03 security: batch cannot reference another course hierarchy', async () => {
    const foreignModule = db.prepare("SELECT id FROM modules WHERE course_id = 'course-python-foundations' LIMIT 1").get() as { id: string };
    assert.ok(foreignModule?.id);
    const before = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(state.testCourseId) as { draft_revision: number };
    const response = await callMcp({ jsonrpc: '2.0', id: 24, method: 'tools/call', params: {
      name: 'prepare_course_changes', arguments: { course_id: state.testCourseId, base_revision: before.draft_revision,
        operations: [{ type: 'create_lesson', module_id: foreignModule.id, title: 'Injected lesson' }] },
    }});
    assert.equal(response.body.result.isError, true);
    assert.match(response.body.result.content[0].text, /not found in authorized course/i);
    const after = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(state.testCourseId) as { draft_revision: number };
    assert.equal(after.draft_revision, before.draft_revision);
  });

  // --------------------------------------------------------------------------
  // S3-04: Pre-commit revocation check
  // --------------------------------------------------------------------------
  await t.test('S3-04: Pending-write revocation aborts mutation before commit', async () => {
    // Issue a short-lived token to revoke
    const tempTokenResult = tokenService.createToken(authorId, {
      password: authorPassword,
      label: 'Revocation Test Agent',
      scopes: TOKEN_SCOPE_PRESETS.full_course_control,
      expiryDays: 1,
    });

    // Prepare changes using temp token
    const prepRes = await callMcp(
      {
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/call',
        params: {
          name: 'prepare_course_changes',
          arguments: {
            course_id: state.testCourseId,
            base_revision: state.testCourseRevision,
            operations: [
              {
                type: 'create_module',
                temp_id: 'mod_revoked',
                title: 'Should never commit',
              },
            ],
          },
        },
      },
      { Authorization: `Bearer ${tempTokenResult.rawToken}` }
    );
    const plan = JSON.parse(prepRes.body.result.content[0].text);

    // Revoke token immediately before apply commit
    tokenService.revokeToken(authorId, tempTokenResult.token.id);

    // Apply call fails pre-commit check
    const applyRes = await callMcp(
      {
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/call',
        params: {
          name: 'apply_course_changes',
          arguments: {
            plan_id: plan.plan_id,
            course_id: state.testCourseId,
            idempotency_key: 'revoked-test-idemp',
          },
        },
      },
      { Authorization: `Bearer ${tempTokenResult.rawToken}` }
    );

    // Must be rejected as revoked
    assert.ok(applyRes.status === 401 || applyRes.status === 403 || applyRes.body.result?.isError === true);

    // Verify module was NOT created in DB
    const modCount = db.prepare("SELECT COUNT(*) as count FROM modules WHERE title = 'Should never commit'").get() as any;
    assert.equal(modCount.count, 0);

    // Image mutation revocation check: revoked token aborts update_image before commit
    const imgTempTokenResult = tokenService.createToken(authorId, {
      password: authorPassword,
      label: 'Image Revocation Test Agent',
      scopes: TOKEN_SCOPE_PRESETS.full_course_control,
      expiryDays: 1,
    });
    tokenService.revokeToken(authorId, imgTempTokenResult.token.id);

    const imgRevokedRes = await callMcp(
      {
        jsonrpc: '2.0',
        id: 32,
        method: 'tools/call',
        params: {
          name: 'update_image',
          arguments: {
            asset_id: 'any-asset-id',
            expected_revision: state.testCourseRevision,
            idempotency_key: 'revoked-img-idemp',
            alt_text: 'Should not commit',
          },
        },
      },
      { Authorization: `Bearer ${imgTempTokenResult.rawToken}` }
    );
    assert.ok(imgRevokedRes.status === 401 || imgRevokedRes.status === 403 || imgRevokedRes.body.result?.isError === true);
  });

  // --------------------------------------------------------------------------
  // S3-06: Conflicting Idempotency Key Reuse
  // --------------------------------------------------------------------------
  await t.test('S3-06: Idempotency reuse with differing payload is rejected with Conflict', async () => {
    const key = 'shared-idemp-key-test';

    // 1. Initial batch_author call
    const firstCall = await callMcp({
      jsonrpc: '2.0',
      id: 40,
      method: 'tools/call',
      params: {
        name: 'batch_author',
        arguments: {
          course_id: state.testCourseId,
          base_revision: state.testCourseRevision,
          idempotency_key: key,
          operations: [
            {
              type: 'create_module',
              temp_id: 'mod_idemp',
              title: 'Module Idemp First',
            },
          ],
        },
      },
    });
    assert.equal(firstCall.status, 200);
    const firstData = JSON.parse(firstCall.body.result.content[0].text);
    state.testCourseRevision = firstData.draft_revision;

    // 2. Exactly matching call returns identical cached receipt
    const matchCall = await callMcp({
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: {
        name: 'batch_author',
        arguments: {
          course_id: state.testCourseId,
          base_revision: state.testCourseRevision - 1, // original base revision
          idempotency_key: key,
          operations: [
            {
              type: 'create_module',
              temp_id: 'mod_idemp',
              title: 'Module Idemp First',
            },
          ],
        },
      },
    });
    assert.equal(matchCall.status, 200);
    const matchData = JSON.parse(matchCall.body.result.content[0].text);
    assert.equal(matchData.draft_revision, firstData.draft_revision);

    // 3. Different payload with SAME idempotency key must reject
    const conflictCall = await callMcp({
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: {
        name: 'batch_author',
        arguments: {
          course_id: state.testCourseId,
          base_revision: state.testCourseRevision,
          idempotency_key: key,
          operations: [
            {
              type: 'create_module',
              temp_id: 'mod_idemp_different',
              title: 'Completely Different Operations',
            },
          ],
        },
      },
    });
    assert.equal(conflictCall.body.result.isError, true);
    assert.ok(conflictCall.body.result.content[0].text.includes('Idempotency key has already been used with different request parameters'));
  });
}
