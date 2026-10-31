import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { demoSeedBlockedReason } from '../src/db/demo-guard.ts';
import { IdentityService } from '../src/services/identity-service.ts';
import { AdminService } from '../src/services/admin-service.ts';
import { CourseService, clearVersionCountsCache, versionCountsCacheSize, VERSION_COUNTS_CACHE_MAX, computeSnapshotCounts } from '../src/services/course-service.ts';
import { ExecutionService, startStuckJobRecovery } from '../src/services/execution-service.ts';
import { hashPassword, hashPasswordAsync, verifyPassword, verifyPasswordAsync, needsRehash } from '../src/services/password-service.ts';
import { RateLimitError, AuthenticationError, ValidationError } from 'zur-shared';

const db = getDatabase(':memory:');
runMigrations(':memory:');
seedDatabase(':memory:');
const identity = new IdentityService(db);

function userId(email: string): string {
  return (db.prepare('SELECT id FROM users WHERE email=?').get(email) as any).id;
}
function signIn(email: string, password: string, ip: string) {
  return identity.signIn({ email, password, ipAddress: ip });
}

test('password hashing (item 3)', async (t) => {
  await t.test('new hashes are scrypt N=2^15 with explicit params and verify', async () => {
    const h = hashPassword('Correct-Horse-1');
    assert.match(h, /^scrypt\$N=32768,r=8,p=1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    assert.equal(verifyPassword('Correct-Horse-1', h), true);
    assert.equal(verifyPassword('wrong', h), false);
    assert.equal(needsRehash(h), false);
    const a = await hashPasswordAsync('Correct-Horse-1');
    assert.equal(await verifyPasswordAsync('Correct-Horse-1', a), true);
    assert.equal(await verifyPasswordAsync('nope', a), false);
    assert.equal(verifyPassword('Correct-Horse-1', a), true, 'sync verifies async hash');
  });
  await t.test('old N=16384 scrypt hashes still verify and are flagged for rehash', () => {
    const salt = crypto.randomBytes(16).toString('hex');
    const key = crypto.scryptSync('OldPass123!', salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
    const old = `scrypt$N=16384,r=8,p=1$${salt}$${key.toString('hex')}`;
    assert.equal(verifyPassword('OldPass123!', old), true);
    assert.equal(verifyPassword('x', old), false);
    assert.equal(needsRehash(old), true);
  });
  await t.test('malicious parameters in a stored hash are rejected, not executed', () => {
    const huge = `scrypt$N=${2 ** 30},r=8,p=1$aa$${'0'.repeat(128)}`;
    assert.equal(verifyPassword('x', huge), false);
    assert.equal(verifyPassword('x', `scrypt$N=3,r=8,p=1$aa$${'0'.repeat(128)}`), false);
  });
  await t.test('legacy SHA-256 verifies only for upgrade; upgrade-on-login rehashes to scrypt', () => {
    const legacy = crypto.createHash('sha256').update('LegacyPass123!').digest('hex');
    assert.equal(verifyPassword('LegacyPass123!', legacy), true);
    assert.equal(needsRehash(legacy), true);
    db.prepare(`INSERT INTO users (id,email,password_hash,display_name,email_verified,capabilities,account_status)
      VALUES ('u-legacy','legacy@zur.internal',?,'Legacy',1,'["student"]','active')`).run(legacy);
    signIn('legacy@zur.internal', 'LegacyPass123!', '10.0.0.1');
    const after = (db.prepare("SELECT password_hash h FROM users WHERE id='u-legacy'").get() as any).h as string;
    assert.match(after, /^scrypt\$N=32768,r=8,p=1\$/);
    assert.equal(verifyPassword('LegacyPass123!', after), true);
    assert.equal(hashPassword('LegacyPass123!').startsWith('scrypt$'), true, 'never produces legacy form');
  });
  await t.test('seed fixtures are salted scrypt, not SHA-256', () => {
    const h = (db.prepare("SELECT password_hash h FROM users WHERE email='ada@zur.internal'").get() as any).h as string;
    assert.match(h, /^scrypt\$/);
  });
});

test('sign-in limiter counts failures only (item 1)', async (t) => {
  await t.test('victim cannot be locked out by successful attempts or by attacker from another IP', () => {
    for (let i = 0; i < 30; i++) signIn('ada@zur.internal', 'StudentPass123!', `10.1.0.${i % 5}`);
    // attacker (IP A) burns the strict pair limit on the victim email
    for (let i = 0; i < 5; i++) {
      assert.throws(() => signIn('ada@zur.internal', 'bad', '203.0.113.9'), AuthenticationError);
    }
    assert.throws(() => signIn('ada@zur.internal', 'bad', '203.0.113.9'), RateLimitError);
    assert.throws(() => signIn('ada@zur.internal', 'StudentPass123!', '203.0.113.9'), RateLimitError, 'attacker IP blocked');
    // the real user from their own IP still signs in
    const s = signIn('ada@zur.internal', 'StudentPass123!', '198.51.100.7');
    assert.ok(s.token);
  });
  await t.test('success resets the failure counter', () => {
    for (let i = 0; i < 4; i++) assert.throws(() => signIn('guido@zur.internal', 'bad', '192.0.2.1'), AuthenticationError);
    signIn('guido@zur.internal', 'AuthorPass123!', '192.0.2.1');
    for (let i = 0; i < 4; i++) assert.throws(() => signIn('guido@zur.internal', 'bad', '192.0.2.1'), AuthenticationError);
  });
  await t.test('unknown email also counts failures (no enumeration via limiter)', () => {
    for (let i = 0; i < 5; i++) assert.throws(() => signIn('nobody@zur.internal', 'x', '192.0.2.2'), AuthenticationError);
    assert.throws(() => signIn('nobody@zur.internal', 'x', '192.0.2.2'), RateLimitError);
  });
  await t.test('pruning: expired durable rows removed, timer unref\'d', () => {
    const old = Date.now() - 48 * 3600 * 1000;
    db.prepare(`INSERT INTO auth_request_limits (key_hash,attempts,window_started_at,last_attempt_at) VALUES ('stale',3,?,?)`).run(old, old);
    identity.pruneRateLimits();
    assert.equal(db.prepare("SELECT COUNT(*) c FROM auth_request_limits WHERE key_hash='stale'").get()!.c, 0);
    identity.dispose();
  });
});

test('changePassword and reset (item 2)', async (t) => {
  const id = userId('ada@zur.internal');
  await t.test('revokes other sessions, keeps current, audits, rate limits wrong current passwords', () => {
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    const a = signIn('ada@zur.internal', 'StudentPass123!', '198.51.100.20');
    const b = signIn('ada@zur.internal', 'StudentPass123!', '198.51.100.21');
    for (let i = 0; i < 5; i++) assert.throws(() => identity.changePassword(id, 'wrong', 'NewPassword123!', a.sessionId), ValidationError);
    assert.throws(() => identity.changePassword(id, 'wrong', 'NewPassword123!', a.sessionId), RateLimitError);
    assert.throws(() => identity.changePassword(id, 'StudentPass123!', 'NewPassword123!', a.sessionId), RateLimitError, 'limit applies even to the right password while locked');
    db.prepare("DELETE FROM auth_request_limits").run();
    assert.equal(identity.changePassword(id, 'StudentPass123!', 'NewPassword123!', a.sessionId), true);
    assert.doesNotThrow(() => identity.authenticateSession(a.token));
    assert.throws(() => identity.authenticateSession(b.token), AuthenticationError);
    const ev = db.prepare("SELECT * FROM audit_events WHERE action='password_changed' AND actor_id=?").get(id) as any;
    assert.ok(ev);
    assert.ok(!JSON.stringify(ev).includes('NewPassword123'));
    assert.equal(verifyPassword('NewPassword123!', (db.prepare('SELECT password_hash h FROM users WHERE id=?').get(id) as any).h), true);
    identity.changePassword(id, 'NewPassword123!', 'StudentPass123!', a.sessionId);
  });
  await t.test('without keepSessionId every session is revoked (secure default)', () => {
    const s = signIn('ada@zur.internal', 'StudentPass123!', '198.51.100.30');
    identity.changePassword(id, 'StudentPass123!', 'StudentPass123!', undefined);
    assert.throws(() => identity.authenticateSession(s.token), AuthenticationError);
  });
  await t.test('password reset completion revokes all sessions and audits', () => {
    const s = signIn('ada@zur.internal', 'StudentPass123!', '198.51.100.31');
    const { resetToken } = identity.requestPasswordReset('ada@zur.internal');
    identity.resetPassword(resetToken!, 'StudentPass123!');
    assert.throws(() => identity.authenticateSession(s.token), AuthenticationError);
    assert.ok(db.prepare("SELECT 1 FROM audit_events WHERE action='password_reset_completed' AND target_id=?").get(id));
  });
});

test('privacy re-auth is optional and env-gated (item 7)', async (t) => {
  const id = userId('ada@zur.internal');
  await t.test('default off: no password needed', () => {
    delete process.env.ZUR_REQUIRE_REAUTH_FOR_PRIVACY;
    assert.ok(identity.requestDataExport(id).requestId);
  });
  await t.test('on: password required for export and deletion', () => {
    process.env.ZUR_REQUIRE_REAUTH_FOR_PRIVACY = '1';
    try {
      assert.throws(() => identity.requestDataExport(id), ValidationError);
      assert.throws(() => identity.requestDataExport(id, 'wrong'), ValidationError);
      assert.ok(identity.requestDataExport(id, 'StudentPass123!').requestId);
      assert.throws(() => identity.requestAccountDeletion(id, true), ValidationError);
      assert.throws(() => identity.requestAccountDeletion(id, true, 'wrong'), ValidationError);
      assert.equal(db.prepare('SELECT account_status s FROM users WHERE id=?').get(id)!.s, 'active');
      assert.equal(identity.requestAccountDeletion(id, true, 'StudentPass123!').success, true);
    } finally { delete process.env.ZUR_REQUIRE_REAUTH_FOR_PRIVACY; }
  });
});

test('catalog counts cache (item 4)', async (t) => {
  const courses = new CourseService(db);
  await t.test('counts are correct, cached by version id, LRU bounded', () => {
    clearVersionCountsCache();
    const first = courses.listPublicCatalog({} as any);
    assert.ok(first.courses.length > 0);
    const size = versionCountsCacheSize();
    assert.ok(size > 0 && size <= VERSION_COUNTS_CACHE_MAX);
    for (const c of first.courses) {
      const snap = (db.prepare('SELECT snapshot_data d FROM course_versions WHERE id=(SELECT current_version_id FROM courses WHERE id=?)').get(c.id) as any).d;
      assert.deepEqual({ lessonCount: c.lessonCount, stepCount: c.stepCount }, computeSnapshotCounts(snap));
    }
    const second = courses.listPublicCatalog({} as any);
    assert.deepEqual(second.courses.map((c: any) => [c.id, c.lessonCount, c.stepCount]), first.courses.map((c: any) => [c.id, c.lessonCount, c.stepCount]));
    assert.equal(versionCountsCacheSize(), size);
  });
  await t.test('a new version has a new id so the cache needs no invalidation', () => {
    const c = courses.listPublicCatalog({} as any).courses[0];
    const cur = db.prepare('SELECT * FROM course_versions WHERE id=(SELECT current_version_id FROM courses WHERE id=?)').get(c.id) as any;
    const snap = JSON.parse(cur.snapshot_data);
    snap.modules[0].lessons.push({ id: 'extra', title: 'Extra', steps: [{ id: 'x1' }, { id: 'x2' }] });
    const newId = `ver-${crypto.randomUUID()}`;
    const cols = Object.keys(cur);
    db.prepare(`INSERT INTO course_versions (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(...cols.map((k) => k === 'id' ? newId : k === 'version_number' ? cur.version_number + 100 : k === 'snapshot_data' ? JSON.stringify(snap) : cur[k]));
    db.prepare('UPDATE courses SET current_version_id=? WHERE id=?').run(newId, c.id);
    const after = courses.listPublicCatalog({} as any).courses.find((x: any) => x.id === c.id)!;
    assert.equal(after.lessonCount, c.lessonCount + 1);
    assert.equal(after.stepCount, c.stepCount + 2);
    db.prepare('UPDATE courses SET current_version_id=? WHERE id=?').run(cur.id, c.id);
  });
  await t.test('malformed snapshot yields zero counts', () => {
    assert.deepEqual(computeSnapshotCounts('{not json'), { lessonCount: 0, stepCount: 0 });
    assert.deepEqual(computeSnapshotCounts(null), { lessonCount: 0, stepCount: 0 });
  });
});

test('admin listMedia reference counts identical to previous algorithm (item 4)', () => {
  const admin = new AdminService(db);
  const adminId = userId('margaret@zur.internal');
  const ver = db.prepare('SELECT course_id, snapshot_data FROM course_versions LIMIT 1').get() as any;
  const author = userId('guido@zur.internal');
  const mk = (id: string) => db.prepare(`INSERT INTO media_assets (id,course_id,uploader_id,file_path,file_size,mime_type,processing_status)
    VALUES (?,?,?,'/nonexistent',10,'image/png','ready')`).run(id, ver.course_id, author);
  mk('asset-referenced-zzz'); mk('asset-unreferenced-qqq');
  db.prepare('UPDATE course_versions SET snapshot_data=? WHERE course_id=? AND id=(SELECT id FROM course_versions WHERE course_id=? LIMIT 1)')
    .run(String(ver.snapshot_data) + ' asset-referenced-zzz', ver.course_id, ver.course_id);
  const result = admin.listMedia(adminId, 20, 0);
  for (const item of result.items) {
    const old = (db.prepare('SELECT snapshot_data FROM course_versions WHERE course_id=?').all(item.courseId) as any[])
      .filter((v) => String(v.snapshot_data).includes(item.id)).length
      + (db.prepare(`SELECT COUNT(*) count FROM step_contents sc JOIN steps s ON s.id=sc.step_id JOIN lessons l ON l.id=s.lesson_id JOIN modules m ON m.id=l.module_id WHERE m.course_id=? AND sc.content_payload LIKE ?`).get(item.courseId, `%${item.id}%`) as any).count;
    assert.equal(item.referenceCount, old, item.id);
  }
  assert.equal(result.items.find((i: any) => i.id === 'asset-referenced-zzz')!.referenceCount >= 1, true);
  assert.equal(result.items.find((i: any) => i.id === 'asset-unreferenced-qqq')!.referenceCount, 0);
});

test('demo/seed guard (item 6)', () => {
  assert.ok(demoSeedBlockedReason({ NODE_ENV: 'production' } as any));
  assert.equal(demoSeedBlockedReason({ NODE_ENV: 'production', ZUR_ALLOW_DEMO_SEED: '1' } as any), null);
  assert.equal(demoSeedBlockedReason({ NODE_ENV: 'development' } as any), null);
  assert.equal(demoSeedBlockedReason({} as any), null);
});

test('stuck job recovery is callable without a worker (item 5)', async () => {
  const exec = new ExecutionService(db);
  assert.equal(typeof exec.recoverStuckJobsSafe(), 'number');
  const stop = startStuckJobRecovery(exec, 20);
  await new Promise((r) => setTimeout(r, 70));
  stop();
  const broken = new ExecutionService({ exec() { throw new Error('SQLITE_BUSY'); } } as any);
  const original = console.error; console.error = () => {};
  try { assert.equal(broken.recoverStuckJobsSafe(), -1); } finally { console.error = original; }
});
