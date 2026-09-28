import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLandingPage } from '../src/pages/public/LandingPage.ts';
import { renderCatalogPage } from '../src/pages/public/CatalogPage.ts';
import { renderCourseOverviewPage } from '../src/pages/public/CourseOverviewPage.ts';
import { renderHelpPage } from '../src/pages/public/HelpPage.ts';
import { renderPolicyPage } from '../src/pages/public/PolicyPage.ts';

test('Public Landing Page P01 (T069)', async (t) => {
  await t.test('renders headline, value props, and Read-Try-Check progression rail', () => {
    const html = renderLandingPage({ isSignedIn: false });

    // Headline and subheadline (design.md P01)
    assert.ok(html.includes('Understand it.'));
    assert.ok(html.includes('Then write it.'));
    assert.ok(html.includes('Learn Python through short lessons and real exercises.'));

    // Accurate example workspace fragment
    assert.ok(html.includes('workspace-fragment'));
    assert.ok(html.includes('Python 3.12'));
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
    assert.ok(signedOutHtml.includes('Explore courses'));
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

test('Course Overview Page P03 (T071)', async (t) => {
  const sampleOverviewData = {
    course: {
      id: 'course-py-101',
      title: 'Python Foundations',
      description: 'Master naming, values, and control flow in Python 3.',
      difficulty: 'beginner',
      language: 'en',
      authorName: 'Guido van Rossum',
      estimatedDurationMinutes: 90,
      visibility: 'public' as const,
      enrollmentPolicy: 'open' as const,
      publicationStatus: 'published' as const,
      versionNumber: 2,
      learningOutcomes: [
        'Understand Python variable binding and memory semantics',
        'Write conditionals and standard while/for loops',
        'Handle basic standard input and output streams',
      ],
      prerequisites: 'No prior programming experience required.',
    },
    syllabus: [
      {
        id: 'mod-1',
        title: 'Naming and Values',
        position: 1,
        lessons: [
          {
            id: 'les-1',
            title: 'Variables',
            description: 'Introduction to objects and identifiers.',
            position: 1,
            stepCounts: { theory: 1, video: 0, quiz: 1, python: 1, total: 3 },
            steps: [
              { id: 'st-1', title: 'What is a variable?', type: 'theory', position: 1, isRequired: true, estimatedDurationMinutes: 5 },
              { id: 'st-2', title: 'Variable assignment quiz', type: 'quiz', position: 2, isRequired: true, estimatedDurationMinutes: 5 },
              { id: 'st-3', title: 'Echoing Numbers', type: 'python', position: 3, isRequired: true, estimatedDurationMinutes: 10 },
            ],
          },
        ],
      },
    ],
    enrollmentStatus: {
      isEnrolled: false,
      status: null,
    },
    isEmailVerified: true,
  };

  await t.test('renders 2:1 layout, learning outcomes, prerequisites, and syllabus outline', () => {
    const html = renderCourseOverviewPage({
      data: sampleOverviewData,
      currentUser: null,
    });

    // 2:1 layout grid
    assert.ok(html.includes('overview-grid'));
    assert.ok(html.includes('overview-main'));
    assert.ok(html.includes('overview-sidebar'));

    // Course title, description, and metadata
    assert.ok(html.includes('Python Foundations'));
    assert.ok(html.includes('Guido van Rossum'));
    assert.ok(html.includes('~90 mins'));
    assert.ok(html.includes('v2'));

    // Learning outcomes and prerequisites
    assert.ok(html.includes('What you will learn'));
    assert.ok(html.includes('Understand Python variable binding and memory semantics'));
    assert.ok(html.includes('Prerequisites'));
    assert.ok(html.includes('No prior programming experience required.'));

    // Informational syllabus: verifies step titles appear without leaking step content
    assert.ok(html.includes('Course syllabus'));
    assert.ok(html.includes('Naming and Values'));
    assert.ok(html.includes('Lesson 1:'));
    assert.ok(html.includes('1 Theory · 1 Quiz · 1 Python'));
    assert.ok(html.includes('What is a variable?'));
    assert.ok(html.includes('Echoing Numbers'));

    // Ensure step bodies, test cases, or answers are NOT in the rendered markup
    assert.ok(!html.includes('sys.stdin'));
    assert.ok(!html.includes('test_cases'));
    assert.ok(!html.includes('answer_key'));
  });

  await t.test('shows Sign in to enroll CTA when user is not signed in', () => {
    const html = renderCourseOverviewPage({
      data: sampleOverviewData,
      currentUser: null,
    });

    assert.ok(html.includes('Sign in to enroll'));
    assert.ok(html.includes('/sign-in?returnTo='));
  });

  await t.test('shows Verify email to enroll CTA when signed-in user is unverified', () => {
    const unverifiedData = {
      ...sampleOverviewData,
      isEmailVerified: false,
    };

    const html = renderCourseOverviewPage({
      data: unverifiedData,
      currentUser: { id: 'u-1', email: 'ada@zur.internal', displayName: 'Ada' },
    });

    assert.ok(html.includes('Verify email to enroll'));
    assert.ok(html.includes('/verify-email'));
  });

  await t.test('shows Enroll in course button when user is signed in and verified', () => {
    const html = renderCourseOverviewPage({
      data: sampleOverviewData,
      currentUser: { id: 'u-1', email: 'ada@zur.internal', displayName: 'Ada' },
    });

    assert.ok(html.includes('id="btn-enroll-course"'));
    assert.ok(html.includes('Enroll in course'));
  });

  await t.test('shows Continue learning CTA when user is already actively enrolled', () => {
    const enrolledData = {
      ...sampleOverviewData,
      enrollmentStatus: {
        isEnrolled: true,
        enrollmentId: 'enr-123',
        status: 'active',
      },
    };

    const html = renderCourseOverviewPage({
      data: enrolledData,
      currentUser: { id: 'u-1', email: 'ada@zur.internal', displayName: 'Ada' },
    });

    assert.ok(html.includes('Continue learning'));
    assert.ok(html.includes('href="/learn"'));
  });

  await t.test('shows Invitation required banner for invitation-only course', () => {
    const inviteOnlyData = {
      ...sampleOverviewData,
      course: {
        ...sampleOverviewData.course,
        enrollmentPolicy: 'invitation_only' as const,
      },
    };

    const html = renderCourseOverviewPage({
      data: inviteOnlyData,
      currentUser: { id: 'u-1', email: 'ada@zur.internal', displayName: 'Ada' },
    });

    assert.ok(html.includes('Invitation required'));
    assert.ok(html.includes('requires an invitation link from the teacher'));
  });

  await t.test('shows Course unavailable banner when course is suspended', () => {
    const suspendedData = {
      ...sampleOverviewData,
      course: {
        ...sampleOverviewData.course,
        isSuspended: true,
      },
    };

    const html = renderCourseOverviewPage({
      data: suspendedData,
      currentUser: { id: 'u-1', email: 'ada@zur.internal', displayName: 'Ada' },
    });

    assert.ok(html.includes('Course unavailable'));
    assert.ok(html.includes('suspended by administration'));
  });

  await t.test('shows Access revoked banner when user enrollment is revoked', () => {
    const revokedData = {
      ...sampleOverviewData,
      enrollmentStatus: {
        isEnrolled: false,
        status: 'revoked',
      },
    };

    const html = renderCourseOverviewPage({
      data: revokedData,
      currentUser: { id: 'u-1', email: 'ada@zur.internal', displayName: 'Ada' },
    });

    assert.ok(html.includes('Access revoked'));
    assert.ok(html.includes('Your access to this course has been removed'));
    assert.ok(!html.includes('id="btn-enroll-course"'));
    assert.ok(!html.includes('Continue learning'));
  });

  await t.test('shows Archived course banner when course is archived and student not enrolled', () => {
    const archivedData = {
      ...sampleOverviewData,
      course: {
        ...sampleOverviewData.course,
        publicationStatus: 'archived' as const,
      },
      enrollmentStatus: {
        isEnrolled: false,
        status: null,
      },
    };

    const html = renderCourseOverviewPage({
      data: archivedData,
      currentUser: { id: 'u-1', email: 'ada@zur.internal', displayName: 'Ada' },
    });

    assert.ok(html.includes('Archived course'));
    assert.ok(html.includes('no longer accepts new student enrollments'));
    assert.ok(!html.includes('id="btn-enroll-course"'));
  });

  await t.test('allows enrolled student to continue learning even when course is archived', () => {
    const archivedEnrolledData = {
      ...sampleOverviewData,
      course: {
        ...sampleOverviewData.course,
        publicationStatus: 'archived' as const,
      },
      enrollmentStatus: {
        isEnrolled: true,
        enrollmentId: 'enr-archive-1',
        status: 'active',
      },
    };

    const html = renderCourseOverviewPage({
      data: archivedEnrolledData,
      currentUser: { id: 'u-1', email: 'ada@zur.internal', displayName: 'Ada' },
    });

    assert.ok(html.includes('Continue learning'));
    assert.ok(html.includes('href="/learn"'));
    assert.ok(!html.includes('id="btn-enroll-course"'));
  });

  await t.test('omits catalog discovery links in breadcrumbs for unlisted courses (design.md P03)', () => {
    const unlistedData = {
      ...sampleOverviewData,
      course: {
        ...sampleOverviewData.course,
        visibility: 'unlisted' as const,
      },
    };

    const html = renderCourseOverviewPage({
      data: unlistedData,
      currentUser: null,
    });

    assert.ok(html.includes('Unlisted'));
    assert.ok(html.includes('Accessible via direct link only'));
    // Verify catalog link is omitted
    assert.ok(!html.includes('<a href="/courses" class="text-secondary hover:underline">Courses</a>'));
  });

  await t.test('escapes untrusted values in course overview page and syllabus', () => {
    const maliciousOverviewData = {
      course: {
        id: 'course-123" onclick="alert(1)"',
        title: '<script>alert("xss-title")</script>Secure Python',
        description: '"><img src=x onerror=alert("xss-desc")>',
        difficulty: 'intermediate"><script>alert(1)</script>',
        language: 'en"><script>alert(2)</script>',
        authorName: 'Attacker <script>alert("xss-author")</script>',
        estimatedDurationMinutes: 120,
        visibility: 'public' as const,
        enrollmentPolicy: 'open' as const,
        publicationStatus: 'published' as const,
        versionNumber: 3,
        learningOutcomes: ['<script>alert("outcome")</script>Write code'],
        prerequisites: '<script>alert("prereq")</script>Basic knowledge',
      },
      syllabus: [
        {
          id: 'mod-1',
          title: 'Module <script>alert("mod")</script>',
          position: 1,
          lessons: [
            {
              id: 'les-1',
              title: 'Lesson <script>alert("les")</script>',
              description: 'Desc',
              position: 1,
              stepCounts: { theory: 1, video: 0, quiz: 0, python: 0, total: 1 },
              steps: [
                {
                  id: 'st-1',
                  title: 'Step <script>alert("step")</script>',
                  type: 'theory" data-injected="true',
                  position: 1,
                  isRequired: true,
                  estimatedDurationMinutes: 5,
                },
              ],
            },
          ],
        },
      ],
      enrollmentStatus: { isEnrolled: false, status: null },
      isEmailVerified: true,
    };

    const html = renderCourseOverviewPage({
      data: maliciousOverviewData,
      currentUser: null,
    });

    // Unescaped malicious strings should NOT appear in output
    assert.ok(!html.includes('<script>alert("xss-title")</script>'));
    assert.ok(!html.includes('"><img src=x onerror=alert("xss-desc")>'));
    assert.ok(!html.includes('<script>alert("xss-author")</script>'));
    assert.ok(!html.includes('course-123" onclick='));
    assert.ok(!html.includes('theory" data-injected='));

    // Escaped forms should be present
    assert.ok(html.includes('&lt;script&gt;alert(&quot;xss-title&quot;)&lt;/script&gt;'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(&quot;xss-desc&quot;)&gt;'));
    assert.ok(html.includes('&lt;script&gt;alert(&quot;xss-author&quot;)&lt;/script&gt;'));
    assert.ok(html.includes('course-123&quot; onclick=&quot;alert(1)&quot;'));
  });

  await t.test('renders safe service failure state with retry on network/backend failure', () => {
    const html = renderCourseOverviewPage({
      isServiceError: true,
      isLoading: false,
    });

    assert.ok(html.includes('Temporary connection issue'));
    assert.ok(html.includes('We could not reach the server to load this course overview.'));
    assert.ok(html.includes('data-action="retry"'));
    assert.ok(html.includes('Try again'));
    assert.ok(html.includes('href="/courses"'));
    assert.ok(!html.includes('DatabaseSync'));
    assert.ok(!html.includes('SQLITE'));
  });
});

test('Help Page P40 (T072)', async (t) => {
  await t.test('renders table of contents, honest support status, and contextual report modal', () => {
    const html = renderHelpPage({ courseId: 'course-py-101' });

    // Table of contents anchors
    assert.ok(html.includes('Help and support'));
    assert.ok(html.includes('href="#account"'));
    assert.ok(html.includes('href="#enrollment"'));
    assert.ok(html.includes('href="#saving"'));
    assert.ok(html.includes('href="#run-vs-submit"'));
    assert.ok(html.includes('href="#reporting"'));
    assert.ok(html.includes('href="#contact"'));

    // Truthful policy explanations
    assert.ok(html.includes('Run samples versus Submit solution'));
    assert.ok(html.includes('Public external support pending launch'));
    assert.ok(!html.includes('support@zur.internal'), 'Must not expose internal address as public contact');

    // Contextual report modal
    assert.ok(html.includes('id="report-issue-modal"'));
    assert.ok(html.includes('role="dialog"'));
    assert.ok(html.includes('id="report-course-id"'));
    assert.ok(html.includes('value="course-py-101"'));
    assert.ok(html.includes('Broken exercise or test case'));
    assert.ok(html.includes('Inappropriate or abusive content'));
  });

  await t.test('renders submission confirmation when reportSuccessReference is provided', () => {
    const html = renderHelpPage({
      isReportModalOpen: true,
      reportSuccessReference: 'REF-2026-XYZ987',
    });

    assert.ok(html.includes('Report submitted'));
    assert.ok(html.includes('REF-2026-XYZ987'));
  });

  await t.test('escapes untrusted values in help page and report modal', () => {
    // 1. Error state in active report form
    const htmlError = renderHelpPage({
      courseId: 'course-101" autofocus onfocus="alert(1)"',
      courseVersionId: 'ver-101" autofocus onfocus="alert(2)"',
      stepId: 'step-101" autofocus onfocus="alert(3)"',
      reportError: '<script>alert("error-xss")</script>Server failure',
    });

    assert.ok(!htmlError.includes('<script>alert("error-xss")</script>'));
    assert.ok(!htmlError.includes('course-101" autofocus'));
    assert.ok(htmlError.includes('&lt;script&gt;alert(&quot;error-xss&quot;)&lt;/script&gt;'));
    assert.ok(htmlError.includes('course-101&quot; autofocus'));

    // 2. Success reference state
    const htmlSuccess = renderHelpPage({
      isReportModalOpen: true,
      reportSuccessReference: '<script>alert("ref-xss")</script>REF-001',
    });
    assert.ok(!htmlSuccess.includes('<script>alert("ref-xss")</script>'));
    assert.ok(htmlSuccess.includes('&lt;script&gt;alert(&quot;ref-xss&quot;)&lt;/script&gt;'));
  });

  await t.test('preserves user input description, type, and code consent on failed report submit', () => {
    const html = renderHelpPage({
      courseId: 'course-py-101',
      type: 'inappropriate_content',
      description: 'The course contains abusive text in lesson 2.',
      includeCode: true,
      reportError: 'Submission failed due to a server error.',
      isReportModalOpen: true,
    });

    assert.ok(html.includes('The course contains abusive text in lesson 2.'));
    assert.ok(html.includes('value="inappropriate_content" selected'));
    assert.ok(html.includes('id="report-include-code" type="checkbox" class="form-checkbox" checked'));
    assert.ok(html.includes('Submission failed due to a server error.'));
  });
});

test('Policy Page P41 (T072)', async (t) => {
  await t.test('renders honest blocked launch state without fabricated legal contract text', () => {
    const privacyHtml = renderPolicyPage({ type: 'privacy' });
    const termsHtml = renderPolicyPage({ type: 'terms' });

    // Both pages must display honest blocked notice per instructions
    assert.ok(privacyHtml.includes('Pending Final Legal Counsel Approval'));
    assert.ok(privacyHtml.includes('Status: Blocked / Pending Legal Review · Not yet in effect'));
    assert.ok(privacyHtml.includes('PRD_V2.md §22, design.md P41'));
    assert.ok(privacyHtml.includes('placeholder, drafted, or fabricated legal contract text is prohibited'));

    assert.ok(termsHtml.includes('Pending Final Legal Counsel Approval'));
    assert.ok(termsHtml.includes('Status: Blocked / Pending Legal Review · Not yet in effect'));
    assert.ok(termsHtml.includes('PRD_V2.md §22, design.md P41'));

    // Assert that internal email is NOT presented as public contact
    assert.ok(!privacyHtml.includes('support@zur.internal'));
    assert.ok(!termsHtml.includes('support@zur.internal'));

    // Assert no fake effective dates or broken /docs links
    assert.ok(!privacyHtml.includes('Effective date:'));
    assert.ok(!termsHtml.includes('Effective date:'));
    assert.ok(!privacyHtml.includes('/docs'));
    assert.ok(!termsHtml.includes('/docs'));
  });
});
