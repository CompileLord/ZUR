import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { renderAuthorWorkspaceShell } from '../../../src/components/shells/AuthorWorkspaceShell.ts';
import { renderAuthorCoursesPage } from '../../../src/pages/author/AuthorCoursesPage.ts';
import { renderCourseBuilderPage } from '../../../src/pages/author/CourseBuilderPage.ts';
import { renderTheoryEditorPage } from '../../../src/pages/author/TheoryEditorPage.ts';
import { renderVideoEditorPage, deriveEmbedUrl } from '../../../src/pages/author/VideoEditorPage.ts';
import { renderQuizEditorPage } from '../../../src/pages/author/QuizEditorPage.ts';
import { renderPythonExerciseEditorPage } from '../../../src/pages/author/PythonExerciseEditorPage.ts';
import { renderAuthorPreviewPage } from '../../../src/pages/author/AuthorPreviewPage.ts';
import { renderCoursePublishPage } from '../../../src/pages/author/CoursePublishPage.ts';
import { renderAuthorTree } from '../../../src/pages/author/AuthorTreeComponent.ts';
import type { AuthorRedesignFixture } from './fixture.ts';

export async function pageAcceptanceTests(t: TestContext, f: AuthorRedesignFixture): Promise<void> {
  const { dummyModules } = f;

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
        draftRevision: 1,
        errors: [
          { stepId: 's-4', message: 'Reference solution failed test case #1: INTERNAL_ERROR', blocking: true },
        ],
        warnings: [],
      },
    });

    assert.ok(publishHtml.includes("Validation couldn't run"), 'Classified infrastructure failure');
    assert.ok(publishHtml.includes('Retry validation'), 'Offers retry action for service failure');
    assert.ok(publishHtml.includes('Diagnostic details'), 'Diagnostic details disclosure present');
    assert.ok(publishHtml.includes('1 item needs review'), 'Review summary count');
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
}
