import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSaveConflict } from '../src/pages/author/SaveConflict.ts';

// A 409 must leave the author a way forward: take the other save, or keep their own edits.
test('a save conflict offers loading the other version or keeping mine', () => {
  const html = renderSaveConflict();
  assert.match(html, /<button[^>]*data-conflict-action="reload"[^>]*>Load the saved version<\/button>/);
  assert.match(html, /<button[^>]*data-conflict-action="overwrite"[^>]*>Keep my changes<\/button>/);
  assert.match(html, /saved in another tab or session/);
});
