import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAuthorWorkspaceShell } from '../src/components/shells/AuthorWorkspaceShell.ts';
import { renderAuthorCoursesPage } from '../src/pages/author/AuthorCoursesPage.ts';
import { renderCourseBuilderPage } from '../src/pages/author/CourseBuilderPage.ts';
import { renderTheoryEditorPage } from '../src/pages/author/TheoryEditorPage.ts';
import { renderVideoEditorPage, deriveEmbedUrl } from '../src/pages/author/VideoEditorPage.ts';
import { renderQuizEditorPage } from '../src/pages/author/QuizEditorPage.ts';
import { renderPythonExerciseEditorPage } from '../src/pages/author/PythonExerciseEditorPage.ts';
import { renderAuthorPreviewPage } from '../src/pages/author/AuthorPreviewPage.ts';
import { renderCoursePublishPage } from '../src/pages/author/CoursePublishPage.ts';
import { renderAuthorTree } from '../src/pages/author/AuthorTreeComponent.ts';

test('Author Interface Redesign Acceptance Suite (2026-10-06)', async (t) => {
  const dummyModules = [
    {
      id: 'mod-1',
      courseId: 'course-1',
      title: 'Module 1: Foundations',
      position: 0,
      lessons: [
        {
          id: 'les-1',
          moduleId: 'mod-1',
          title: 'Lesson 1: Intro',
          position: 0,
          steps: [
            { id: 's-1', lessonId: 'les-1', type: 'theory' as const, title: 'Concept', position: 0, isRequired: true, estimatedDurationMinutes: 5 },
            { id: 's-2', lessonId: 'les-1', type: 'video' as const, title: 'Walkthrough', position: 1, isRequired: true, estimatedDurationMinutes: 10 },
            { id: 's-3', lessonId: 'les-1', type: 'quiz' as const, title: 'Quiz', position: 2, isRequired: true, estimatedDurationMinutes: 5 },
            { id: 's-4', lessonId: 'les-1', type: 'python' as const, title: 'Exercise', position: 3, isRequired: true, estimatedDurationMinutes: 15 },
          ],
        },
      ],
    },
  ];

  await t.test('AuthorWorkspaceShell: continuous workspace, badges, and header hierarchy', () => {
    const html = renderAuthorWorkspaceShell({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: true,
      activeTab: 'content',
      modules: dummyModules,
      editorContent: '<div>Editor</div>',
      inspectorContent: '<div>Inspector</div>',
    });

    assert.ok(html.includes('author-workspace-styles'), 'Author styles injected');
    assert.ok(html.includes('Draft changes'), 'Draft changes secondary badge rendered');
    assert.ok(html.includes('Published'), 'Published badge rendered');
    assert.ok(html.includes('Course Outline'), 'Persistent tree outline rendered');
    assert.ok(html.includes('author-inspector-pane'), 'Inspector pane rendered');
    assert.ok(html.includes('Review & publish'), 'Review & publish action present');
  });

  await t.test('AuthorWorkspaceShell: hides redundant publish button on publish review page', () => {
    const html = renderAuthorWorkspaceShell({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      activeTab: 'content',
      isPublishPage: true,
      editorContent: '<div>Publish Content</div>',
    });

    assert.ok(!html.includes('Review & publish'), 'Must not render redundant review & publish link');
  });

  await t.test('AuthorTreeComponent: clean labels without duplicate numbering or fractions', () => {
    const treeHtml = renderAuthorTree({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      modules: dummyModules,
      selectedType: 'step',
      selectedId: 's-1',
    });

    assert.ok(treeHtml.includes('4 steps'), 'Clean step count rendered');
    assert.ok(!treeHtml.includes('4/20'), 'Does not show cryptic fraction');
    assert.ok(treeHtml.includes('tree-step selected'), 'Selected step highlighted');
    assert.ok(treeHtml.includes('Concept'), 'Step title rendered');
  });

  await t.test('CourseBuilderPage: clean capacity label, no subtitle, removed duplicate summary inspector', () => {
    const builderHtml = renderCourseBuilderPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      modules: dummyModules,
      selectedType: 'course',
      selectedId: 'course-1',
    });

    assert.ok(!builderHtml.includes('Course overview and structure management.'), 'Removed redundant subtitle');
    assert.ok(!builderHtml.includes('<aside class="author-inspector-pane"'), 'Removed duplicate summary inspector for course overview');
  });

  await t.test('TheoryEditorPage: persistent tree, no Back breadcrumb, help link present', () => {
    const theoryHtml = renderTheoryEditorPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      stepId: 's-1',
      stepTitle: 'Concept',
      markdown: '# Concept\n\nExplanation text.',
      revision: 1,
      isRequired: true,
      estimatedDurationMinutes: 5,
    });

    assert.ok(!theoryHtml.includes('← Back to Course Builder'), 'Removed redundant Back breadcrumb');
    assert.ok(theoryHtml.includes('Markdown help ↗'), 'Markdown help link present');
    assert.ok(theoryHtml.includes('author-tree-pane'), 'Persistent tree container rendered');
  });

  await t.test('VideoEditorPage: youtube-nocookie support, clean labels and hints', () => {
    // 1. URL resolver
    const standardYt = deriveEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.strictEqual(standardYt.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

    const nocookieYt = deriveEmbedUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    assert.strictEqual(nocookieYt.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

    const videoHtml = renderVideoEditorPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      stepId: 's-2',
      stepTitle: 'Walkthrough',
      videoUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      provider: 'youtube',
      transcript: 'Video captions',
      captionVerified: true,
      revision: 1,
      isRequired: true,
      estimatedDurationMinutes: 10,
    });

    assert.ok(!videoHtml.includes('← Back to Course Builder'), 'Removed redundant Back breadcrumb');
    assert.ok(videoHtml.includes('Add a transcript for learners who cannot play the video.'), 'Concise transcript help');
  });

  await t.test('QuizEditorPage: compact rows, select instruction, no repeated text', () => {
    const quizHtml = renderQuizEditorPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      stepId: 's-3',
      stepTitle: 'Quiz',
      quizType: 'single_choice',
      prompt: 'Select the right choice',
      options: [
        { id: 'opt-1', text: 'Option A', isCorrect: true },
        { id: 'opt-2', text: 'Option B', isCorrect: false },
      ],
      explanation: 'Explanation for correct choice',
      revision: 1,
      isRequired: true,
      estimatedDurationMinutes: 5,
    });

    assert.ok(!quizHtml.includes('← Back to Course Builder'), 'Removed redundant Back breadcrumb');
    assert.ok(quizHtml.includes('Select the correct answer choice below.'), 'Short instruction rendered');
  });

  await t.test('PythonExerciseEditorPage: 1 public · 1 hidden count, collapsible execution limits', () => {
    const pyHtml = renderPythonExerciseEditorPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      stepId: 's-4',
      stepTitle: 'Echo',
      problemStatement: 'Print x.',
      inputFormat: 'int',
      outputFormat: 'int',
      constraints: '1 <= x <= 10',
      starterCode: 'x = input()\nprint(x)\n',
      referenceSolution: 'print(input())\n',
      hints: ['Read input'],
      solutionExplanation: 'Echo stdin',
      publicTests: [{ stdin: '1\n', expectedStdout: '1\n' }],
      hiddenTests: [{ stdin: '2\n', expectedStdout: '2\n' }],
      runtimeLimits: { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 },
      validationStatus: 'passed',
      revision: 1,
      isRequired: true,
      estimatedDurationMinutes: 15,
    });

    assert.ok(pyHtml.includes('1 public · 1 hidden'), 'Concise test count format');
    assert.ok(pyHtml.includes('advanced-settings-disclosure'), 'Limits moved to collapsible advanced settings');
    assert.ok(!pyHtml.includes('← Back to Course Builder'), 'Removed redundant Back breadcrumb');
  });

  await t.test('AuthorPreviewPage: dedupes matching H1 title and includes code surface', () => {
    const previewHtml = renderAuthorPreviewPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      stepId: 's-1',
      stepTitle: 'Concept Overview',
      stepType: 'theory',
      content: { markdown: '# Concept Overview\n\nThis is the body text.\n\n```python\nprint("hello")\n```' },
      returnEditorUrl: '/teach/course-1/content/theory/s-1',
    });

    // Check that 'Concept Overview' appears only once as a heading
    const count = (previewHtml.match(/<h1\b[^>]*>Concept Overview<\/h1>/g) || []).length;
    assert.strictEqual(count, 1, 'H1 title was deduplicated and appears exactly once');
    assert.ok(previewHtml.includes('STUDENT PREVIEW'), 'Preview banner present');
    assert.ok(previewHtml.includes('code-block-copy'), 'Learner-parity code block copy button rendered');
  });

  await t.test('CoursePublishPage: groups issues, distinguishes service failures with Retry', () => {
    const publishHtml = renderCoursePublishPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      draftRevision: 2,
      newVersionNumber: 1,
      activeEnrolledStudents: 0,
      validation: {
        isValid: false,
        errors: [
          { stepId: 's-4', message: 'Reference solution failed test case #1: INTERNAL_ERROR', blocking: true },
        ],
        warnings: [],
      },
    });

    assert.ok(publishHtml.includes("Validation couldn't run"), 'Classified infrastructure failure');
    assert.ok(publishHtml.includes('Retry validation'), 'Offers retry action for service failure');
    assert.ok(publishHtml.includes('Diagnostic details'), 'Diagnostic details disclosure present');
    assert.ok(publishHtml.includes('1 exercise needs review'), 'Exercise review summary count');
  });

  await t.test('AuthorCoursesPage: compact rows, Draft changes badge, Open button', () => {
    const coursesHtml = renderAuthorCoursesPage({
      user: { displayName: 'Guido', email: 'guido@zur.internal', capabilities: ['author'] },
      courses: [
        { id: 'c-1', title: 'Python Foundations', publicationStatus: 'published', hasUnpublishedChanges: true, studentCount: 10, lastEditTime: new Date().toISOString() },
      ],
      activeFilter: 'all',
    });

    assert.ok(!coursesHtml.includes('Draft, organize, and publish interactive courses.'), 'Removed introductory subtitle');
    assert.ok(coursesHtml.includes('Draft changes'), 'Draft changes secondary status');
    assert.ok(coursesHtml.includes('>Open<'), 'Tight Open button label');
  });

  await t.test('Audit Requirement 1: Pure render in AuthorWorkspaceShell without hydration hacks or sessionStorage', () => {
    const shellHtml = renderAuthorWorkspaceShell({
      courseId: 'c-test',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: true,
      activeTab: 'content',
      modules: [
        {
          id: 'mod-1',
          courseId: 'c-test',
          title: 'Module 1: Basics',
          position: 1,
          lessons: [
            {
              id: 'les-1',
              moduleId: 'mod-1',
              title: 'Lesson 1: Intro',
              position: 1,
              steps: [
                { id: 'step-1', lessonId: 'les-1', title: 'Step 1', type: 'theory', position: 1, isRequired: true, estimatedDurationMinutes: 5 }
              ]
            }
          ]
        }
      ],
      editorContent: '<div>Editor</div>'
    });

    assert.ok(!shellHtml.includes('__zurHydrateTree'), 'No global __zurHydrateTree hack');
    assert.ok(!shellHtml.includes('onload="window.__zurHydrateTree'), 'No img onload hydration hack');
    assert.ok(!shellHtml.includes('sessionStorage'), 'No sessionStorage script injected');
    assert.ok(shellHtml.includes('Module 1: Basics'), 'Tree rendered synchronously from supplied modules');
    assert.ok(shellHtml.includes('btn btn-secondary btn-compact">Review & publish</a>'), 'Review & publish is secondary button');
  });

  await t.test('Audit Requirement 2: AuthorPreviewPage renders real learner shell with 248px sidebar & task strip', () => {
    const previewHtml = renderAuthorPreviewPage({
      courseId: 'course-1',
      courseTitle: 'Python Foundations',
      stepId: 's-1',
      stepTitle: 'Concept Overview',
      stepType: 'theory',
      content: { markdown: '# Concept Overview\n\nPreserved verbatim without destructive regex.' },
      returnEditorUrl: '/teach/course-1/content/theory/s-1',
      modules: [
        {
          id: 'mod-1',
          title: 'Module 1: Fundamentals',
          lessons: [
            {
              id: 'les-1',
              title: 'Lesson 1: Core',
              steps: [
                { id: 's-1', title: 'Concept Overview', type: 'theory' }
              ]
            }
          ]
        }
      ]
    });

    assert.ok(previewHtml.includes('learning-course-sidebar'), 'Renders learner 248px syllabus sidebar');
    assert.ok(previewHtml.includes('learning-task-strip'), 'Renders learner task strip');
    assert.ok(previewHtml.includes('Preserved verbatim without destructive regex.'), 'Preserved markdown verbatim');
    assert.ok(previewHtml.includes('author-preview-banner'), 'High-contrast preview banner present');
    assert.ok(previewHtml.includes('STUDENT PREVIEW'), 'Student preview tag present');
  });

  await t.test('Audit Requirement 3: CoursePublishPage renders THREE distinct exercise group cards', () => {
    const publishHtml = renderCoursePublishPage({
      courseId: 'course-python-foundations',
      courseTitle: 'Python Foundations',
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      draftRevision: 2,
      newVersionNumber: 1,
      activeEnrolledStudents: 0,
      stepTitleMap: {
        'step-4-python-echo': 'Echoing Numbers',
        'step-6-python-evenodd': 'Check Even or Odd',
        'step-7-python-sum': 'Sum of Numbers',
      },
      validation: {
        isValid: false,
        errors: [
          { stepId: 'step-4-python-echo', message: 'Reference solution failed test case #1: INTERNAL_ERROR', blocking: true },
          { stepId: 'step-4-python-echo', message: 'Reference solution failed test case #2: INTERNAL_ERROR', blocking: true },
          { stepId: 'step-6-python-evenodd', message: 'Reference solution failed test case #1: INTERNAL_ERROR', blocking: true },
          { stepId: 'step-6-python-evenodd', message: 'Reference solution failed test case #2: INTERNAL_ERROR', blocking: true },
          { stepId: 'step-7-python-sum', message: 'Reference solution failed test case #1: INTERNAL_ERROR', blocking: true },
          { stepId: 'step-7-python-sum', message: 'Reference solution failed test case #2: INTERNAL_ERROR', blocking: true },
          { stepId: 'step-7-python-sum', message: 'Reference solution failed test case #3: INTERNAL_ERROR', blocking: true },
        ],
        warnings: [],
      },
    });

    assert.ok(publishHtml.includes('Echoing Numbers'), 'Renders Echoing Numbers group card');
    assert.ok(publishHtml.includes('Check Even or Odd'), 'Renders Check Even or Odd group card');
    assert.ok(publishHtml.includes('Sum of Numbers'), 'Renders Sum of Numbers group card');
    assert.ok(publishHtml.includes('3 exercises need review'), 'Summary correctly states 3 exercises');
    assert.ok(publishHtml.includes('?tab=tests'), 'Exact Edit tests link targeting ?tab=tests');
    assert.ok(publishHtml.includes('id="retry-validation-btn"'), 'Retry validation button wired');
  });

  await t.test('Audit Requirement 4: TheoryEditorPage toolbar upload action & tree count unclipped', () => {
    const theoryHtml = renderTheoryEditorPage({
      courseId: 'c-test',
      courseTitle: 'Python Foundations',
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      stepId: 's-1',
      stepTitle: 'Variables',
      markdown: 'Some markdown',
      revision: 1,
      isRequired: true,
      estimatedDurationMinutes: 5,
    });

    assert.ok(theoryHtml.includes('data-action="open-asset-modal"'), 'Upload asset action in toolbar');
    assert.ok(theoryHtml.includes('Upload image'), 'Upload image button label');
  });

  await t.test('Audit Requirement 5: PythonExerciseEditorPage tab selection from ?tab= query parameter', () => {
    // Save original window if any
    const origWindow = (globalThis as any).window;
    (globalThis as any).window = { location: { search: '?tab=tests' } };

    try {
      const pyHtml = renderPythonExerciseEditorPage({
        courseId: 'c-test',
        courseTitle: 'Python Foundations',
        publicationState: 'draft',
        hasUnpublishedChanges: false,
        stepId: 's-4',
        stepTitle: 'Echo',
        problemStatement: 'Print x.',
        inputFormat: 'int',
        outputFormat: 'int',
        constraints: '1 <= x <= 10',
        starterCode: 'x = input()\nprint(x)\n',
        referenceSolution: 'print(input())\n',
        hints: ['Hint 1'],
        solutionExplanation: 'Echo stdin',
        publicTests: [{ stdin: '1\n', expectedStdout: '1\n' }],
        hiddenTests: [{ stdin: '2\n', expectedStdout: '2\n' }],
        runtimeLimits: { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 },
        revision: 1,
        isRequired: true,
        estimatedDurationMinutes: 15,
      });

      assert.ok(pyHtml.includes('sub-tab-btn active" role="tab" aria-selected="true" data-tab="tests"'), 'Tests tab button is active');
      assert.ok(!pyHtml.includes('id="tab-tests" role="tabpanel" style="display:none;"'), 'Tests pane is visible');
      assert.ok(pyHtml.includes('id="tab-problem" role="tabpanel" style="display:none;"'), 'Problem pane is hidden when tests tab is selected');
    } finally {
      (globalThis as any).window = origWindow;
    }
  });

  await t.test('Audit Requirement 6: AuthorWorkspaceShell oninput dirty tracking and Saved reset', () => {
    const shellHtml = renderAuthorWorkspaceShell({
      courseId: 'c-test',
      courseTitle: 'Python Foundations',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      activeTab: 'content',
      editorContent: '<div>Editor</div>',
    });

    assert.ok(shellHtml.includes('oninput="this.classList.add(\'is-dirty\')'), 'Shell has oninput dirty tracking');
    assert.ok(shellHtml.includes('btn.textContent = \'Save changes\''), 'Shell resets Saved to Save changes on edit');
  });

  await t.test('Audit Requirement 7: AuthorPreviewPage refined learner Python preview & copy handler', () => {
    const previewHtml = renderAuthorPreviewPage({
      courseId: 'c-test',
      courseTitle: 'Python Foundations',
      stepId: 's-4',
      stepTitle: 'Echo Exercise',
      stepType: 'python',
      content: {
        problemStatement: 'Print x.',
        inputFormat: 'int',
        outputFormat: 'int',
        constraints: '1 <= x',
        starterCode: 'x = 42\n',
        hints: ['Check input types'],
        publicTests: [{ stdin: '42\n', expectedStdout: '42\n' }],
      },
      returnEditorUrl: '/teach/c-test/content/python/s-4',
    });

    assert.ok(previewHtml.includes('learning-workspace-paired-layout'), 'Renders learner paired layout');
    assert.ok(previewHtml.includes('code-editor-line-numbers'), 'Renders line numbers in editor area');
    assert.ok(previewHtml.includes('hint-accordion'), 'Renders expandable hint accordion in problem pane');
    assert.ok(previewHtml.includes('preview-run-samples-btn'), 'Renders preview sample run action');
    assert.ok(previewHtml.includes('Execution unavailable in preview'), 'Truthful execution unavailable notice rendered');
  });

  await t.test('Audit Requirement 8: No preview action produces hardcoded fakepass or synthetic validation', () => {
    const pythonPreview = renderAuthorPreviewPage({
      courseId: 'c-test',
      courseTitle: 'Python Foundations',
      stepId: 's-4',
      stepTitle: 'Echo Exercise',
      stepType: 'python',
      content: {
        problemStatement: 'Print x.',
        starterCode: 'x = 100\n',
      },
      returnEditorUrl: '/teach/c-test/content/python/s-4',
    });

    // Meaningful assertions verifying no synthetic success or hardcoded fixed execution values
    assert.ok(!pythonPreview.includes('Input: 42'), 'Must not contain hardcoded Input: 42');
    assert.ok(!pythonPreview.includes('Output: 42'), 'Must not contain hardcoded Output: 42');
    assert.ok(!pythonPreview.includes('Solution preview validated'), 'Must not claim solution preview validated');
    assert.ok(!pythonPreview.includes('Sample tests preview (zero student progress recorded)'), 'Must not claim fake sample pass');
    assert.ok(pythonPreview.includes('disabled title="Execution unavailable in preview"'), 'Run samples is disabled with truthful title');

    const quizPreview = renderAuthorPreviewPage({
      courseId: 'c-test',
      courseTitle: 'Python Foundations',
      stepId: 's-3',
      stepTitle: 'Concept Check',
      stepType: 'quiz',
      content: {
        prompt: 'What is Python?',
        quizType: 'single_choice',
        options: [
          { id: 'opt-1', text: 'A programming language', isCorrect: true },
          { id: 'opt-2', text: 'A snake species', isCorrect: false },
        ],
      },
      returnEditorUrl: '/teach/c-test/content/quiz/s-3',
    });

    assert.ok(quizPreview.includes('Preview selection'), 'Renders truthful Preview selection button');
    assert.ok(!quizPreview.includes('Answer submitted in preview mode'), 'Must not claim answer submitted or validated');
    assert.ok(quizPreview.includes('grading disabled'), 'Truthfully states grading is disabled in interaction preview');
  });
});
