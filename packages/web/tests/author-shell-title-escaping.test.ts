import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAuthorWorkspaceShell } from '../src/components/shells/AuthorWorkspaceShell.ts';

const shell = (courseTitle: string) => renderAuthorWorkspaceShell({
  courseId: 'c-1', courseTitle, publicationState: 'draft', hasUnpublishedChanges: false, activeTab: 'students',
  editorContent: '<div>Roster</div>',
});

test('author shell never renders an author-controlled course title as markup', () => {
  const html = shell('<img src=x onerror="alert(1)">');
  assert.equal(/<img/i.test(html), false);
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
});

test('a title that callers already escaped is not escaped twice', () => {
  const html = shell('Q&amp;A &lt;basics&gt;');
  assert.ok(html.includes('>Q&amp;A &lt;basics&gt;<'), 'shown as "Q&A <basics>"');
  assert.equal(html.includes('&amp;amp;'), false);
});

test('author tree escapes module, lesson and step titles', async () => {
  const { renderAuthorTree } = await import('../src/pages/author/AuthorTreeComponent.ts');
  const payload = '<img src=x onerror=alert(1)>';
  const html = renderAuthorTree({
    courseId: 'c-1', courseTitle: payload,
    modules: [{ id: 'm1', title: payload, position: 0, lessons: [{ id: 'l1', title: payload, position: 0, steps: [{ id: 's1', title: payload, type: 'theory', position: 0 }] }] }] as any,
  });
  assert.equal(/<img/i.test(html), false);
});
