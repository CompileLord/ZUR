import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAuthorCoursesPage } from '../src/pages/author/AuthorCoursesPage.ts';

const user = (capabilities: string[]) => ({ id: 'u-1', displayName: 'Margaret', email: 'm@zur.internal', capabilities });

// The server only lets accounts with author capability create courses, so the page must not offer it to anyone else.
test('an administrator without author capability is told to request access instead of offered course creation', () => {
  const html = renderAuthorCoursesPage({ user: user(['student', 'admin']), courses: [] } as any);
  assert.match(html, /Author Access Required/);
});

test('an author sees their courses page', () => {
  const html = renderAuthorCoursesPage({ user: user(['student', 'author']), courses: [] } as any);
  assert.doesNotMatch(html, /Author Access Required/);
});
