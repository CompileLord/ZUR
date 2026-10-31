import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLandingPage } from '../src/pages/public/LandingPage.ts';
import { renderCatalogPage } from '../src/pages/public/CatalogPage.ts';

test('Public Landing Page P01 (T069)', async (t) => {
  await t.test('renders headline, value props, and Read-Try-Check progression rail', () => {
    const html = renderLandingPage({ isSignedIn: false });

    // Headline and subheadline (design.md P01)
    assert.ok(html.includes('Understand it.'));
    assert.ok(html.includes('Then write it.'));
    assert.ok(html.includes('Learn Python through short lessons and real exercises.'));

    // Accurate example workspace fragment
    assert.ok(html.includes('workspace-fragment'));
    assert.ok(html.includes('Python 3.14.7'));
    assert.ok(html.includes('solution.py'));
    assert.ok(html.includes('calculate_squares'));
    assert.ok(html.includes('Calculate squares of numbers'));
    assert.ok(html.includes('Sample output:'));

    // Read-Try-Check 3-column progression with lesson rail markers
    assert.ok(html.includes('Read'));
    assert.ok(html.includes('Try'));
    assert.ok(html.includes('Check'));
    assert.ok(html.includes('Focused concept explanations'));
    assert.ok(html.includes('Write real Python code directly in the browser.'));
    assert.ok(html.includes('Instant automated feedback against public test cases'));

    // Teaching section with course outline sample
    assert.ok(html.includes('Teach with practice beside explanation'));
    assert.ok(html.includes('Python foundations'));
    assert.ok(html.includes('Variables and Types'));
    assert.ok(html.includes('Echoing Numbers'));
  });

  await t.test('adapts primary CTA dynamically based on authentication state', () => {
    const signedOutHtml = renderLandingPage({ isSignedIn: false });
    assert.ok(signedOutHtml.includes('Browse Python courses'));
    assert.ok(signedOutHtml.includes('href="/courses"'));

    const signedInHtml = renderLandingPage({ isSignedIn: true });
    assert.ok(signedInHtml.includes('Continue learning'));
    assert.ok(signedInHtml.includes('href="/learn"'));
  });
});

test('Public Course Catalog Page P02 (T070)', async (t) => {
  const sampleCourses = [
    {
      id: 'course-py-101',
      title: 'Python Foundations',
      description: 'Master naming, values, and core loops in Python.',
      authorName: 'Guido van Rossum',
      difficulty: 'beginner',
      language: 'en',
      estimatedDurationMinutes: 120,
    },
    {
      id: 'course-py-201',
      title: 'Intermediate Data Structures',
      description: 'Deep dive into lists, dictionaries, and memory layouts.',
      authorName: 'Ada Lovelace',
      difficulty: 'intermediate',
      language: 'en',
      estimatedDurationMinutes: 180,
    },
  ];

  const sampleCategories = [
    { id: 'cat-core', name: 'Core Python', slug: 'core-python' },
    { id: 'cat-web', name: 'Web Backend', slug: 'web-backend' },
  ];

  await t.test('renders course list, search input, filter controls, and pagination', () => {
    const html = renderCatalogPage({
      courses: sampleCourses,
      categories: sampleCategories,
      total: 2,
      isLoading: false,
      filters: { page: 1, limit: 12 },
    });

    assert.ok(html.includes('Explore courses'));
    assert.ok(html.includes('id="catalog-search-input"'));
    assert.ok(html.includes('Python Foundations'));
    assert.ok(html.includes('Intermediate Data Structures'));
    assert.ok(html.includes('Guido van Rossum'));
    assert.ok(html.includes('Ada Lovelace'));
    assert.ok(html.includes('Beginner'));
    assert.ok(html.includes('120 mins'));
    assert.ok(html.includes('2 courses found'));

    // Category options in desktop and mobile selectors
    assert.ok(html.includes('Core Python'));
    assert.ok(html.includes('Web Backend'));

    // Mobile filter sheet dialog
    assert.ok(html.includes('id="mobile-filter-sheet"'));
    assert.ok(html.includes('role="dialog"'));
    assert.ok(html.includes('aria-modal="true"'));
  });

  await t.test('offers actual published languages in desktop and mobile filters and preserves URL selection (T070, P02)', () => {
    const multiLangCourses = [
      ...sampleCourses,
      {
        id: 'c3',
        title: 'Fundamentos de Python',
        description: 'Curso en español',
        difficulty: 'beginner',
        language: 'es',
        estimatedDurationMinutes: 90,
        authorName: 'Ada Lovelace',
        tags: ['python', 'spanish'],
      },
    ];

    // Case 1: unselected language (All languages default)
    const htmlUnselected = renderCatalogPage({
      courses: multiLangCourses,
      categories: sampleCategories,
      languages: ['en', 'es'],
      total: 3,
      isLoading: false,
      filters: { page: 1, limit: 12 },
    });

    assert.ok(htmlUnselected.includes('value="en"'));
    assert.ok(htmlUnselected.includes('value="es"'));
    assert.ok(htmlUnselected.includes('English'));
    assert.ok(htmlUnselected.includes('Spanish'));
    assert.ok(htmlUnselected.includes('id="filter-language"'));
    assert.ok(htmlUnselected.includes('id="mobile-filter-language"'));

    // Case 2: selected language 'es' preserved in URL and selected in both dropdowns
    const htmlSelected = renderCatalogPage({
      courses: [multiLangCourses[2]],
      categories: sampleCategories,
      languages: ['en', 'es'],
      total: 1,
      isLoading: false,
      filters: { language: 'es', page: 1, limit: 12 },
    });

    const selectedEsMatches = htmlSelected.match(/<option value="es" selected>Spanish<\/option>/g) || [];
    assert.strictEqual(selectedEsMatches.length, 2, 'Both desktop and mobile selectors must have Spanish option selected');
    assert.ok(htmlSelected.includes('Fundamentos de Python'));
    assert.ok(htmlSelected.includes('Clear filters'));
  });

  await t.test('renders loading skeleton when isLoading is true', () => {
    const html = renderCatalogPage({
      isLoading: true,
      filters: {},
    });

    assert.ok(html.includes('catalog-loading'));
    assert.ok(html.includes('aria-busy="true"'));
    assert.ok(html.includes('skeleton-line'));
  });

  await t.test('renders no-matches state with active query and clear button', () => {
    const html = renderCatalogPage({
      courses: [],
      categories: sampleCategories,
      total: 0,
      isLoading: false,
      filters: { q: 'nonexistent-topic' },
    });

    assert.ok(html.includes('No courses match'));
    assert.ok(html.includes('nonexistent-topic'));
    assert.ok(html.includes('Clear filters'));
    assert.ok(html.includes('href="/courses"'));
  });

  await t.test('renders empty state when catalog has no courses published', () => {
    const html = renderCatalogPage({
      courses: [],
      categories: [],
      total: 0,
      isLoading: false,
      filters: {},
    });

    assert.ok(html.includes('No courses published yet'));
  });

  await t.test('renders pagination controls correctly for multi-page results', () => {
    const html = renderCatalogPage({
      courses: sampleCourses,
      total: 25,
      filters: { page: 2, limit: 12 },
    });

    assert.ok(html.includes('Page 2 of 3'));
    assert.ok(html.includes('data-action="prev-page"'));
    assert.ok(html.includes('data-action="next-page"'));
  });

  await t.test('escapes untrusted values to prevent XSS in catalog markup', () => {
    const maliciousCategories = [
      { id: 'cat-xss" onfocus="alert(1)"', name: '<script>alert("xss-cat")</script>', slug: 'slug-xss' },
    ];
    const maliciousCourses = [
      {
        id: 'course-xss" data-injected="true',
        title: '<img src=x onerror="alert(\'xss-title\')">Dangerous Title',
        description: '"><script>alert("xss-desc")</script>',
        authorName: 'Attacker <b onmouseover="alert(\'xss-author\')">Bob</b>',
        difficulty: 'beginner"><script>alert(1)</script>',
        language: 'en',
        estimatedDurationMinutes: 60,
      },
    ];

    const html = renderCatalogPage({
      courses: maliciousCourses,
      categories: maliciousCategories,
      total: 1,
      isLoading: false,
      filters: { q: '<script>alert("xss-query")</script>' },
    });

    // Verify unescaped tags/attributes are NOT present
    assert.ok(!html.includes('<script>alert("xss-cat")</script>'));
    assert.ok(!html.includes('<script>alert("xss-query")</script>'));
    assert.ok(!html.includes('<img src=x onerror='));
    assert.ok(!html.includes('"><script>alert("xss-desc")</script>'));
    assert.ok(!html.includes('<b onmouseover='));

    // Verify escaped representations ARE present
    assert.ok(html.includes('&lt;script&gt;alert(&quot;xss-cat&quot;)&lt;/script&gt;'));
    assert.ok(html.includes('cat-xss&quot; onfocus=&quot;alert(1)&quot;'));
    assert.ok(html.includes('&lt;img src=x onerror='));
    assert.ok(html.includes('&lt;script&gt;alert(&quot;xss-desc&quot;)&lt;/script&gt;'));
  });
});
