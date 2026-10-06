import test from 'node:test';
import assert from 'node:assert';
import { renderCoursePublishPage } from '../src/pages/author/CoursePublishPage.ts';
import { renderPythonWorkspacePage } from '../src/pages/learning/PythonWorkspacePage.ts';
import { renderCatalogPage } from '../src/pages/public/CatalogPage.ts';
import { renderPrivacySettingsPage } from '../src/pages/settings/PrivacySettingsPage.ts';
import { renderHelpPage } from '../src/pages/public/HelpPage.ts';
import { renderAdminPage } from '../src/pages/admin/AdminPages.ts';

test('F01: Publication receipt renders accurately without scope error', () => {
  const html = renderCoursePublishPage({
    courseId: 'course-1',
    courseTitle: 'Introduction to Python',
    publicationState: 'published',
    hasUnpublishedChanges: false,
    draftRevision: 2,
    newVersionNumber: 1,
    activeEnrolledStudents: 0,
    validation: { isValid: true, errors: [], warnings: [] },
    receipt: {
      versionId: 'ver-123',
      versionNumber: 1,
      publishedAt: '2026-10-05T12:00:00Z',
      studentCountPinnedToOldVersions: 0,
    },
  });
  assert.ok(html.includes('Publication Receipt'));
  assert.ok(html.includes('Released Version 1'));
  assert.ok(html.includes('ver-123'));
});

test('U01: Python workspace results banner includes active run mode badge', () => {
  const samplesHtml = renderPythonWorkspacePage({
    courseTitle: 'Course',
    courseOverviewUrl: '/learn/enr-1',
    lessonTitle: 'Lesson',
    stepTitle: 'Step 1',
    stepOrdinalText: 'Step 1 of 5',
    enrollmentId: 'enr-1',
    stepId: 'step-1',
    problemStatement: 'Problem',
    inputFormat: '',
    outputFormat: '',
    constraints: '',
    starterCode: '',
    currentCode: 'print(1)',
    resultMode: 'samples',
    currentResult: {
      verdict: 'PASSED',
      executionTimeMs: 42,
      testResults: [{ position: 0, passed: true, input: '1', expectedOutput: '1', actualOutput: '1' }],
    },
  });
  assert.ok(samplesHtml.includes('Run (Samples)'));

  const submitHtml = renderPythonWorkspacePage({
    courseTitle: 'Course',
    courseOverviewUrl: '/learn/enr-1',
    lessonTitle: 'Lesson',
    stepTitle: 'Step 1',
    stepOrdinalText: 'Step 1 of 5',
    enrollmentId: 'enr-1',
    stepId: 'step-1',
    problemStatement: 'Problem',
    inputFormat: '',
    outputFormat: '',
    constraints: '',
    starterCode: '',
    currentCode: 'print(1)',
    resultMode: 'submit',
    currentResult: {
      verdict: 'PASSED',
      executionTimeMs: 50,
      testResults: [{ position: 0, passed: true, input: '1', expectedOutput: '1', actualOutput: '1' }],
    },
  });
  assert.ok(submitHtml.includes('Submit (Graded)'));
});

test('F06: Exercise report link includes courseId, courseVersionId, and stepId', () => {
  const html = renderPythonWorkspacePage({
    courseTitle: 'Python Basics',
    courseOverviewUrl: '/learn/enr-1',
    lessonTitle: 'Lesson 1',
    stepTitle: 'Step 1',
    stepOrdinalText: 'Step 1 of 3',
    enrollmentId: 'enr-1',
    stepId: 'step-py-1',
    courseId: 'course-python-101',
    courseVersionId: 'ver-abc-456',
    problemStatement: 'Write code',
    inputFormat: '',
    outputFormat: '',
    constraints: '',
    starterCode: '',
    currentCode: 'print(1)',
  });
  assert.ok(html.includes('courseId=course-python-101'));
  assert.ok(html.includes('courseVersionId=ver-abc-456'));
  assert.ok(html.includes('stepId=step-py-1'));
});

test('F06: HelpPage initializes report modal with course, version, and step context', () => {
  const html = renderHelpPage({
    courseId: 'course-python-101',
    courseVersionId: 'ver-abc-456',
    stepId: 'step-py-1',
    type: 'broken_exercise',
    isReportModalOpen: true,
  });
  assert.ok(html.includes('value="course-python-101"'));
  assert.ok(html.includes('value="ver-abc-456"'));
  assert.ok(html.includes('value="step-py-1"'));
  assert.ok(html.includes('selected>Broken exercise'));
});

test('U03: Course publish page connects blockers to actual step editor routes and lifecycle stages', () => {
  // 1. With stepTypeMap mapping to python step editor
  const htmlWithType = renderCoursePublishPage({
    courseId: 'course-1',
    courseTitle: 'Course Title',
    publicationState: 'draft',
    hasUnpublishedChanges: true,
    draftRevision: 1,
    newVersionNumber: 1,
    activeEnrolledStudents: 0,
    stepTypeMap: { 'step-err-99': 'python' },
    validation: {
      isValid: false,
      errors: [
        {
          stepId: 'step-err-99',
          message: 'Python exercise is missing starter code',
          blocking: true,
        },
      ],
      warnings: [],
    },
  });
  assert.ok(htmlWithType.includes('href="/teach/course-1/content/python/step-err-99"'), 'Must target actual python step editor route');
  assert.ok(htmlWithType.includes('Edit step →'));
  assert.ok(htmlWithType.includes('1. Basics'));
  assert.ok(htmlWithType.includes('2. Structure'));
  assert.ok(htmlWithType.includes('3. Build steps'));
  assert.ok(htmlWithType.includes('4. Preview'));
  assert.ok(htmlWithType.includes('5. Publish'));
  assert.ok(htmlWithType.includes('Next action:'));
  assert.ok(htmlWithType.includes('Resolve 1 blocking issue'));

  // 2. Without stepTypeMap fallback to content builder query
  const htmlFallback = renderCoursePublishPage({
    courseId: 'course-1',
    courseTitle: 'Course Title',
    publicationState: 'draft',
    hasUnpublishedChanges: true,
    draftRevision: 1,
    newVersionNumber: 1,
    activeEnrolledStudents: 0,
    validation: {
      isValid: false,
      errors: [
        {
          stepId: 'step-err-99',
          message: 'Unknown step issue',
          blocking: true,
        },
      ],
      warnings: [],
    },
  });
  assert.ok(htmlFallback.includes('href="/teach/course-1/content?type=step&id=step-err-99"'), 'Must fallback to builder step query');
});

test('U04: Admin mutation dialogs present structured target, state, action, and empty states', () => {
  const adminUserDetailHtml = renderAdminPage('/admin/users/user-42', {
    user: {
      id: 'user-42',
      displayName: 'Jane Doe',
      email: 'badactor@example.com',
      capabilities: ['student'],
      accountStatus: 'active',
      emailVerified: true,
      createdAt: '2026-10-01T00:00:00Z',
    },
    supportRecords: null,
    enrollments: [],
  });
  assert.ok(adminUserDetailHtml.includes('admin-mutation-summary'), 'Must include structured mutation summary');
  assert.ok(adminUserDetailHtml.includes('Target:'), 'Must show target label');
  assert.ok(adminUserDetailHtml.includes('user-42'), 'Must identify target user');
  assert.ok(adminUserDetailHtml.includes('Proposed action:'), 'Must show proposed action');
  assert.ok(adminUserDetailHtml.includes('Confirm administrator password'), 'Must require admin password');

  // Verify empty state display vs error separation
  const adminAuditEmptyHtml = renderAdminPage('/admin/audit', {
    items: [],
    total: 0,
    limit: 10,
  });
  assert.ok(adminAuditEmptyHtml.includes('empty-state'), 'Must display clean empty state for zero records');
});

test('U05: Catalog page renders active filter chips and clear all button', () => {
  const html = renderCatalogPage({
    courses: [
      {
        id: 'c-1',
        title: 'Python for Beginners',
        description: 'Learn Python',
        difficulty: 'beginner',
        language: 'en',
      },
    ],
    categories: [{ id: 'cat-prog', name: 'Programming', slug: 'programming' }],
    total: 1,
    filters: {
      q: 'beginners',
      category: 'cat-prog',
      level: 'beginner',
      language: 'en',
    },
  });
  assert.ok(html.includes('active-filter-chips'));
  assert.ok(html.includes('Query: "beginners"'));
  assert.ok(html.includes('Category: Programming'));
  assert.ok(html.includes('Level: Beginner'));
  assert.ok(html.includes('Clear all'));
});

test('U05: Privacy page clearly explains deletion finality and preserves cancel', () => {
  const html = renderPrivacySettingsPage({
    ownedCourseCount: 0,
    requests: [],
  });
  assert.ok(html.includes('Permanently delete your account?'));
  assert.ok(html.includes('This action cannot be undone once submitted.'));
  assert.ok(html.includes('id="btn-cancel-deletion"'));
});

test('F07: Admin pages route matching handles query strings', () => {
  const html = renderAdminPage('/admin/audit?action=user.login&limit=10', {
    items: [],
    total: 0,
    limit: 10,
  });
  assert.ok(html.includes('admin-audit-filter-form') || html.includes('audit'));
});
