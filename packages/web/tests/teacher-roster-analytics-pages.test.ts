import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStudentsAndInvitationsPage } from '../src/pages/author/StudentsAndInvitationsPage.ts';
import { renderStudentDetailPage } from '../src/pages/author/StudentDetailPage.ts';
import { renderCourseAnalyticsPage } from '../src/pages/author/CourseAnalyticsPage.ts';

test('P28: Students and Invitations Page (design.md P28, PRD §14, T073)', async (t) => {
  const mockRoster = {
    students: [
      {
        enrollmentId: 'enr-1',
        studentId: 'user-student-1',
        displayName: 'Ada Lovelace',
        maskedEmail: 'a***a@zur.internal',
        pinnedVersionNumber: 1,
        status: 'active',
        completedStepsCount: 4,
        totalRequiredStepsCount: 5,
        progressPercent: 80,
        enrolledAt: '2026-09-01T10:00:00Z',
        lastActivityAt: '2026-09-20T14:30:00Z',
      },
      {
        enrollmentId: 'enr-2',
        studentId: 'user-student-2',
        displayName: 'Grace Hopper',
        maskedEmail: 'g***e@zur.internal',
        pinnedVersionNumber: 2,
        status: 'revoked',
        completedStepsCount: 2,
        totalRequiredStepsCount: 6,
        progressPercent: 33,
        enrolledAt: '2026-09-05T12:00:00Z',
        lastActivityAt: '2026-09-15T09:00:00Z',
      },
    ],
    total: 2,
    limit: 20,
    offset: 0,
    versions: [
      { id: 'ver-1', versionNumber: 1 },
      { id: 'ver-2', versionNumber: 2 },
    ],
  };

  const mockInvitations = [
    {
      id: 'inv-1',
      courseId: 'course-1',
      type: 'email' as const,
      recipientEmail: 'katherine@zur.internal',
      expiresAt: '2026-10-01T00:00:00Z',
      maxUses: 1,
      usesCount: 0,
      isRevoked: false,
      createdAt: '2026-09-24T00:00:00Z',
    },
    {
      id: 'inv-2',
      courseId: 'course-1',
      type: 'shareable_link' as const,
      recipientEmail: null,
      expiresAt: '2026-10-15T00:00:00Z',
      maxUses: 25,
      usesCount: 5,
      isRevoked: false,
      createdAt: '2026-09-20T00:00:00Z',
    },
  ];

  await t.test('renders roster with student details, masked email, and status badges', () => {
    const html = renderStudentsAndInvitationsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      totalStudentsCount: 2,
      roster: mockRoster as any,
      invitations: mockInvitations,
      currentTab: 'enrolled',
    });

    assert.ok(html.includes('Students and invitations'), 'Title present');
    assert.ok(html.includes('Enrolled (2)'), 'Enrolled count in tab header');
    assert.ok(html.includes('Invitations (2)'), 'Invitations count in tab header');
    assert.ok(html.includes('Ada Lovelace'), 'Student 1 present');
    assert.ok(html.includes('a***a@zur.internal'), 'Masked email present');
    assert.ok(!html.includes('ada.lovelace@zur.internal'), 'Full email must not be exposed');
    assert.ok(html.includes('Active'), 'Active status badge');
    assert.ok(html.includes('Revoked'), 'Revoked status badge');
    assert.ok(html.includes('v1'), 'Version 1 badge');
    assert.ok(html.includes('v2'), 'Version 2 badge');
    assert.ok(html.includes('4 / 5 steps'), 'Progress step count');
    assert.ok(html.includes('80%'), 'Progress percentage');
  });

  await t.test('renders action controls: View detail, Revoke for active, Reinstate for revoked', () => {
    const html = renderStudentsAndInvitationsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      totalStudentsCount: 2,
      roster: mockRoster as any,
      invitations: mockInvitations,
      currentTab: 'enrolled',
    });

    assert.ok(html.includes('View detail'), 'View detail button present');
    assert.ok(html.includes('data-action="open-revoke"'), 'Revoke button present for active student');
    assert.ok(html.includes('data-action="open-reinstate"'), 'Reinstate button present for revoked student');
  });

  await t.test('renders search, status filter, and version filter controls', () => {
    const html = renderStudentsAndInvitationsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      totalStudentsCount: 2,
      roster: mockRoster as any,
      invitations: mockInvitations,
      currentTab: 'enrolled',
      filters: { search: 'Ada', status: 'active', version: '1' },
    });

    assert.ok(html.includes('id="roster-search"'), 'Search input present');
    assert.ok(html.includes('value="Ada"'), 'Active search value preserved');
    assert.ok(html.includes('id="roster-status-filter"'), 'Status filter select present');
    assert.ok(html.includes('id="roster-version-filter"'), 'Version filter select present');
    assert.ok(html.includes('Reset'), 'Reset filter button present when filters active');
  });

  await t.test('renders empty state when roster has zero matches', () => {
    const html = renderStudentsAndInvitationsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      totalStudentsCount: 0,
      roster: { students: [], total: 0, limit: 20, offset: 0 } as any,
      invitations: [],
      currentTab: 'enrolled',
    });

    assert.ok(html.includes('No students found'), 'Empty roster header');
    assert.ok(html.includes('No learners match your search criteria'), 'Empty roster explanation');
  });

  await t.test('renders invitations tab with email and link management', () => {
    const html = renderStudentsAndInvitationsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      totalStudentsCount: 2,
      roster: mockRoster as any,
      invitations: mockInvitations,
      currentTab: 'invitations',
    });

    assert.ok(html.includes('katherine@zur.internal'), 'Recipient email listed');
    assert.ok(html.includes('Shareable link'), 'Shareable link type badge');
    assert.ok(html.includes('5 / 25 uses'), 'Shareable link usage count');
    assert.ok(html.includes('data-action="resend-invitation"'), 'Resend invitation button present');
    assert.ok(html.includes('data-action="revoke-invitation"'), 'Revoke invitation button present');
  });

  await t.test('renders revoke modal with consequence notice that account is not deleted', () => {
    const html = renderStudentsAndInvitationsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      totalStudentsCount: 2,
      roster: mockRoster as any,
      invitations: mockInvitations,
    });

    assert.ok(html.includes('id="revoke-student-modal"'), 'Revoke modal present');
    assert.ok(html.includes('explicitly does not delete their account'), 'Clear non-destructive consequence notice');
    assert.ok(html.includes('verified progress, step completion timestamps, and submitted attempts are retained'), 'Retention guarantee');
  });

  await t.test('escapes user display names and query inputs against XSS', () => {
    const maliciousRoster = {
      students: [
        {
          enrollmentId: 'enr-xss',
          studentId: 'user-xss',
          displayName: '<script>alert("xss")</script>',
          maskedEmail: 'x***s@zur.internal',
          pinnedVersionNumber: 1,
          status: 'active',
          completedStepsCount: 0,
          totalRequiredStepsCount: 1,
          progressPercent: 0,
          enrolledAt: '2026-09-01T00:00:00Z',
          lastActivityAt: null,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    };

    const html = renderStudentsAndInvitationsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      totalStudentsCount: 1,
      roster: maliciousRoster as any,
      invitations: [],
      filters: { search: '<img src=x onerror=alert(1)>' },
    });

    assert.ok(!html.includes('<script>alert("xss")</script>'), 'Display name must be escaped');
    assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'Filter input must be escaped');
  });
});

test('P29: Student Detail for Course Owner (design.md P29, PRD §14, T074)', async (t) => {
  const mockDetailData = {
    enrollment: {
      id: 'enr-ada-1',
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      courseVersionId: 'ver-1',
      versionNumber: 1,
      status: 'active' as const,
      enrolledAt: '2026-09-01T10:00:00Z',
      revokedAt: null,
      revocationReason: null,
      completedAt: null,
    },
    student: {
      id: 'user-student-1',
      displayName: 'Ada Lovelace',
      email: 'a***a@zur.internal',
    },
    overallProgress: {
      requiredStepsCompleted: 3,
      totalRequiredSteps: 4,
      percentage: 75,
      lastLearningActivityAt: '2026-09-25T16:00:00Z',
    },
    curriculum: [
      {
        id: 'mod-1',
        title: 'Variables and Types',
        ordinal: 1,
        lessons: [
          {
            id: 'les-1',
            title: 'Numbers and Operations',
            ordinal: 1,
            steps: [
              { id: 'step-1', title: 'Introduction', type: 'theory' as const, ordinal: 1, isRequired: true },
              { id: 'step-2', title: 'Video Overview', type: 'video' as const, ordinal: 2, isRequired: false },
              { id: 'step-3', title: 'Basic Quiz', type: 'quiz' as const, ordinal: 3, isRequired: true },
              { id: 'step-4', title: 'Arithmetic Exercise', type: 'python' as const, ordinal: 4, isRequired: true },
            ],
          },
        ],
      },
    ],
    stepProgress: {
      'step-1': { satisfied: true, completedAt: '2026-09-02T10:00:00Z', submissionCount: 0, bestScore: null, isWaived: false },
      'step-2': { satisfied: false, completedAt: null, submissionCount: 0, bestScore: null, isWaived: false },
      'step-3': { satisfied: true, completedAt: '2026-09-05T11:00:00Z', submissionCount: 1, bestScore: 100, isWaived: false },
      'step-4': { satisfied: true, completedAt: null, submissionCount: 2, bestScore: null, isWaived: true, waivedAt: '2026-09-10T12:00:00Z' },
    },
    attempts: {
      'step-4': [
        {
          id: 'att-2',
          attemptNumber: 2,
          verdict: 'passed',
          score: 100,
          submittedAt: '2026-09-08T15:00:00Z',
          submittedCode: 'a = int(input())\nb = int(input())\nprint(a + b)\n',
          isLatest: true,
        },
        {
          id: 'att-1',
          attemptNumber: 1,
          verdict: 'wrong_answer',
          score: 0,
          submittedAt: '2026-09-08T14:50:00Z',
          submittedCode: 'print("hello world")\n',
          isLatest: false,
        },
      ],
    },
    waivers: {
      'step-4': { waivedAt: '2026-09-10T12:00:00Z', reason: 'Waived due to upstream runtime bug in v1' },
    },
  };

  await t.test('renders student hero overview, pinned version, and progress summary', () => {
    const html = renderStudentDetailPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      data: mockDetailData,
      selectedStepId: 'step-4',
    });

    assert.ok(html.includes('Ada Lovelace'), 'Student name rendered');
    assert.ok(html.includes('Active enrollment'), 'Status badge rendered');
    assert.ok(html.includes('Version 1'), 'Pinned version number');
    assert.ok(html.includes('3 of 4 completed (75%)'), 'Required progress stats');
    assert.ok(html.includes('← Back to students'), 'Breadcrumb back button');
  });

  await t.test('curriculum breakdown distinguishes administrative waiver from normal pass', () => {
    const html = renderStudentDetailPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      data: mockDetailData,
      selectedStepId: 'step-4',
    });

    assert.ok(html.includes('Waived (Admin)'), 'Waiver label distinct from completed');
    assert.ok(html.includes('Waived due to upstream runtime bug in v1'), 'Waiver reason displayed');
    assert.ok(html.includes('There is no manual teacher-side completion-override toggle'), 'Truthful policy notice');
  });

  await t.test('renders submitted code snapshot in read-only pre block, protecting unsent drafts', () => {
    const html = renderStudentDetailPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      data: mockDetailData,
      selectedStepId: 'step-4',
      selectedAttemptId: 'att-2',
    });

    assert.ok(html.includes('Attempt #2'), 'Attempt number tab');
    assert.ok(html.includes('PASSED'), 'Attempt verdict');
    assert.ok(html.includes('print(a + b)'), 'Submitted code snapshot rendered');
    assert.ok(html.includes('Private unsent drafts are never visible'), 'Draft privacy notice');
  });

  await t.test('provides report broken exercise entry with course and version context', () => {
    const html = renderStudentDetailPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      data: mockDetailData,
    });

    assert.ok(html.includes('Report broken exercise'), 'Report button present');
    assert.ok(html.includes('/help?courseId=course-1&versionId=ver-1'), 'Links to help with contextual params');
  });

  await t.test('uses semantic classes for desktop student-detail-layout and readable lesson-rail rows (Finding 3)', () => {
    const detailHtml = renderStudentDetailPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      data: mockDetailData,
      selectedStepId: 'step-4',
    });

    assert.ok(detailHtml.includes('student-detail-layout'), 'P29 student detail grid layout class');
    assert.ok(detailHtml.includes('step-rail-row'), 'P29 readable step rail row container');
    assert.ok(detailHtml.includes('step-rail-step-title'), 'P29 step title element');
  });
});

test('P30: Course Analytics Page (design.md P30, PRD §14, T075)', async (t) => {
  const mockAnalytics = {
    courseId: 'course-1',
    courseVersionId: 'ver-2',
    windowDays: 7,
    activeEnrollments: 42,
    learningActiveStudents: 28,
    completionRate: {
      count: 14,
      total: 42,
      percentage: 33.3,
    },
    averageProgress: 64.5,
    exerciseInsights: [
      {
        stepId: 'step-ex-1',
        stepTitle: 'Echo Input Exercise',
        stepType: 'python',
        moduleTitle: 'Module 1',
        lessonTitle: 'Lesson 1',
        distinctParticipants: 35,
        distinctPassCount: 28,
        passRatePercentage: 80.0,
        medianAttemptsToPass: 2,
        lastAssessedActivityAt: '2026-09-25T12:00:00Z',
        totalSubmissions: 70,
        waiverCount: 0,
        infraFailureCount: 2,
      },
      {
        stepId: 'step-quiz-1',
        stepTitle: 'Logic Gates Quiz',
        stepType: 'quiz',
        moduleTitle: 'Module 1',
        lessonTitle: 'Lesson 2',
        distinctParticipants: 30,
        distinctPassCount: 27,
        passRatePercentage: 90.0,
        medianAttemptsToPass: 1,
        lastAssessedActivityAt: '2026-09-24T18:00:00Z',
        totalSubmissions: 35,
        waiverCount: 1,
        infraFailureCount: 0,
      },
      {
        stepId: 'step-empty',
        stepTitle: 'Advanced Recursion',
        stepType: 'python',
        moduleTitle: 'Module 2',
        lessonTitle: 'Lesson 3',
        distinctParticipants: 0,
        distinctPassCount: 0,
        passRatePercentage: null,
        medianAttemptsToPass: null,
        lastAssessedActivityAt: null,
        totalSubmissions: 0,
        waiverCount: 0,
        infraFailureCount: 0,
      },
    ],
  };

  await t.test('renders horizontal definition list with the 4 exact PRD metrics', () => {
    const html = renderCourseAnalyticsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      analytics: mockAnalytics as any,
      availableVersions: [{ id: 'ver-1', versionNumber: 1 }, { id: 'ver-2', versionNumber: 2 }],
      filters: { windowDays: 7 },
    });

    assert.ok(html.includes('Course analytics'), 'Page title');
    assert.ok(html.includes('Active enrollments'), 'Metric 1 name');
    assert.ok(html.includes('42'), 'Active enrollments value');
    assert.ok(html.includes('Learning-active students'), 'Metric 2 name');
    assert.ok(html.includes('28'), 'Learning-active students value');
    assert.ok(html.includes('Completion rate'), 'Metric 3 name');
    assert.ok(html.includes('33.3%'), 'Completion percentage');
    assert.ok(html.includes('14 / 42 active students finished'), 'Completion count / denominator');
    assert.ok(html.includes('Average progress'), 'Metric 4 name');
    assert.ok(html.includes('64.5%'), 'Average progress percentage');
  });

  await t.test('renders exercise performance table with pass rates, median attempts, and exclusions', () => {
    const html = renderCourseAnalyticsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      analytics: mockAnalytics as any,
    });

    assert.ok(html.includes('Echo Input Exercise'), 'Exercise 1 title');
    assert.ok(html.includes('80%'), 'Pass rate percentage');
    assert.ok(html.includes('(28 / 35)'), 'Pass rate denominator');
    assert.ok(html.includes('2'), 'Median attempts to pass');
    assert.ok(html.includes('2 infra error'), 'Infra error exclusion annotation');
    assert.ok(html.includes('1 admin waiver'), 'Waiver annotation');
  });

  await t.test('renders sparse-data state without misleading zero-percent pass rate claim', () => {
    const html = renderCourseAnalyticsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      analytics: mockAnalytics as any,
    });

    assert.ok(html.includes('Advanced Recursion'), 'Unassessed exercise present');
    assert.ok(html.includes('No assessed attempts yet'), 'Sparse data label instead of 0%');
  });

  await t.test('renders version and reporting window filters', () => {
    const html = renderCourseAnalyticsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      analytics: mockAnalytics as any,
      availableVersions: [{ id: 'ver-1', versionNumber: 1 }, { id: 'ver-2', versionNumber: 2 }],
      filters: { versionId: '2', windowDays: 14 },
    });

    assert.ok(html.includes('id="analytics-version-filter"'), 'Version filter dropdown');
    assert.ok(html.includes('id="analytics-window-filter"'), 'Window filter dropdown');
    assert.ok(html.includes('Last 14 days'), 'Selected window displayed');
  });

  await t.test('unfiltered view clearly indicates summary is all versions while exercises default to latest release (Finding 1)', () => {
    const html = renderCourseAnalyticsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      analytics: {
        ...mockAnalytics,
        versionNumber: 2,
      } as any,
      availableVersions: [{ id: 'ver-1', versionNumber: 1 }, { id: 'ver-2', versionNumber: 2 }],
    });

    assert.ok(html.includes('>All versions</option>'), 'Dropdown exposes an all-version enrollment summary option');
    assert.ok(html.includes('Enrollment summary version'), 'Accessible label identifies which metrics the version selector filters');
    assert.ok(html.includes('Exercise insights — Version 2 (latest release)'), 'Table heading states latest release');
    assert.ok(html.includes('Enrollment metrics follow the selected version scope'), 'Summary scope is explained separately from exercise scope');
    assert.ok(html.includes('Exercise results use one immutable release at a time'), 'Exercise filter semantics explain version pinning');
  });

  await t.test('no active enrollments displays "No activity yet" instead of misleading 0% (Finding 2)', () => {
    const emptyAnalytics = {
      courseId: 'course-1',
      versionNumber: 2,
      activeEnrollments: 0,
      learningActiveStudents: 0,
      completion: {
        completedCount: 0,
        totalActive: 0,
        ratePercent: null,
        percentage: null,
      },
      averageProgressPercent: null,
      exerciseInsights: [],
    };

    const html = renderCourseAnalyticsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      analytics: emptyAnalytics as any,
    });

    assert.ok(html.includes('No activity yet'), 'Must display "No activity yet" when completion rate is null');
    assert.ok(html.includes('No active enrollments'), 'Must display "No active enrollments" caption');
    assert.ok(!html.includes('>0%<'), 'Must not display 0% for completion rate');
  });

  await t.test('uses semantic classes for desktop horizontal metrics definition list (Finding 3)', () => {
    const analyticsHtml = renderCourseAnalyticsPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      analytics: mockAnalytics as any,
    });

    assert.ok(analyticsHtml.includes('metrics-definition-list'), 'P30 horizontal metrics definition list class');
    assert.ok(analyticsHtml.includes('metrics-definition-item'), 'P30 metrics definition item class');
  });
});
