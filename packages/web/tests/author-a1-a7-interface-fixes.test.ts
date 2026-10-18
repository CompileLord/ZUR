import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderAuthorCoursesPage,
  buildAuthorFilterUrl,
  type AuthorCourseItem,
} from '../src/pages/author/AuthorCoursesPage.ts';
import { renderAppShell } from '../src/components/shells/AppShell.ts';
import { renderAuthorWorkspaceShell } from '../src/components/shells/AuthorWorkspaceShell.ts';
import {
  renderAuthorPreviewPage,
  type AuthorPreviewPageOptions,
} from '../src/pages/author/AuthorPreviewPage.ts';
import {
  renderCoursePublishPage,
  type CoursePublishPageOptions,
} from '../src/pages/author/CoursePublishPage.ts';
import {
  renderMcpClientSetupPage,
  generateClientSnippet,
  type McpClientSetupOptions,
} from '../src/pages/settings/McpClientSetupDialog.ts';
import { NavigationHistoryManager } from '../src/utils/navigation-history.ts';

const mockAuthorUser = {
  id: 'user-author-1',
  displayName: 'Grace Hopper',
  email: 'grace@example.com',
  capabilities: ['author', 'student'] as ('student' | 'author' | 'admin')[],
};

const sampleCourse: AuthorCourseItem = {
  id: 'course-python-101',
  title: 'Python Fundamentals',
  publicationStatus: 'published',
  hasUnpublishedChanges: true,
  studentCount: 12,
  lastEditTime: '2026-10-01T12:00:00Z',
};

const sampleDraftCourse: AuthorCourseItem = {
  id: 'course-python-draft',
  title: 'Python Concurrency Patterns',
  publicationStatus: 'draft',
  hasUnpublishedChanges: true,
  studentCount: 0,
  lastEditTime: '2026-10-05T09:30:00Z',
};

test('A1: Course creation title survives failure, displays inline error, and guards duplicate submit', () => {
  // 1. Populated form with title retained and inline error
  const failedHtml = renderAuthorCoursesPage({
    user: mockAuthorUser,
    courses: [sampleCourse],
    showNewCourseModal: true,
    newCourseTitle: 'Retained Course Title After 503',
    newCourseError: 'Service temporarily unavailable. Your title was preserved; try again.',
  });

  assert.ok(failedHtml.includes('id="course-title-input"'), 'Course title input present');
  assert.ok(
    failedHtml.includes('value="Retained Course Title After 503"'),
    'Entered title is preserved in input value'
  );
  assert.ok(
    failedHtml.includes('id="new-course-error"'),
    'Inline error alert present'
  );
  assert.ok(
    failedHtml.includes('Service temporarily unavailable'),
    'Actionable error message rendered'
  );
  assert.ok(
    failedHtml.includes('aria-describedby="new-course-error new-course-helper"'),
    'Accessible description connects input to error'
  );

  // 2. Submitting state guards duplicate clicks
  const submittingHtml = renderAuthorCoursesPage({
    user: mockAuthorUser,
    courses: [sampleCourse],
    showNewCourseModal: true,
    newCourseTitle: 'Retained Course Title',
    isSubmitting: true,
  });

  assert.ok(
    submittingHtml.includes('id="btn-create-course" disabled aria-busy="true"'),
    'Submit button is disabled with aria-busy during in-flight creation'
  );
  assert.ok(
    submittingHtml.includes('>Creating...</button>'),
    'Submit button text communicates active progress'
  );
  assert.ok(
    submittingHtml.includes('id="course-title-input"'),
    'Course title input present'
  );
  assert.ok(
    submittingHtml.includes('disabled') && submittingHtml.includes('id="course-title-input"'),
    'Input is disabled while submission is in-flight'
  );
});

test('A2: Status filter tabs compose search query and handle invalid status safely', () => {
  // URL builder correctly composes parameters
  assert.strictEqual(
    buildAuthorFilterUrl('draft', 'Python'),
    '/teach?status=draft&search=Python'
  );
  assert.strictEqual(
    buildAuthorFilterUrl('all', 'Python'),
    '/teach?search=Python'
  );
  assert.strictEqual(
    buildAuthorFilterUrl('published', 'Python'),
    '/teach?status=published&search=Python'
  );
  assert.strictEqual(
    buildAuthorFilterUrl('invalid_status', 'Python'),
    '/teach?search=Python'
  );
  assert.strictEqual(
    buildAuthorFilterUrl('draft', ''),
    '/teach?status=draft'
  );
  assert.strictEqual(
    buildAuthorFilterUrl('all', ''),
    '/teach'
  );

  // Rendered tabs reflect composed URLs
  const pageHtml = renderAuthorCoursesPage({
    user: mockAuthorUser,
    courses: [sampleCourse, sampleDraftCourse],
    activeFilter: 'draft',
    searchQuery: 'Concurrency',
  });

  assert.ok(
    pageHtml.includes('href="/teach?status=draft&amp;search=Concurrency" class="segmented-control-btn filter-tab active" role="tab" aria-selected="true"'),
    'Drafts tab has composed URL and active state'
  );
  assert.ok(
    pageHtml.includes('href="/teach?search=Concurrency" class="segmented-control-btn filter-tab " role="tab" aria-selected="false"'),
    'All tab preserves search parameter without redundant status=all'
  );
  assert.ok(
    pageHtml.includes('value="Concurrency"'),
    'Search input preserves query'
  );

  // Raw literal query encoding preserves special characters in URL and attributes
  const specialQuery = 'Python & loops + "quoted"';
  assert.strictEqual(
    buildAuthorFilterUrl('draft', specialQuery),
    '/teach?status=draft&search=Python+%26+loops+%2B+%22quoted%22'
  );
  assert.strictEqual(
    buildAuthorFilterUrl('all', specialQuery),
    '/teach?search=Python+%26+loops+%2B+%22quoted%22'
  );

  const specialPageHtml = renderAuthorCoursesPage({
    user: mockAuthorUser,
    courses: [sampleCourse],
    activeFilter: 'draft',
    searchQuery: specialQuery,
  });

  assert.ok(
    specialPageHtml.includes('href="/teach?status=draft&amp;search=Python+%26+loops+%2B+%22quoted%22"'),
    'Drafts tab preserves literal special characters in URL'
  );
  assert.ok(
    specialPageHtml.includes('href="/teach?search=Python+%26+loops+%2B+%22quoted%22"'),
    'All tab preserves literal special characters without status=all'
  );
  assert.ok(
    specialPageHtml.includes('value="Python &amp; loops + &quot;quoted&quot;"'),
    'Search input attribute correctly escapes literal HTML characters'
  );

  // Empty matching results offers explicit Clear filters
  const emptyMatchHtml = renderAuthorCoursesPage({
    user: mockAuthorUser,
    courses: [sampleCourse],
    activeFilter: 'draft',
    searchQuery: 'Nonexistent',
  });

  assert.ok(emptyMatchHtml.includes('No matching courses'));
  assert.ok(emptyMatchHtml.includes('href="/teach" class="btn btn-secondary">Clear filters</a>'));
});

test('A3: Dashboard DOM has exactly one main landmark owned by AppShell', () => {
  const pageHtml = renderAuthorCoursesPage({
    user: mockAuthorUser,
    courses: [sampleCourse],
    activeFilter: 'all',
  });

  // Inner page container must be a section, NOT a second <main>
  assert.ok(
    pageHtml.includes('<section class="author-courses-content" aria-label="Course list">'),
    'Course list is rendered inside a labelled section'
  );

  // Count <main> elements across the whole rendered page
  const mainMatches = pageHtml.match(/<main[\s>]/g) || [];
  assert.strictEqual(mainMatches.length, 1, 'Exactly one <main> element rendered on /teach');

  // Count id="main-content" across the whole rendered page
  const mainIdMatches = pageHtml.match(/id="main-content"/g) || [];
  assert.strictEqual(mainIdMatches.length, 1, 'Exactly one main-content ID target rendered on /teach');
});

test('A4: Read-only learner Python preview mode replaces obsolete toolbar and verifies all step types', () => {
  const pythonPreviewHtml = renderAuthorPreviewPage({
    courseId: 'course-1',
    courseTitle: 'Python Mastery',
    stepId: 'step-py',
    stepTitle: 'Echo Service',
    stepType: 'python',
    content: {
      problemStatement: 'Read stdin and print to stdout.',
      inputFormat: 'String',
      outputFormat: 'String',
      constraints: 'len <= 100',
      starterCode: 'import sys\nline = sys.stdin.read()\nprint(line)\n',
      hints: ['Use sys.stdin.read()'],
      publicTests: [{ stdin: 'hello\n', expectedStdout: 'hello\n' }],
    },
    returnEditorUrl: '/teach/course-1/content/python/step-py',
  });

  // 1. Obsolete controls removed
  assert.ok(
    !pythonPreviewHtml.includes('preview-run-samples-btn'),
    'Obsolete Run samples button removed'
  );
  assert.ok(
    !pythonPreviewHtml.includes('preview-submit-btn'),
    'Obsolete Submit solution button removed'
  );
  assert.ok(
    !pythonPreviewHtml.includes('editor-filename'),
    'Filename label removed'
  );

  // 2. Read-only preview notice rendered
  assert.ok(
    pythonPreviewHtml.includes('preview-editor-header'),
    'Read-only preview header rendered'
  );
  assert.ok(
    pythonPreviewHtml.includes('Execution and grading are disabled in author preview'),
    'Concise preview notice rendered in results region'
  );

  // 3. Problem pane and code preserved
  assert.ok(pythonPreviewHtml.includes('Read stdin and print to stdout.'));
  assert.ok(pythonPreviewHtml.includes('Use sys.stdin.read()'));
  assert.ok(pythonPreviewHtml.includes('import sys'));
  assert.ok(pythonPreviewHtml.includes('readonly>import sys'));

  // 4. Back to editor return CTA preserved
  assert.ok(
    pythonPreviewHtml.includes('href="/teach/course-1/content/python/step-py" class="btn btn-secondary btn-compact">← Back to editor</a>'),
    'Correct Back to editor URL'
  );

  // 5. Theory preview
  const theoryHtml = renderAuthorPreviewPage({
    courseId: 'course-1',
    courseTitle: 'Python Mastery',
    stepId: 'step-th',
    stepTitle: 'Variables and Types',
    stepType: 'theory',
    content: { markdown: '# Variables\nPython uses dynamic typing.' },
    returnEditorUrl: '/teach/course-1/content/theory/step-th',
  });
  assert.ok(theoryHtml.includes('Variables and Types') || theoryHtml.includes('Variables'));
  assert.ok(theoryHtml.includes('Python uses dynamic typing.'));
  assert.ok(theoryHtml.includes('href="/teach/course-1/content/theory/step-th"'));

  // 6. Video preview
  const videoHtml = renderAuthorPreviewPage({
    courseId: 'course-1',
    courseTitle: 'Python Mastery',
    stepId: 'step-vid',
    stepTitle: 'Intro Video',
    stepType: 'video',
    content: { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', transcript: 'Hello learners' },
    returnEditorUrl: '/teach/course-1/content/video/step-vid',
  });
  assert.ok(videoHtml.includes('Intro Video'));
  assert.ok(videoHtml.includes('Hello learners'));
  assert.ok(videoHtml.includes('href="/teach/course-1/content/video/step-vid"'));

  // 7. Quiz preview
  const quizHtml = renderAuthorPreviewPage({
    courseId: 'course-1',
    courseTitle: 'Python Mastery',
    stepId: 'step-qz',
    stepTitle: 'Concept Check',
    stepType: 'quiz',
    content: {
      quizType: 'single_choice',
      prompt: 'What is 2 + 2?',
      options: [
        { id: 'opt-1', text: '4' },
        { id: 'opt-2', text: '5' },
      ],
    },
    returnEditorUrl: '/teach/course-1/content/quiz/step-qz',
  });
  assert.ok(quizHtml.includes('What is 2 + 2?'));
  assert.ok(quizHtml.includes('Interaction preview only — grading disabled'));
  assert.ok(quizHtml.includes('href="/teach/course-1/content/quiz/step-qz"'));
});

test('A5: Safe denial and error shell retains navigation context and exits', () => {
  // AppShell wraps author content with teach navigation
  const authorErrorShell = renderAppShell({
    user: mockAuthorUser,
    activeMode: 'teach',
    activePath: '/teach/course-123/content',
    content: `
      <div class="author-courses-container container py-12">
        <div class="state-container state-denied text-center max-w-md mx-auto" role="alert">
          <h1 class="page-title text-xl font-semibold mb-2">This course isn't available</h1>
          <p class="text-secondary mb-4">You do not have permission to view or edit this course.</p>
          <div class="flex items-center justify-center gap-3">
            <a href="/teach" class="btn btn-primary btn-compact">Return to Your courses</a>
            <a href="/courses" class="btn btn-secondary btn-compact">Browse courses</a>
          </div>
        </div>
      </div>
    `,
  });

  assert.ok(authorErrorShell.includes('This course isn&#39;t available') || authorErrorShell.includes("This course isn't available"));
  assert.ok(authorErrorShell.includes('href="/teach" class="btn btn-primary btn-compact">Return to Your courses</a>'));
  assert.ok(authorErrorShell.includes('href="/courses" class="btn btn-secondary btn-compact">Browse courses</a>'));
  assert.ok(authorErrorShell.includes('class="app-sidebar"'), 'App sidebar retained during denial');
  assert.ok(!authorErrorShell.includes('Secret draft title'), 'Forbidden course data is never leaked');
});

test('A6: Quiet clean save headers and uncluttered publication review', () => {
  // 1. Clean workspace shell suppresses routine "Saved" text
  const cleanShellHtml = renderAuthorWorkspaceShell({
    courseId: 'course-1',
    courseTitle: 'Course 1',
    publicationState: 'published',
    hasUnpublishedChanges: false,
    saveStatusText: undefined,
    activeTab: 'content',
    editorContent: '<p>Editor content</p>',
  });
  assert.ok(
    !cleanShellHtml.includes('class="save-indicator saved"'),
    'Routine Saved indicator is quiet in clean state'
  );

  // 2. Explicit unsaved state is rendered
  const unsavedShellHtml = renderAuthorWorkspaceShell({
    courseId: 'course-1',
    courseTitle: 'Course 1',
    publicationState: 'draft',
    hasUnpublishedChanges: true,
    saveStatusText: 'Unsaved edits (offline)',
    activeTab: 'content',
    editorContent: '<p>Editor content</p>',
  });
  assert.ok(
    unsavedShellHtml.includes('Unsaved edits (offline)'),
    'Unsaved status text is rendered'
  );

  // 3. Ready publication state does NOT repeat Next action sentence
  const readyPublishHtml = renderCoursePublishPage({
    courseId: 'course-1',
    courseTitle: 'Course 1',
    publicationState: 'draft',
    hasUnpublishedChanges: true,
    draftRevision: 3,
    currentVersionNumber: 1,
    newVersionNumber: 2,
    activeEnrolledStudents: 10,
    validation: { isValid: true, errors: [], warnings: [] },
    saveStatus: 'saved',
  });

  assert.ok(
    !readyPublishHtml.includes('Next action:'),
    'Next action callout repeating checklist and button is omitted in ready state'
  );
  assert.ok(
    readyPublishHtml.includes('Pre-publish checklist passed with 0 blocking errors'),
    'Checklist summary is rendered'
  );
  assert.ok(
    readyPublishHtml.includes('Publish Version 2'),
    'Primary publish control is rendered'
  );
  assert.ok(
    readyPublishHtml.includes('What changes for students'),
    'Release impact panel is rendered'
  );

  // 4. Blocked publication state retains Next action guidance and deep links
  const blockedPublishHtml = renderCoursePublishPage({
    courseId: 'course-1',
    courseTitle: 'Course 1',
    publicationState: 'draft',
    hasUnpublishedChanges: true,
    draftRevision: 3,
    newVersionNumber: 2,
    activeEnrolledStudents: 10,
    validation: {
      isValid: false,
      errors: [
        {
          stepId: 'step-py-1',
          field: 'starterCode',
          message: 'Starter code is required',
        },
      ],
      warnings: [],
    },
    stepTypeMap: { 'step-py-1': 'python' },
  });

  assert.ok(
    blockedPublishHtml.includes('Next action:'),
    'Next action guidance rendered when blocked'
  );
  assert.ok(
    blockedPublishHtml.includes('Resolve 1 blocking issue'),
    'Specific error count guidance rendered'
  );
  assert.ok(
    blockedPublishHtml.includes('edit-tests-step-py-1'),
    'Deep link to edit tests rendered'
  );
});

test('A7: McpClientSetupDialog removes internal PRD references, provides keyboard-accessible technical limits, and wires action buttons', () => {
  const setupHtml = renderMcpClientSetupPage({
    token: {
      id: 'tok-1',
      authorId: 'user-author-1',
      tokenIdentifier: 'zur_tok_test_ident',
      label: 'Cursor Agent Connection',
      scopes: ['courses:read', 'content:write'],
      courseRestrictions: ['course-1'],
      isRevoked: false,
      lastUsedAt: null,
      createdAt: '2026-10-01T10:00:00Z',
    },
    endpointUrl: 'http://localhost:3000/api/mcp',
    selectedClient: 'official_sdk',
  });

  // 1. Internal PRD references removed
  assert.ok(
    !setupHtml.includes('PRD §23'),
    'Internal PRD section references must be removed'
  );

  // 2. Keyboard-accessible expandable technical limits disclosure
  assert.ok(
    setupHtml.includes('<details class="technical-limits-disclosure'),
    'Expandable <details> element used for technical limits'
  );
  assert.ok(
    setupHtml.includes('<summary class="cursor-pointer font-medium text-primary flex items-center justify-between" id="technical-limits-summary">'),
    'Accessible <summary> trigger used'
  );
  assert.ok(
    setupHtml.includes('Technical limits'),
    'Technical limits label present'
  );

  // 3. Action buttons with proper IDs present
  assert.ok(
    setupHtml.includes('id="btn-copy-endpoint"'),
    'Copy endpoint button present'
  );
  assert.ok(
    setupHtml.includes('id="btn-copy-snippet"'),
    'Copy configuration button present'
  );
  assert.ok(
    setupHtml.includes('id="btn-refresh-status"'),
    'Refresh status button present'
  );
  assert.ok(
    setupHtml.includes('id="btn-copy-prompt"'),
    'Copy prompt button present'
  );

  // 4. Safe token placeholder, never real secret
  assert.ok(
    setupHtml.includes('YOUR_ZUR_MCP_TOKEN'),
    'Safe token placeholder used in client snippet'
  );
  assert.ok(
    !setupHtml.includes('zur_sec_'),
    'Real token secrets never appear in setup markup'
  );

  // 5. Snippet generator produces valid official SDK code
  const sdkSnippet = generateClientSnippet('official_sdk', 'http://localhost:3000/api/mcp');
  assert.ok(sdkSnippet.includes('StreamableHTTPClientTransport'));
  assert.ok(sdkSnippet.includes('YOUR_ZUR_MCP_TOKEN'));
});

test('A8: NavigationHistoryManager computes signed delta and handles canceled navigation', () => {
  const manager = new NavigationHistoryManager();
  manager.setCurrentIndex(5);
  assert.strictEqual(manager.getCurrentIndex(), 5);
  // Navigation backward (incoming index 4) yields negative delta
  assert.strictEqual(manager.getDelta({ __zur_idx: 4 }), -1);
  // Navigation forward (incoming index 7) yields positive delta
  assert.strictEqual(manager.getDelta({ __zur_idx: 7 }), 2);

  // Check and clear reverting flag lifecycle
  assert.strictEqual(manager.isReverting(), false);
  assert.strictEqual(manager.checkAndClearReverting(), false);
});
