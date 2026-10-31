import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCourseOverviewPage } from '../src/pages/public/CourseOverviewPage.ts';

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

  await t.test('escapes author-controlled module and lesson titles (stored XSS regression)', () => {
    const payload = '<img src=x onerror="alert(1)">';
    const data = structuredClone(sampleOverviewData) as any;
    data.syllabus[0].title = `Module 1: ${payload}`;
    data.syllabus[0].lessons[0].title = payload;
    const html = renderCourseOverviewPage({ data, currentUser: null });
    assert.ok(!html.includes('<img src=x'), 'raw markup must not reach the DOM');
    assert.ok(html.includes('&lt;img src=x'));
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
