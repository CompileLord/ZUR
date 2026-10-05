import assert from 'node:assert/strict';
import test from 'node:test';
import { ProfileGuard } from '../src/services/profile-guard.ts';

test('ProfileGuard is clean initially and dirty only on distinct non-empty input', () => {
  const guard = new ProfileGuard('Ada Lovelace');
  assert.equal(guard.isDirty('Ada Lovelace'), false);
  assert.equal(guard.isDirty('  Ada Lovelace  '), false);
  assert.equal(guard.isDirty(''), false, 'Empty string is not valid dirty submission');
  assert.equal(guard.isDirty('Ada Byron'), true);
  assert.equal(guard.shouldBlockNavigation('Ada Byron'), true);
  assert.equal(guard.getNavigationPrompt('Ada Byron'), 'You have unsaved changes. Leave this page?');
});

test('ProfileGuard guards remain active across failed saves', () => {
  const guard = new ProfileGuard('Ada Lovelace');
  const dirtyValue = 'Augusta Ada King';

  assert.equal(guard.startSave(dirtyValue), true);
  assert.equal(guard.isSaving, true);
  assert.equal(guard.getNavigationPrompt(dirtyValue), 'Profile changes are being saved. Leave this page?');

  // Simulate network/server error
  guard.markSaveFailure();

  // Guards must still be fully active!
  assert.equal(guard.isSaving, false);
  assert.equal(guard.initialDisplayName, 'Ada Lovelace');
  assert.equal(guard.isDirty(dirtyValue), true);
  assert.equal(guard.shouldBlockNavigation(dirtyValue), true);
  assert.equal(guard.getNavigationPrompt(dirtyValue), 'You have unsaved changes. Leave this page?');
});

test('ProfileGuard clears dirty state only after confirmed success', () => {
  const guard = new ProfileGuard('Ada Lovelace');
  const newName = 'Ada King';

  assert.equal(guard.startSave(newName), true);
  guard.markSaveSuccess(newName);

  assert.equal(guard.isSaving, false);
  assert.equal(guard.initialDisplayName, 'Ada King');
  assert.equal(guard.isDirty(newName), false);
  assert.equal(guard.shouldBlockNavigation(newName), false);
  assert.equal(guard.getNavigationPrompt(newName), null);
});

test('ProfileGuard prevents duplicate saves while save is in flight', () => {
  const guard = new ProfileGuard('Ada Lovelace');
  const newName = 'Ada Byron';

  assert.equal(guard.startSave(newName), true);
  // Attempting concurrent submission must be blocked
  assert.equal(guard.startSave(newName), false);
  assert.equal(guard.startSave('Another Name'), false);
});
