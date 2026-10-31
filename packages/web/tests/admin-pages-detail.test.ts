import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAdminPage } from '../src/pages/admin/AdminPages.ts';

test('report detail links to exact immutable course version and step, never assuming newest (T081, P36)',()=>{
  // Case 1: Report with exact immutable version and step
  const pageWithVersion = renderAdminPage('/admin/reports/rep-1', {
    id: 'rep-1',
    type: 'broken_exercise',
    status: 'open',
    description: 'Code execution fails unexpectedly',
    courseId: 'course-py',
    courseTitle: 'Python Foundations',
    courseVersionId: 'ver-historical-1',
    versionNumber: 1,
    stepId: 'step-echo-1',
    stepTitle: 'Print Stdin',
    versionDetails: { id: 'ver-historical-1', versionNumber: 1, createdAt: '2026-09-01T00:00:00Z', isLatest: false },
  });

  assert.match(pageWithVersion, /Reported learning context/);
  assert.match(pageWithVersion, /href="\/admin\/courses\/course-py\?versionId=ver-historical-1&amp;stepId=step-echo-1"/);
  assert.match(pageWithVersion, /Version 1 \(historical version, not newest\)/);
  assert.match(pageWithVersion, /Print Stdin/);

  // Case 2: Report without version (safe unavailable state)
  const pageWithoutVersion = renderAdminPage('/admin/reports/rep-2', {
    id: 'rep-2',
    type: 'inappropriate_content',
    status: 'open',
    description: 'General course feedback',
    courseId: 'course-py',
    courseTitle: 'Python Foundations',
    courseVersionId: null,
    stepId: null,
  });
  assert.match(pageWithoutVersion, /Unavailable: no version snapshot recorded/);
  assert.match(pageWithoutVersion, /Course-level report/);

  // Case 2b: Report with courseVersionId but missing snapshot (versionDetails is null)
  // Must render safe unavailable state and NEVER produce a misleading clickable link
  const pageWithMissingSnapshot = renderAdminPage('/admin/reports/rep-2b', {
    id: 'rep-2b',
    type: 'broken_exercise',
    status: 'open',
    description: 'Report pointing to deleted or corrupted snapshot',
    courseId: 'course-py',
    courseTitle: 'Python Foundations',
    courseVersionId: 'ver-missing-snapshot',
    versionNumber: null,
    stepId: 'step-echo-1',
    stepTitle: null,
    versionDetails: null,
  });
  assert.match(pageWithMissingSnapshot, /Unavailable: no version snapshot recorded/);
  assert.doesNotMatch(pageWithMissingSnapshot, /data-report-version-link/);
  assert.doesNotMatch(pageWithMissingSnapshot, /data-report-step-link/);
  assert.doesNotMatch(pageWithMissingSnapshot, /href="\/admin\/courses\/course-py\?versionId=/);

  // Case 3: Course detail inspects exact reported version when opened with query params
  const coursePage = renderAdminPage('/admin/courses/course-py?versionId=ver-historical-1&stepId=step-echo-1', {
    id: 'course-py',
    title: 'Python Foundations',
    ownerName: 'Ada',
    ownerEmail: 'ada@example.test',
    latestVersion: 2,
    activeEnrollments: 5,
    openReports: 1,
    isSuspended: false,
    versions: [
      {
        id: 'ver-historical-1',
        versionNumber: 1,
        createdAt: '2026-09-01',
        steps: [{ id: 'step-echo-1', title: 'Print Stdin', isRequired: true }],
      },
      {
        id: 'ver-current-2',
        versionNumber: 2,
        createdAt: '2026-09-15',
        steps: [{ id: 'step-echo-1', title: 'Print Stdin', isRequired: true }],
      },
    ],
  });
  assert.match(coursePage, /Version 1 · Historical · Print Stdin/);
  assert.match(coursePage, /Target step snapshot: Print Stdin/);
  assert.match(coursePage, /Technical snapshot details/);
  // Dropdown should have selected option for historical version
  assert.match(coursePage, /value="ver-historical-1\|step-echo-1" selected/);
});

test('user detail implements one-action confirmation pattern with focused dialogs and clean entity summary (P33)', () => {
  // Case 1: Active user
  const activePage = renderAdminPage('/admin/users/user-ada-1', {
    user: {
      id: 'user-ada-1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.test',
      emailVerified: true,
      capabilities: ['student'],
      accountStatus: 'active',
      createdAt: '2026-09-01T00:00:00Z',
    },
    enrollments: [
      { courseId: 'course-py', title: 'Python Foundations', status: 'active', pinnedVersionId: 'v1' },
    ],
    privacyRequests: [],
  });

  // Identity and entity summary
  assert.match(activePage, /<h1 class="page-title">Ada Lovelace<\/h1>/);
  assert.match(activePage, /data-copy-text="user-ada-1"/);
  assert.match(activePage, /<span class="status-badge success">Verified<\/span>/);

  // Focused action entry points (buttons opening dialogs instead of open forms with passwords)
  assert.match(activePage, /data-open-dialog="dialog-suspend-user"/);
  assert.match(activePage, /data-open-dialog="dialog-manage-roles"/);
  assert.match(activePage, /data-open-dialog="dialog-support-access"/);

  // Suspend action dialog content
  assert.match(activePage, /<dialog id="dialog-suspend-user"/);
  assert.match(activePage, /Suspend Ada Lovelace/);
  assert.match(activePage, /<span class="status-badge danger">Suspended<\/span>/);
  assert.match(activePage, /Suspends account authentication and active sessions/);
  assert.match(activePage, /btn-danger/);

  // Case 2: Suspended user
  const suspendedPage = renderAdminPage('/admin/users/user-alan-1', {
    user: {
      id: 'user-alan-1',
      displayName: 'Alan Turing',
      email: 'alan@example.test',
      emailVerified: true,
      capabilities: ['student', 'author'],
      accountStatus: 'suspended',
      createdAt: '2026-09-01T00:00:00Z',
    },
    enrollments: [],
    privacyRequests: [],
  });

  // Shows restore action instead of suspend
  assert.match(suspendedPage, /data-open-dialog="dialog-restore-user"/);
  assert.doesNotMatch(suspendedPage, /data-open-dialog="dialog-suspend-user"/);
  assert.match(suspendedPage, /<dialog id="dialog-restore-user"/);
  assert.match(suspendedPage, /Restore Alan Turing/);
  assert.match(suspendedPage, /<span class="status-badge success">Active<\/span>/);
});

test('course detail uses focused dialogs for availability and waivers, and published versions summary (P34)', () => {
  const coursePage = renderAdminPage('/admin/courses/course-py', {
    id: 'course-py',
    title: 'Python Foundations',
    ownerName: 'Guido van Rossum',
    ownerEmail: 'guido@example.test',
    latestVersion: 2,
    activeEnrollments: 12,
    openReports: 0,
    isSuspended: false,
    versions: [
      { id: 'v1', versionNumber: 1, createdAt: '2026-09-01', steps: [] },
      { id: 'v2', versionNumber: 2, createdAt: '2026-09-15', steps: [{ id: 's1', title: 'Variables', isRequired: true }] },
    ],
  });

  // Heading and entity summary
  assert.match(coursePage, /<h1 class="page-title">Python Foundations<\/h1>/);
  assert.match(coursePage, /data-copy-text="course-py"/);

  // Action buttons opening focused dialogs
  assert.match(coursePage, /data-open-dialog="dialog-course-availability"/);
  assert.match(coursePage, /data-open-dialog="dialog-course-waiver"/);

  // Dialogs present
  assert.match(coursePage, /<dialog id="dialog-course-availability"/);
  assert.match(coursePage, /<dialog id="dialog-course-waiver"/);
  assert.match(coursePage, /Waive broken step · Python Foundations/);
  assert.match(coursePage, /Published versions/);
  assert.doesNotMatch(coursePage, /Immutable published releases/);
});

test('overview distinguishes execution admission from worker telemetry and avoids misleading green badges (P32)', () => {
  const overview = renderAdminPage('/admin', {
    refreshedAt: '2026-10-06T12:00:00Z',
    execution: { paused: false },
    queue: { queued: 0, running: 0, oldestQueuedAt: null },
    workers: { health: 'Unavailable', lastObservedAt: null },
    internalErrors: 0,
    openReports: 1,
    emailDeliveryIssues: 0,
    email: { status: 'No delivery data', lastSentAt: null },
    telemetry: { queue: 'available', workerHeartbeat: 'unavailable', email: 'no data', internalErrorRate: 'available' },
  });

  // Distinguishes "Accepting jobs" from repeating "Available"
  assert.match(overview, /Accepting jobs/);
  // Email delivery with no data remains neutral "No telemetry", not green Normal
  assert.match(overview, /No telemetry/);
  assert.doesNotMatch(overview, /<span class="status-badge success">Normal<\/span>/);
  // Runner telemetry shortened metric value to Unknown/Unavailable with short supporting reason
  assert.doesNotMatch(overview, /Runner heartbeat/);
  // Attention section for open report
  assert.match(overview, /1 open report/);
});

test('media and execution empty states omit redundant zero-count footer (P37, P38)', () => {
  const media = renderAdminPage('/admin/media', { items: [] });
  assert.match(media, /<h1 class="page-title">Media<\/h1>/);
  assert.match(media, /No media assets\./);
  assert.doesNotMatch(media, /Showing 0–0 of 0/);

  const execution = renderAdminPage('/admin/execution', {
    overview: {
      execution: { paused: false },
      queue: { queued: 0, running: 0, oldestQueuedAt: null },
      workers: { health: 'Unavailable', lastObservedAt: null },
    },
    jobs: { items: [], total: 0, limit: 20 },
  });
  assert.match(execution, /<h1 class="page-title">Execution<\/h1>/);
  assert.match(execution, /Pause new runs…/);
  assert.match(execution, /No execution jobs in this time range\./);
  assert.doesNotMatch(execution, /Showing 0–0 of 0/);
});

test('adminStyles scopes generic selectors under .shell-admin and sets dialog containment', async () => {
  const { adminStyles } = await import('../src/pages/admin/admin-styles.ts');
  assert.match(adminStyles, /\.shell-admin \.data-table-wrapper/);
  assert.match(adminStyles, /\.shell-admin \.data-table/);
  assert.match(adminStyles, /\.shell-admin \.search-input-wrapper/);
  assert.match(adminStyles, /\.shell-admin \.status-badge/);
  assert.match(adminStyles, /\.shell-admin \.form-error/);
  assert.match(adminStyles, /max-height: calc\(100vh - 48px\)/);
  assert.match(adminStyles, /max-height: calc\(100vh - 180px\)/);
});

test('categories page separates edit and remove actions into focused dialogs (D1)', () => {
  const html = renderAdminPage('/admin/categories', {
    items: [
      { id: 'cat-prog', name: 'Programming', slug: 'programming', usageCount: 2 },
      { id: 'cat-math', name: 'Mathematics', slug: 'mathematics', usageCount: 0 },
    ],
  });

  // Table rows contain both Edit and separate Remove action buttons
  assert.match(html, /data-edit-category-id="cat-prog"/);
  assert.match(html, /data-remove-category-id="cat-prog"/);
  assert.match(html, /data-edit-category-name="Programming"/);
  assert.match(html, /data-remove-category-name="Programming"/);
  assert.match(html, /data-edit-category-usage="2"/);
  assert.match(html, /data-remove-category-usage="2"/);

  // Remove button is styled as danger button with compact height
  assert.match(html, /class="btn btn-danger btn-compact" data-remove-category-id="cat-prog"/);

  // Edit dialog is a short, focused rename dialog
  assert.match(html, /<dialog id="edit-category-dialog" class="admin-modal-dialog" aria-labelledby="edit-category-title">/);
  assert.match(html, /<h3 id="edit-category-title" class="dialog-title">Edit category<\/h3>/);
  assert.match(html, /<input id="edit-category-name" class="form-input" name="name" required>/);
  assert.match(html, /<button class="btn btn-primary" type="submit">Save category<\/button>/);
  // Edit dialog must NOT contain deletion controls or replacement input
  const editDialogMatch = html.match(/<dialog id="edit-category-dialog"[^>]*>([\s\S]*?)<\/dialog>/);
  assert.ok(editDialogMatch, 'Edit dialog must exist');
  const editDialogHtml = editDialogMatch[1];
  assert.doesNotMatch(editDialogHtml, /id="delete-category-form"/);
  assert.doesNotMatch(editDialogHtml, /name="replacementId"/);
  assert.doesNotMatch(editDialogHtml, /Remove category/);

  // Remove category dialog is a separate, focused confirmation modal
  assert.match(html, /<dialog id="remove-category-dialog" class="admin-modal-dialog" aria-labelledby="remove-category-title"/);
  assert.match(html, /<h3 id="remove-category-title" class="dialog-title">Remove category<\/h3>/);
  assert.match(html, /id="remove-category-target-name"/);
  assert.match(html, /id="remove-category-target-usage"/);
  assert.match(html, /id="remove-category-consequence-warning"/);

  // Replacement category select dropdown is present
  assert.match(html, /<select id="edit-category-replacement-select" class="form-select form-input" name="replacementId">/);
  assert.match(html, /<option value="">Select a replacement category…<\/option>/);

  // Destructive primary action button and accessible controls
  assert.match(html, /<button class="btn btn-danger" type="submit">Remove category<\/button>/);
  assert.match(html, /<button type="button" class="btn btn-secondary" data-close-dialog>Cancel<\/button>/);
  assert.match(html, /<button type="button" class="dialog-close-btn" data-close-dialog aria-label="Close dialog">/);
  assert.match(html, /<p class="form-error hidden" role="alert"><\/p>/);
});
