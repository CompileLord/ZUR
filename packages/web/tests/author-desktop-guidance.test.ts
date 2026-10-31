import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAuthorWorkspaceShell } from '../src/components/shells/AuthorWorkspaceShell.ts';

const base = { courseId: 'c1', courseTitle: 'Course', publicationState: 'draft' as const, hasUnpublishedChanges: false, editorContent: '<p>editor</p>' };

// design.md: below 1024px full authoring shows desktop guidance; roster and analytics stay readable.
test('content editing carries desktop guidance that links to the tabs usable on small screens', () => {
  const html = renderAuthorWorkspaceShell({ ...base, activeTab: 'content', modules: [] });
  const note = html.match(/<div class="author-desktop-guidance" role="note">[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(note, /1024/);
  assert.match(note, /href="\/teach\/c1\/students"/);
  assert.match(note, /href="\/teach\/c1\/analytics"/);
});

test('students and analytics tabs have no desktop guidance', () => {
  for (const activeTab of ['students', 'analytics'] as const) {
    assert.doesNotMatch(renderAuthorWorkspaceShell({ ...base, activeTab }), /author-desktop-guidance/);
  }
});
