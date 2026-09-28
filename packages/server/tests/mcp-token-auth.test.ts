import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';
import { McpTokenService } from '../src/services/mcp-token-service.ts';
import { McpAuthService } from '../src/services/mcp-auth-service.ts';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ScopeRequiredError,
  TOKEN_SCOPE_PRESETS,
} from 'zur-shared';

test('MCP Token Lifecycle and Authorization (T053–T054)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const tokenService = new McpTokenService(db);
  const authService = new McpAuthService(db);

  // Seeded author: Guido van Rossum (user-author-1)
  const authorId = 'user-author-1';
  // Seeded student: Ada Lovelace (user-student-1)
  const studentId = 'user-student-1';
  // Seeded course owned by Guido: course-python-foundations
  const guidoCourseId = 'course-python-foundations';
  // Author seed password
  const correctPassword = 'AuthorPass123!';

  let testTokenId = '';
  let testRawToken = '';

  await t.test('T053: Issue author token with valid password and author capability', () => {
    const result = tokenService.createToken(authorId, {
      password: correctPassword,
      label: 'Claude Desktop Agent',
      scopes: TOKEN_SCOPE_PRESETS.draft_authoring,
      courseRestrictions: [guidoCourseId],
      expiryDays: 30,
    });


    assert.ok(result.rawToken, 'Must return rawToken in creation response');
    assert.match(result.rawToken, /^zur_at_zat_[a-f0-9]+_[a-f0-9]+$/, 'Raw token must match format zur_at_<identifier>_<secret>');
    assert.equal(result.token.label, 'Claude Desktop Agent');
    assert.equal(result.token.authorId, authorId);
    assert.equal(result.token.isRevoked, false);
    assert.equal(result.token.status, 'never_used');
    assert.deepEqual(result.token.courseRestrictions, [guidoCourseId]);
    assert.deepEqual(result.token.scopes, TOKEN_SCOPE_PRESETS.draft_authoring);

    // Hash check: plaintext secret must NOT be in DB, only SHA-256 hash
    const row = db.prepare('SELECT token_hash, token_identifier FROM author_access_tokens WHERE id = ?').get(result.token.id) as any;
    assert.ok(row, 'Token must be stored in DB');
    assert.notEqual(row.token_hash, result.rawToken, 'DB must store hash, never plaintext');
    assert.equal(row.token_identifier, result.token.tokenIdentifier);

    testTokenId = result.token.id;
    testRawToken = result.rawToken;
  });

  await t.test('T053: Rejects issuance with invalid password', () => {
    assert.throws(
      () => {
        tokenService.createToken(authorId, {
          password: 'WrongPassword123!',
          label: 'Test Agent',
          scopes: ['courses:read'],
        });
      },
      (err: any) => err instanceof AuthenticationError && err.message.includes('Invalid password')
    );
  });

  await t.test('T053: Rejects issuance when user lacks author capability', () => {
    assert.throws(
      () => {
        tokenService.createToken(studentId, {
          password: 'StudentPass123!',
          label: 'Student Agent',
          scopes: ['courses:read'],
        });
      },
      (err: any) => err instanceof AuthorizationError && err.message.includes('Author capability is required')

    );
  });

  await t.test('T053: Rejects issuance when email is unverified', () => {
    db.prepare('UPDATE users SET email_verified = 0 WHERE id = ?').run(authorId);
    assert.throws(
      () => {
        tokenService.createToken(authorId, {
          password: correctPassword,
          label: 'Unverified Author Agent',
          scopes: ['courses:read'],
        });
      },
      (err: any) => err instanceof AuthorizationError && err.message.includes('Email verification is required')
    );
    // Restore email verified
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(authorId);
  });

  await t.test('T053: Rejects issuance when account is suspended', () => {
    db.prepare("UPDATE users SET account_status = 'suspended' WHERE id = ?").run(authorId);
    assert.throws(
      () => {
        tokenService.createToken(authorId, {
          password: correctPassword,
          label: 'Suspended Author Agent',
          scopes: ['courses:read'],
        });
      },
      (err: any) => err instanceof AuthorizationError && err.message.includes('Account must be active')
    );
    // Restore active status
    db.prepare("UPDATE users SET account_status = 'active' WHERE id = ?").run(authorId);
  });

  await t.test('T053: Enforces expiry range 1 to 90 days', () => {
    assert.throws(
      () => {
        tokenService.createToken(authorId, {
          password: correctPassword,
          label: 'Invalid Expiry Agent',
          scopes: ['courses:read'],
          expiryDays: 0,
        });
      },
      (err: any) => err instanceof ValidationError
    );

    assert.throws(
      () => {
        tokenService.createToken(authorId, {
          password: correctPassword,
          label: 'Invalid Expiry Agent',
          scopes: ['courses:read'],
          expiryDays: 91,
        });
      },
      (err: any) => err instanceof ValidationError
    );

    const valid = tokenService.createToken(authorId, {
      password: correctPassword,
      label: '7 Day Agent',
      scopes: ['courses:read'],
      expiryDays: 7,
    });
    assert.ok(valid.token.id);
  });

  await t.test('T053: Validates rawToken, updates last_used_at, and verifies payload', () => {
    const validated = tokenService.validateToken(testRawToken);
    assert.equal(validated.id, testTokenId);
    assert.equal(validated.authorId, authorId);
    assert.deepEqual(validated.scopes, TOKEN_SCOPE_PRESETS.draft_authoring);
    assert.deepEqual(validated.courseRestrictions, [guidoCourseId]);
    assert.ok(validated.lastUsedAt, 'lastUsedAt must be updated');

    const inDb = db.prepare('SELECT last_used_at FROM author_access_tokens WHERE id = ?').get(testTokenId) as any;
    assert.ok(inDb.last_used_at, 'Database last_used_at must be populated');
  });

  await t.test('T053: Lists tokens with masked secrets and correct status', () => {
    const tokens = tokenService.listTokens(authorId);
    assert.ok(tokens.length >= 2);

    const found = tokens.find((t) => t.id === testTokenId);
    assert.ok(found);
    assert.equal(found?.status, 'active');
    assert.equal((found as any).tokenHash, undefined, 'Must not expose tokenHash');
    assert.equal((found as any).rawToken, undefined, 'Must not expose rawToken');
  });

  await t.test('T053: Immediate revocation prevents subsequent validation', () => {
    tokenService.revokeToken(authorId, testTokenId);

    const row = db.prepare('SELECT is_revoked FROM author_access_tokens WHERE id = ?').get(testTokenId) as any;
    assert.equal(row.is_revoked, 1, 'Token must be marked revoked');

    assert.throws(
      () => {
        tokenService.validateToken(testRawToken);
      },
      (err: any) => err instanceof AuthenticationError && err.message.includes('revoked')
    );
  });

  await t.test('T053: Expired token fails validation', () => {
    const expiredRes = tokenService.createToken(authorId, {
      password: correctPassword,
      label: 'Soon Expired',
      scopes: ['courses:read'],
      expiryDays: 1,
    });

    // Artificially expire in DB
    db.prepare("UPDATE author_access_tokens SET expires_at = datetime('now', '-1 day') WHERE id = ?").run(expiredRes.token.id);

    assert.throws(
      () => {
        tokenService.validateToken(expiredRes.rawToken);
      },
      (err: any) => err instanceof AuthenticationError && err.message.includes('expired')
    );
  });

  await t.test('T053: Token replacement creates new token and revokes old', () => {
    const orig = tokenService.createToken(authorId, {
      password: correctPassword,
      label: 'Replaceable Token',
      scopes: ['courses:read', 'content:write'],
      expiryDays: 14,
    });

    // Cannot widen scopes on replacement
    assert.throws(
      () => {
        tokenService.replaceToken(authorId, orig.token.id, {
          password: correctPassword,
          scopes: ['courses:read', 'content:write', 'courses:publish'],
        });
      },
      (err: any) => err instanceof ValidationError && err.message.includes('cannot widen')
    );

    // Valid replacement with same or narrower scopes
    const replaced = tokenService.replaceToken(authorId, orig.token.id, {
      password: correctPassword,
      scopes: ['courses:read'],
      expiryDays: 30,
    });

    assert.ok(replaced.rawToken);
    assert.notEqual(replaced.token.id, orig.token.id);

    // Check old token is revoked and denied
    const oldRow = db.prepare('SELECT is_revoked FROM author_access_tokens WHERE id = ?').get(orig.token.id) as any;
    assert.equal(oldRow.is_revoked, 1);
    assert.throws(
      () => {
        tokenService.validateToken(orig.rawToken);
      },
      (err: any) => err instanceof AuthenticationError && err.message.includes('revoked')
    );

    // Reauthentication required: invalid password rejected
    assert.throws(
      () => {
        tokenService.replaceToken(authorId, replaced.token.id, {
          password: 'WrongPassword!',
        });
      },
      (err: any) => err instanceof AuthenticationError && err.message.includes('Invalid password')
    );

    // Cannot widen course restrictions on replacement
    const restrictedToken = tokenService.createToken(authorId, {
      password: correctPassword,
      label: 'Course-Restricted Token',
      scopes: ['courses:read', 'content:write'],
      courseRestrictions: [guidoCourseId],
    });

    // Cannot expand from specific courses to all courses (null)
    assert.throws(
      () => {
        tokenService.replaceToken(authorId, restrictedToken.token.id, {
          password: correctPassword,
          courseRestrictions: null,
        });
      },
      (err: any) => err instanceof ValidationError && err.message.includes('cannot widen course restrictions')
    );

    // Cannot add unassigned course IDs
    assert.throws(
      () => {
        tokenService.replaceToken(authorId, restrictedToken.token.id, {
          password: correctPassword,
          courseRestrictions: [guidoCourseId, 'non-existent-course'],
        });
      },
      (err: any) => err instanceof ValidationError && err.message.includes('cannot grant access to additional courses')
    );

    // Can replace already-revoked token
    const replacedFromRevoked = tokenService.replaceToken(authorId, orig.token.id, {
      password: correctPassword,
      label: 'Revived from Revoked',
    });
    assert.ok(replacedFromRevoked.rawToken);
    assert.equal(replacedFromRevoked.token.label, 'Revived from Revoked');

    // Can replace expired token
    const expToken = tokenService.createToken(authorId, {
      password: correctPassword,
      label: 'Expired Token To Replace',
      scopes: ['courses:read'],
      expiryDays: 1,
    });
    db.prepare("UPDATE author_access_tokens SET expires_at = datetime('now', '-2 days') WHERE id = ?").run(expToken.token.id);
    const replacedFromExpired = tokenService.replaceToken(authorId, expToken.token.id, {
      password: correctPassword,
      label: 'Replaced from Expired',
    });
    assert.ok(replacedFromExpired.rawToken);
    assert.equal(replacedFromExpired.token.status, 'never_used');
  });

  // T054: Scopes and course restrictions
  await t.test('T054: Enforces operation scopes and safe course permission checking', () => {
    const draftTokenRes = tokenService.createToken(authorId, {
      password: correctPassword,
      label: 'Draft Token',
      scopes: TOKEN_SCOPE_PRESETS.draft_authoring,
      courseRestrictions: [guidoCourseId],
    });

    const validated = tokenService.validateToken(draftTokenRes.rawToken);

    // 1. Permitted scope and course
    assert.doesNotThrow(() => {
      authService.verifyMcpPermission(validated, 'courses:read', guidoCourseId);
      authService.verifyMcpPermission(validated, 'content:write', guidoCourseId);
    });

    // 2. Missing scope: courses:publish is not in draft_authoring
    assert.throws(
      () => {
        authService.verifyMcpPermission(validated, 'courses:publish', guidoCourseId);
      },
      (err: any) => err instanceof ScopeRequiredError && err.code === 'SCOPE_REQUIRED'
    );

    // 3. Course not in restrictions
    assert.throws(
      () => {
        authService.verifyMcpPermission(validated, 'courses:read', 'some-other-course');
      },
      (err: any) => err instanceof AuthorizationError && err.message.includes('not in allowed course restrictions')
    );

    // 4. Safe denial on non-existent or unowned course: discloses no details
    const unownedCourseRes = tokenService.createToken(authorId, {
      password: correctPassword,
      label: 'All Owned Token',
      scopes: ['courses:read'],
      courseRestrictions: null, // all owned
    });
    const validatedAllOwned = tokenService.validateToken(unownedCourseRes.rawToken);

    assert.throws(
      () => {
        authService.verifyMcpPermission(validatedAllOwned, 'courses:read', 'non-existent-course-id');
      },
      (err: any) => err instanceof NotFoundError
    );
  });

  await t.test('T054: Allowlist created course appends new course ID', () => {
    const restrictedRes = tokenService.createToken(authorId, {
      password: correctPassword,
      label: 'Creator Agent',
      scopes: ['courses:read', 'courses:create', 'content:write'],
      courseRestrictions: [guidoCourseId],
    });

    const newCourseId = 'course-new-123';
    const updatedRestrictions = authService.allowlistCreatedCourse(restrictedRes.token.id, newCourseId);

    assert.ok(updatedRestrictions);
    assert.ok(updatedRestrictions.includes(newCourseId));
    assert.ok(updatedRestrictions.includes(guidoCourseId));

    const row = db.prepare('SELECT course_restrictions FROM author_access_tokens WHERE id = ?').get(restrictedRes.token.id) as any;
    const parsed = JSON.parse(row.course_restrictions);
    assert.ok(parsed.includes(newCourseId));
  });

  await t.test('T054: Self-expansion attempts are rejected', () => {
    const tokenRes = tokenService.createToken(authorId, {
      password: correctPassword,
      label: 'Limited Agent',
      scopes: ['courses:read'],
      courseRestrictions: [guidoCourseId],
    });

    const validated = tokenService.validateToken(tokenRes.rawToken);

    assert.throws(
      () => {
        authService.preventSelfExpansion(validated, ['courses:publish']);
      },
      (err: any) => err instanceof AuthorizationError && err.message.includes('cannot self-expand')
    );

    assert.throws(
      () => {
        authService.preventSelfExpansion(validated, undefined, ['unauthorized-course-id']);
      },
      (err: any) => err instanceof AuthorizationError && err.message.includes('cannot self-expand')
    );
  });

  // HTTP API Endpoints
  await t.test('T053: HTTP API endpoints for tokens (POST, GET, DELETE, REPLACE)', async () => {
    const server = createServer(db);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address() as any;
    const port = address.port;

    // Helper for requests
    async function request(options: http.RequestOptions, body?: any): Promise<{ status: number; body: any }> {
      return new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            ...options,
            headers: {
              'Content-Type': 'application/json',
              ...options.headers,
            },
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                resolve({ status: res.statusCode || 500, body: data ? JSON.parse(data) : null });
              } catch {
                resolve({ status: res.statusCode || 500, body: data });
              }
            });
          }
        );
        req.on('error', reject);
        if (body) {
          req.write(JSON.stringify(body));
        }
        req.end();
      });
    }

    try {
      // 1. Sign in as author to get session token
      const signInRes = await request(
        { method: 'POST', path: '/api/auth/sign-in' },
        { email: 'guido@zur.internal', password: correctPassword }
      );
      assert.equal(signInRes.status, 200);
      const sessionToken = signInRes.body.token;

      // 2. Create token via API
      const createRes = await request(
        {
          method: 'POST',
          path: '/api/author/tokens',
          headers: { Authorization: `Bearer ${sessionToken}` },
        },
        {
          password: correctPassword,
          label: 'API Test Agent',
          scopes: ['courses:read', 'content:write'],
          expiryDays: 30,
        }
      );
      assert.equal(createRes.status, 201);
      assert.ok(createRes.body.rawToken);
      assert.equal(createRes.body.token.label, 'API Test Agent');
      const apiTokenId = createRes.body.token.id;

      // 3. List tokens via API
      const listRes = await request({
        method: 'GET',
        path: '/api/author/tokens',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      assert.equal(listRes.status, 200);
      assert.ok(Array.isArray(listRes.body.tokens));
      const foundInList = listRes.body.tokens.find((t: any) => t.id === apiTokenId);
      assert.ok(foundInList);
      assert.equal(foundInList.rawToken, undefined);

      // 4. Get token details
      const getRes = await request({
        method: 'GET',
        path: `/api/author/tokens/${apiTokenId}`,
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      assert.equal(getRes.status, 200);
      assert.equal(getRes.body.id, apiTokenId);
      assert.equal(getRes.body.label, 'API Test Agent');

      // 5. Replace token via API
      const replaceRes = await request(
        {
          method: 'POST',
          path: `/api/author/tokens/${apiTokenId}/replace`,
          headers: { Authorization: `Bearer ${sessionToken}` },
        },
        {
          password: correctPassword,
          scopes: ['courses:read'],
          expiryDays: 14,
        }
      );
      assert.equal(replaceRes.status, 201);
      assert.ok(replaceRes.body.rawToken);
      const replacedId = replaceRes.body.token.id;

      // 6. Delete (revoke) replaced token
      const deleteRes = await request({
        method: 'DELETE',
        path: `/api/author/tokens/${replacedId}`,
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      assert.equal(deleteRes.status, 200);
      assert.equal(deleteRes.body.success, true);

      // Verify it's revoked
      const afterDelete = await request({
        method: 'GET',
        path: `/api/author/tokens/${replacedId}`,
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      assert.equal(afterDelete.body.isRevoked, true);
      assert.equal(afterDelete.body.status, 'revoked');
    } finally {
      server.close();
    }
  });
});
