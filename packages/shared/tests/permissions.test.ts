import test from 'node:test';
import assert from 'node:assert';
import {
  hasCapability,
  isCourseOwner,
  canAccessCourseContent,
  hasTokenScope,
  isCoursePermittedForToken,
  TOKEN_SCOPE_PRESETS,
} from '../src/permissions.ts';

test('Authorization and capability checks', async (t) => {
  await t.test('Active student capability', () => {
    assert.strictEqual(hasCapability({ userId: 'u1', capabilities: ['student'] }, 'student'), true);
    assert.strictEqual(hasCapability({ userId: 'u1', capabilities: ['student'] }, 'author'), false);
  });

  await t.test('Suspended account has no capabilities', () => {
    assert.strictEqual(
      hasCapability({ userId: 'u1', capabilities: ['student', 'author'], isSuspended: true }, 'author'),
      false
    );
  });

  await t.test('Course ownership check', () => {
    assert.strictEqual(isCourseOwner({ userId: 'author-1', capabilities: ['author'] }, 'author-1'), true);
    assert.strictEqual(isCourseOwner({ userId: 'author-2', capabilities: ['author'] }, 'author-1'), false);
  });

  await t.test('Course content access rules', () => {
    const publicCourse = { ownerId: 'owner-1', visibility: 'public', isSuspended: false };
    const suspendedCourse = { ownerId: 'owner-1', visibility: 'public', isSuspended: true };

    // Enrolled student in normal course -> true
    assert.strictEqual(canAccessCourseContent({ userId: 's1', capabilities: ['student'] }, publicCourse, true), true);

    // Unenrolled student -> false
    assert.strictEqual(canAccessCourseContent({ userId: 's2', capabilities: ['student'] }, publicCourse, false), false);

    // Course owner -> true even unenrolled
    assert.strictEqual(canAccessCourseContent({ userId: 'owner-1', capabilities: ['author'] }, publicCourse, false), true);

    // Suspended course -> false for student & owner, true only for admin
    assert.strictEqual(canAccessCourseContent({ userId: 's1', capabilities: ['student'] }, suspendedCourse, true), false);
    assert.strictEqual(canAccessCourseContent({ userId: 'admin', capabilities: ['admin'] }, suspendedCourse, false), true);
  });

  await t.test('MCP Token scope presets', () => {
    assert.deepStrictEqual(TOKEN_SCOPE_PRESETS.read_only, ['courses:read']);
    assert.strictEqual(hasTokenScope(TOKEN_SCOPE_PRESETS.draft_authoring, 'content:write'), true);
    assert.strictEqual(hasTokenScope(TOKEN_SCOPE_PRESETS.draft_authoring, 'courses:publish'), false);
    assert.strictEqual(hasTokenScope(TOKEN_SCOPE_PRESETS.full_course_control, 'courses:publish'), true);
  });

  await t.test('MCP Token course restrictions', () => {
    assert.strictEqual(isCoursePermittedForToken(null, 'c-1'), true); // all courses
    assert.strictEqual(isCoursePermittedForToken(['c-1', 'c-2'], 'c-1'), true);
    assert.strictEqual(isCoursePermittedForToken(['c-1', 'c-2'], 'c-3'), false);
  });
});
