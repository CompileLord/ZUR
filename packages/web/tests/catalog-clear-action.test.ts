import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCatalogPage } from '../src/pages/public/CatalogPage.ts';

const count = (html: string) => (html.match(/data-action="clear-filters"/g) || []).length;
const course = { id: 'c1', title: 'Python', description: 'd', authorName: 'a', difficulty: 'beginner', language: 'en', estimatedDurationMinutes: 30 };

test('a search with no matches offers one way to clear filters, not two', () => {
  const html = renderCatalogPage({ courses: [], categories: [], total: 0, isLoading: false, filters: { q: 'zzz' } });
  const visible = html.replace(/<div[^>]*id="mobile-filter-sheet"[\s\S]*$/, '');
  assert.equal(count(visible), 1);
});

test('a search with results keeps Clear all beside the active filter chips', () => {
  const html = renderCatalogPage({ courses: [course], categories: [], total: 1, isLoading: false, filters: { q: 'py' } });
  assert.match(html, /Clear all<\/button>\s*<\/div>/);
});
