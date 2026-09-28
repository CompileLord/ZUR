import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderAgentActivityPage,
  type ActivityItem,
  type MutationDetail,
} from '../src/pages/author/AgentActivityPage.ts';
import {
  renderCourseBuilderPage,
  type ModuleSummary,
} from '../src/pages/author/CourseBuilderPage.ts';

test('Agent Activity and Builder Update UI (P45, T067)', async (t) => {
  const courseId = 'course-python-foundations';
  const courseTitle = 'Python Foundations';

  const sampleActivities: ActivityItem[] = [
    {
      id: 'mut-1',
      tokenId: 'tok-1',
      tokenLabel: 'Course Writer Agent',
      toolName: 'batch_author',
      baseRevision: 1,
      newRevision: 2,
      affectedEntities: {
        operations_applied: 4,
        affected_entities: ['mod-1', 'les-1', 'step-1', 'step-2'],
      },
      outcome: 'success',
      correlationId: 'corr-batch-101',
      createdAt: '2026-09-24T12:00:00.000Z',
    },
    {
      id: 'mut-2',
      tokenId: 'tok-2',
      tokenLabel: 'Exercise Fixer Bot',
      toolName: 'update_step',
      baseRevision: 2,
      newRevision: 3,
      affectedEntities: ['step-2'],
      outcome: 'success',
      correlationId: 'corr-step-102',
      createdAt: '2026-09-24T12:15:00.000Z',
    },
  ];

  const sampleMutationDetail: MutationDetail = {
    ...sampleActivities[1],
    courseId,
    idempotencyKey: 'idem-step-fix-01',
    priorContent: {
      title: 'Initial Code',
      code: 'def add(a, b):\n    return a - b\n',
    },
    newContent: {
      title: 'Fixed Code',
      code: 'def add(a, b):\n    return a + b\n',
    },
  };

  const sampleModules: ModuleSummary[] = [
    {
      id: 'mod-1',
      courseId,
      title: 'Getting Started',
      position: 0,
      lessons: [
        {
          id: 'les-1',
          moduleId: 'mod-1',
          title: 'Syntax Basics',
          position: 0,
          steps: [
            {
              id: 'step-1',
              lessonId: 'les-1',
              type: 'theory',
              title: 'Welcome to Python',
              position: 0,
              isRequired: true,
              estimatedDurationMinutes: 5,
            },
          ],
        },
      ],
    },
  ];

  await t.test('P45: Renders empty state when no agent activity exists', () => {
    const html = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      activities: [],
    });

    assert.ok(html.includes('Agent Activity'));
    assert.ok(html.includes('No agent activity recorded'));
    assert.ok(html.includes('Return to Course Builder'));
    assert.ok(html.includes('/teach/course-python-foundations/content'));
  });

  await t.test('P45: Renders populated activity table with token label, tool, and revision bump', () => {
    const html = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      activities: sampleActivities,
      totalActivities: 2,
    });

    assert.ok(html.includes('Course Writer Agent'));
    assert.ok(html.includes('Batch authoring'));
    assert.ok(html.includes('Exercise Fixer Bot'));
    assert.ok(html.includes('Update step content'));
    assert.ok(html.includes('r1 → r2'));
    assert.ok(html.includes('r2 → r3'));
    assert.ok(html.includes('Success'));
    assert.ok(html.includes('View diff'));
    assert.ok(html.includes('aria-label="View diff for mutation mut-2"'));
  });

  await t.test('P45: Renders filter toolbar with operations and outcomes', () => {
    const html = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      activities: sampleActivities,
      filterTool: 'batch_author',
      filterOutcome: 'success',
    });

    assert.ok(html.includes('id="filter-tool"'));
    assert.ok(html.includes('id="filter-outcome"'));
    assert.ok(html.includes('Apply filters'));
    assert.ok(html.includes('selected>Batch authoring</option>'));
  });

  await t.test('P45: Diff Drawer modal displays side-by-side/unified diff with accessible markers and restore action', () => {
    const html = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      activities: sampleActivities,
      selectedMutation: sampleMutationDetail,
    });

    assert.ok(html.includes('role="dialog"'));
    assert.ok(html.includes('aria-modal="true"'));
    assert.ok(html.includes('Mutation Diff — Update step content'));
    assert.ok(html.includes('Applied by <strong>Exercise Fixer Bot</strong>'));
    assert.ok(html.includes('Revision bump:</strong> <code>r2 → r3</code>'));
    assert.ok(html.includes('Correlation ID:</strong> <code>corr-step-102</code>'));

    // Check accessible visual diff markers (+ and -) and colored spans
    assert.ok(html.includes('diff-deletion'));
    assert.ok(html.includes('diff-addition'));
    assert.ok(html.includes('>-</span>'));
    assert.ok(html.includes('>+</span>'));

    // Check Restore button in drawer
    assert.ok(html.includes('Restore prior version (r2)'));
    assert.ok(html.includes('id="restore-prior-btn"'));
  });

  await t.test('P45: Restore Confirmation Dialog renders mandatory consequence warning (design §874)', () => {
    const html = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      activities: sampleActivities,
      selectedMutation: sampleMutationDetail,
      showRestoreConfirmModal: true,
    });

    assert.ok(html.includes('role="alertdialog"'));
    assert.ok(html.includes('Restore Previous Draft Revision?'));
    assert.ok(html.includes('Revision 2'));
    assert.ok(html.includes("Published versions, student progress, and live access settings won't be rolled back."));
    assert.ok(html.includes('id="confirm-restore-btn"'));
    assert.ok(html.includes('Cancel'));
  });

  await t.test('P45: Redacts access tokens, signed URLs, and hidden tests in diff comparison', () => {
    const sensitiveMutation: MutationDetail = {
      ...sampleActivities[1],
      courseId,
      priorContent: {
        token: 'secret-token-12345',
        signedUrl: 'https://storage.googleapis.com/bucket/asset.png?signature=secret',
        testCases: [
          { stdin: '10', expectedStdout: '20', isHidden: false },
          { stdin: 'secret_in', expectedStdout: 'secret_out', isHidden: true },
        ],
      },
      newContent: {
        token: 'secret-token-67890',
        signedUrl: 'https://storage.googleapis.com/bucket/asset2.png?signature=secret2',
        testCases: [
          { stdin: '10', expectedStdout: '20', isHidden: false },
          { stdin: 'secret_in2', expectedStdout: 'secret_out2', isHidden: true },
        ],
      },
    };

    const html = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      activities: [sensitiveMutation],
      selectedMutation: sensitiveMutation,
    });

    assert.ok(!html.includes('secret-token-12345'), 'Raw access token must not be rendered');
    assert.ok(!html.includes('secret_in'), 'Raw hidden test stdin must not be rendered');
    assert.ok(!html.includes('secret_out'), 'Raw hidden test stdout must not be rendered');
    assert.ok(html.includes('[REDACTED]'), 'Secret fields are redacted');
    assert.ok(html.includes('[HIDDEN TEST]'), 'Hidden test cases are redacted');
  });

  await t.test('P45: Renders honest recovery retention notice when no recovery snapshot exists for revision', () => {
    const html = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      activities: sampleActivities,
      selectedMutation: sampleMutationDetail,
      recoveryRevisions: [], // explicitly empty: no retained snapshot
    });

    assert.ok(!html.includes('id="restore-prior-btn"'), 'Must not render active restore button when no snapshot is retained');
    assert.ok(html.includes('Recovery snapshot not retained for Revision 2'), 'Must explain retention policy honestly');
  });

  await t.test('P45: Renders active restore button and dialog when recovery snapshot is retained', () => {
    const html = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      activities: sampleActivities,
      selectedMutation: sampleMutationDetail,
      recoveryRevisions: [
        {
          id: 'rec-snap-2',
          courseId,
          revisionNumber: 2,
          createdBy: 'author-1',
          reason: 'Auto-backup before batch edit',
          createdAt: '2026-09-24T12:10:00.000Z',
        },
      ],
      showRestoreConfirmModal: true,
    });

    assert.ok(html.includes('id="restore-prior-btn"'), 'Renders active restore button when snapshot exists');
    assert.ok(html.includes('action="/api/author/courses/course-python-foundations/recovery/rec-snap-2/restore"'));
    assert.ok(html.includes('id="confirm-restore-btn"'));
  });

  await t.test('P45: Renders responsive mobile card layout with operation, outcome, revision, and view diff link', () => {
    const html = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      activities: sampleActivities,
      totalActivities: 2,
    });

    assert.ok(html.includes('class="activity-mobile-list"'));
    assert.ok(html.includes('activity-mobile-card'));
    assert.ok(html.includes('Course Writer Agent'));
    assert.ok(html.includes('Batch authoring'));
    assert.ok(html.includes('r1 → r2'));
    assert.ok(html.includes('href="/teach/course-python-foundations/activity?mutationId=mut-1"'));
    assert.ok(html.includes('aria-label="View diff for mutation mut-1"'));
  });

  await t.test('P45: Renders recoveryError notice in diff drawer and modal when recovery check fails', () => {
    const htmlDrawer = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      activities: sampleActivities,
      selectedMutation: sampleMutationDetail,
      recoveryError: 'Database connection timed out',
    });

    assert.ok(htmlDrawer.includes('id="recovery-fetch-error-msg"'));
    assert.ok(htmlDrawer.includes('Unable to check recovery snapshots: Database connection timed out'));
    assert.ok(!htmlDrawer.includes('id="restore-prior-btn"'), 'Cannot restore when recovery check failed');

    const htmlModal = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      activities: sampleActivities,
      selectedMutation: sampleMutationDetail,
      recoveryError: 'Database connection timed out',
      showRestoreConfirmModal: true,
    });

    assert.ok(htmlModal.includes('Recovery Service Unavailable'));
    assert.ok(htmlModal.includes('Could not verify draft recovery snapshots: Database connection timed out'));
    assert.ok(!htmlModal.includes('id="confirm-restore-btn"'), 'Cannot confirm restore when recovery service is unavailable');
  });

  await t.test('P22: CourseBuilderPage renders Recent changes button in tree header', () => {
    const html = renderCourseBuilderPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      modules: sampleModules,
    });

    assert.ok(html.includes('/teach/course-python-foundations/activity'));
    assert.ok(html.includes('Recent changes'));
  });

  await t.test('P22: CourseBuilderPage renders quiet remote update notice without local unsaved changes', () => {
    const html = renderCourseBuilderPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      modules: sampleModules,
      remoteUpdate: {
        agentName: 'Claude Builder Agent',
        timestampText: '2 minutes ago',
        newRevision: 4,
        hasLocalEdits: false,
      },
    });

    assert.ok(html.includes('role="status"'));
    assert.ok(html.includes('Updated through <strong>Claude Builder Agent</strong> · 2 minutes ago'));
    assert.ok(html.includes('(Revision 4)'));
    assert.ok(html.includes('View changes'));
    assert.ok(html.includes('id="load-update-btn"'));
  });

  await t.test('P22: CourseBuilderPage preserves local edits notice during remote update', () => {
    const html = renderCourseBuilderPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      modules: sampleModules,
      remoteUpdate: {
        agentName: 'Claude Builder Agent',
        timestampText: 'just now',
        newRevision: 5,
        hasLocalEdits: true,
      },
    });

    assert.ok(html.includes('Unsaved local changes preserved. Review differences before replacing.'));
    assert.ok(html.includes('id="resolve-conflict-btn"'));
  });

  await t.test('P22: CourseBuilderPage safely handles remotely deleted selected nodes', () => {
    // Missing step
    const missingStepHtml = renderCourseBuilderPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      modules: sampleModules,
      selectedType: 'step',
      selectedId: 'step-deleted-remotely',
    });

    assert.ok(missingStepHtml.includes('Selected step was deleted'));
    assert.ok(missingStepHtml.includes('Return to course overview'));

    // Missing module
    const missingModuleHtml = renderCourseBuilderPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      modules: sampleModules,
      selectedType: 'module',
      selectedId: 'mod-deleted-remotely',
    });

    assert.ok(missingModuleHtml.includes('Selected module was deleted'));

    // Missing lesson
    const missingLessonHtml = renderCourseBuilderPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      modules: sampleModules,
      selectedType: 'lesson',
      selectedId: 'les-deleted-remotely',
    });

    assert.ok(missingLessonHtml.includes('Selected lesson was deleted'));
  });

  await t.test('P45: Renders Connection and Date filters in toolbar', () => {
    const html = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      activities: sampleActivities,
      connections: [
        { id: 'tok-1', label: 'Course Writer Agent' },
        { id: 'tok-2', label: 'Exercise Fixer Bot' },
      ],
      filterConnection: 'tok-2',
      filterDate: '2026-09-24',
    });

    assert.ok(html.includes('id="filter-connection"'));
    assert.ok(html.includes('id="filter-date"'));
    assert.ok(html.includes('value="tok-2" selected'));
    assert.ok(html.includes('value="2026-09-24"'));
    assert.ok(html.includes('Exercise Fixer Bot</option>'));
  });

  await t.test('P45: Formats human-readable timestamps (<time>) and concrete content labels (no raw UUIDs)', () => {
    const rawUuidMutation: ActivityItem = {
      id: 'mut-uuid-1',
      tokenId: 'tok-1',
      tokenLabel: 'Agent Bot',
      toolName: 'update_step',
      baseRevision: 1,
      newRevision: 2,
      affectedEntities: ['f84f00c5-2f86-42d4-9b08-c3d6905e889d'],
      outcome: 'success',
      createdAt: '2026-09-28T05:19:27.564Z',
    };

    const html = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      activities: [rawUuidMutation],
    });

    // Check <time> element and formatted date
    assert.ok(html.includes('<time datetime="2026-09-28T05:19:27.564Z"'));
    assert.ok(html.includes('Sep 28, 2026'));

    // Check concrete label used instead of raw UUID
    assert.ok(!html.includes('f84f00c5-2f86-42d4-9b08-c3d6905e889d'));
    assert.ok(html.includes('Step content'));
  });

  await t.test('P45: Renders field-level before/after cards and low-emphasis technical identifiers details', () => {
    const html = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      activities: sampleActivities,
      selectedMutation: sampleMutationDetail,
    });

    // Check field-level diff cards
    assert.ok(html.includes('class="field-level-diff"'));
    assert.ok(html.includes('Starter Code') || html.includes('Markdown Content') || html.includes('field-diff-card'));

    // Check technical identifiers in details element
    assert.ok(html.includes('details class="drawer-technical-details'));
    assert.ok(html.includes('Technical identifiers'));
    assert.ok(html.includes('Correlation ID:</strong> <code>corr-step-102</code>'));
    assert.ok(html.includes('Idempotency key:</strong> <code>idem-step-fix-01</code>'));
  });

  await t.test('P45: Renders inline accessible conflict dialog when restoreConflict is provided', () => {
    const html = renderAgentActivityPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      activities: sampleActivities,
      selectedMutation: sampleMutationDetail,
      showRestoreConfirmModal: true,
      restoreConflict: {
        message: 'The course draft has been modified since it was loaded. Please review changes before restoring.',
      },
    });

    assert.ok(html.includes('id="restore-conflict-msg"'));
    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes('aria-live="assertive"'));
    assert.ok(html.includes('Revision Conflict (Concurrent modification detected)'));
    assert.ok(html.includes('id="btn-reload-current-revision"'));
    assert.ok(html.includes('id="confirm-restore-btn" disabled'));
  });
});
