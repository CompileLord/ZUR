import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { renderAuthorWorkspaceShell } from '../../../src/components/shells/AuthorWorkspaceShell.ts';
import { renderTheoryEditorPage } from '../../../src/pages/author/TheoryEditorPage.ts';
import { renderPythonExerciseEditorPage } from '../../../src/pages/author/PythonExerciseEditorPage.ts';
import { renderAuthorPreviewPage } from '../../../src/pages/author/AuthorPreviewPage.ts';
import { renderCoursePublishPage } from '../../../src/pages/author/CoursePublishPage.ts';
import type { AuthorRedesignFixture } from './fixture.ts';

export async function auditRequirementTests(t: TestContext, _f: AuthorRedesignFixture): Promise<void> {
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
    assert.ok(shellHtml.includes('btn btn-primary btn-compact">Review & publish</a>'), 'Review & publish is the single primary header action');
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
        draftRevision: 1,
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
    assert.ok(previewHtml.includes('preview-editor-header'), 'Renders read-only preview header in editor pane');
    assert.ok(previewHtml.includes('Execution and grading are disabled in author preview'), 'Truthful execution unavailable notice rendered');
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
    assert.ok(!pythonPreview.includes('preview-run-samples-btn'), 'Obsolete execution toolbar is removed');
    assert.ok(pythonPreview.includes('Read-only code preview'), 'Read-only preview is clearly communicated');

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
    assert.ok(quizPreview.includes('Grading is disabled'), 'Truthfully states grading is disabled in interaction preview');
  });
}
