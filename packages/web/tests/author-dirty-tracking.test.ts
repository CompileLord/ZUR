import test from 'node:test';
import assert from 'node:assert/strict';
import { markAuthorShellDirty } from '../src/services/author-dirty.ts';
import { renderAuthorWorkspaceShell } from '../src/components/shells/AuthorWorkspaceShell.ts';
import { renderTheoryEditorPage } from '../src/pages/author/TheoryEditorPage.ts';

function fakeShell(buttonText: string) {
  const classes = new Set<string>();
  const button = { textContent: buttonText };
  const shell = {
    classList: { add: (c: string) => classes.add(c) },
    querySelector: (selector: string) => (selector === '.author-header-right > button.btn-primary' ? button : null),
  };
  const target = { closest: (selector: string) => (selector === '.shell-author' ? shell : null) };
  return { classes, button, target };
}

test('Editing inside the author shell marks it dirty and turns Saved back into Save changes', () => {
  const { classes, button, target } = fakeShell('Saved');
  assert.equal(markAuthorShellDirty(target as any), true);
  assert.ok(classes.has('is-dirty'));
  assert.equal(button.textContent, 'Save changes');
});

test('Other button labels are left alone and targets outside the shell are ignored', () => {
  const { button, target } = fakeShell('Publish');
  markAuthorShellDirty(target as any);
  assert.equal(button.textContent, 'Publish');
  assert.equal(markAuthorShellDirty({ closest: () => null } as any), false);
  assert.equal(markAuthorShellDirty(null), false);
});

test('Author shell and theory editor emit no inline event handler attributes', () => {
  const shell = renderAuthorWorkspaceShell({
    courseId: 'c-test', courseTitle: 'Python Foundations', publicationState: 'published',
    hasUnpublishedChanges: false, activeTab: 'content', editorContent: '<div>Editor</div>',
  });
  assert.ok(shell.includes('class="shell-author"'));
  assert.doesNotMatch(shell, /\son[a-z]+=/i);
  const theory = renderTheoryEditorPage({
    courseId: 'c-test', courseTitle: 'Python Foundations', publicationState: 'draft', hasUnpublishedChanges: false,
    stepId: 's-1', stepTitle: 'Intro', markdown: 'Hello', revision: 1, isRequired: true, estimatedDurationMinutes: 5,
  });
  assert.ok(theory.includes('id="step-title-input"'));
  assert.doesNotMatch(theory, /\son[a-z]+=/i);
});
