import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStudentsAndInvitationsPage } from '../src/pages/author/StudentsAndInvitationsPage.ts';

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
      expiresAt: '2099-10-01T00:00:00Z',
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
      expiresAt: '2099-10-15T00:00:00Z',
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
