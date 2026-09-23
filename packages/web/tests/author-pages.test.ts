import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAuthorCoursesPage } from '../src/pages/author/AuthorCoursesPage.ts';
import { renderCourseSettingsPage } from '../src/pages/author/CourseSettingsPage.ts';
import { renderCourseBuilderPage } from '../src/pages/author/CourseBuilderPage.ts';
import { renderTheoryEditorPage } from '../src/pages/author/TheoryEditorPage.ts';
import { renderVideoEditorPage } from '../src/pages/author/VideoEditorPage.ts';
import { renderQuizEditorPage } from '../src/pages/author/QuizEditorPage.ts';
import { renderPythonExerciseEditorPage } from '../src/pages/author/PythonExerciseEditorPage.ts';
import { renderAuthorPreviewPage } from '../src/pages/author/AuthorPreviewPage.ts';

test('Author Pages & Shell Workspaces (P21–P26, P31)', async (t) => {
  const authorUser = {
    displayName: 'Charles Babbage',
    email: 'charles@zur.internal',
    capabilities: ['author', 'student'],
  };

  const nonAuthorUser = {
    displayName: 'Learner User',
    email: 'learner@zur.internal',
    capabilities: ['student'],
  };

  await t.test('P21: AuthorCoursesPage renders course list, status filter, modal, and non-author denial', () => {
    // 1. Non-author access denial
    const deniedHtml = renderAuthorCoursesPage({
      user: nonAuthorUser,
      courses: [],
    });
    assert.ok(deniedHtml.includes('Author Access Required'), 'Must show author access requirement');
    assert.ok(deniedHtml.includes('Return to learning'), 'Must offer safe return link');

    // 2. Author with courses
    const authorHtml = renderAuthorCoursesPage({
      user: authorUser,
      courses: [
        {
          id: 'course-1',
          title: 'Analytical Engine Architecture',
          publicationStatus: 'draft',
          hasUnpublishedChanges: true,
          studentCount: 0,
          lastEditTime: new Date().toISOString(),
        },
        {
          id: 'course-2',
          title: 'Difference Engine Foundations',
          publicationStatus: 'published',
          hasUnpublishedChanges: false,
          studentCount: 15,
          lastEditTime: new Date().toISOString(),
        },
      ],
      activeFilter: 'all',
      showNewCourseModal: true,
    });

    assert.ok(authorHtml.includes('Your courses'), 'Header present');
    assert.ok(authorHtml.includes('Analytical Engine Architecture'), 'Course 1 present');
    assert.ok(authorHtml.includes('Difference Engine Foundations'), 'Course 2 present');
    assert.ok(authorHtml.includes('15 students'), 'Student count formatted');
    assert.ok(authorHtml.includes('Continue editing'), 'Draft action label');
    assert.ok(authorHtml.includes('Open course'), 'Published action label');

    // Modal dialog
    assert.ok(authorHtml.includes('Create new course'), 'Modal dialog title');
    assert.ok(authorHtml.includes('Starts as a private draft'), 'Helper text present');
  });

  await t.test('P31: CourseSettingsPage renders metadata, live delivery controls, and lifecycle', () => {
    const settingsHtml = renderCourseSettingsPage({
      course: {
        id: 'course-1',
        title: 'Analytical Engine Architecture',
        description: 'Complete architecture course',
        categoryId: 'cat-1',
        tags: ['hardware', 'architecture'],
        difficulty: 'intermediate',
        language: 'en',
        learningOutcomes: ['Design gear trains', 'Store instructions on cards'],
        prerequisites: 'Basic math',
        estimatedDurationMinutes: 120,
        visibility: 'private',
        enrollmentPolicy: 'invitation_only',
        publicationStatus: 'draft',
        draftRevision: 2,
      },
      categories: [
        { id: 'cat-1', name: 'Computer Architecture' },
        { id: 'cat-2', name: 'Python Basics' },
      ],
      saveStatus: 'saved',
    });

    assert.ok(settingsHtml.includes('Course settings'), 'Settings title present');
    assert.ok(settingsHtml.includes('value="Analytical Engine Architecture"'), 'Title bound');
    assert.ok(settingsHtml.includes('Computer Architecture'), 'Category dropdown populated');
    assert.ok(settingsHtml.includes('Private courses automatically enforce invitation-only enrollment'), 'Private enforcement notice');
    assert.ok(settingsHtml.includes('Apply access settings'), 'Live access button present');
    assert.ok(settingsHtml.includes('Archive course'), 'Archive action present');
    assert.ok(settingsHtml.includes('Delete draft'), 'Delete draft offered for unpublished course');
  });

  await t.test('P22: CourseBuilderPage renders persistent ContentTree and 1-20 steps limits', () => {
    const builderHtml = renderCourseBuilderPage({
      courseId: 'course-1',
      courseTitle: 'Analytical Engine Architecture',
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      selectedType: 'lesson',
      selectedId: 'lesson-1',
      modules: [
        {
          id: 'mod-1',
          courseId: 'course-1',
          title: 'Store and Mill',
          position: 0,
          lessons: [
            {
              id: 'lesson-1',
              moduleId: 'mod-1',
              title: 'The Mechanical Mill',
              position: 0,
              steps: [
                {
                  id: 'step-1',
                  lessonId: 'lesson-1',
                  type: 'theory',
                  title: 'Mill Operations',
                  position: 0,
                  isRequired: true,
                  estimatedDurationMinutes: 5,
                },
                {
                  id: 'step-2',
                  lessonId: 'lesson-1',
                  type: 'quiz',
                  title: 'Mill Checkpoint',
                  position: 1,
                  isRequired: true,
                  estimatedDurationMinutes: 5,
                },
              ],
            },
          ],
        },
      ],
    });

    assert.ok(builderHtml.includes('Structure'), 'Structure tree header present');
    assert.ok(builderHtml.includes('Module 1: Store and Mill'), 'Module rendered in tree');
    assert.ok(builderHtml.includes('The Mechanical Mill'), 'Lesson rendered');
    assert.ok(builderHtml.includes('2 of 20'), 'Steps limit count displayed');
    assert.ok(builderHtml.includes('Mill Operations'), 'Step 1 rendered');
    assert.ok(builderHtml.includes('Mill Checkpoint'), 'Step 2 rendered');
    assert.ok(builderHtml.includes('+ Add step'), 'Add step control present');
  });

  await t.test('P23: TheoryEditorPage renders markdown toolbar and preview tab', () => {
    const theoryHtml = renderTheoryEditorPage({
      courseId: 'course-1',
      courseTitle: 'Analytical Engine Architecture',
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      stepId: 'step-1',
      stepTitle: 'Mill Operations',
      markdown: '# Mill Operations\n\nThe mill carries out arithmetic operations.',
      revision: 1,
      isRequired: true,
      estimatedDurationMinutes: 10,
    });

    assert.ok(theoryHtml.includes('value="Mill Operations"'), 'Step title bound');
    assert.ok(theoryHtml.includes('Text Formatting'), 'Markdown toolbar present');
    assert.ok(theoryHtml.includes('data-format="bold"'), 'Bold button present');
    assert.ok(theoryHtml.includes('The mill carries out arithmetic operations'), 'Content present in textarea');
    assert.ok(theoryHtml.includes('Estimated duration'), 'Inspector duration field present');
    assert.ok(theoryHtml.includes('Required step'), 'Inspector required checkbox present');
  });

  await t.test('P23: VideoEditorPage renders provider URL input and embed card', () => {
    const videoHtml = renderVideoEditorPage({
      courseId: 'course-1',
      courseTitle: 'Analytical Engine Architecture',
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      stepId: 'step-2',
      stepTitle: 'Difference Engine in Motion',
      videoUrl: 'https://www.youtube.com/watch?v=0anIyVGeWOI',
      provider: 'youtube',
      transcript: 'This video demonstrates the mechanical gears turning.',
      captionVerified: true,
      revision: 1,
      isRequired: true,
      estimatedDurationMinutes: 8,
    });

    assert.ok(videoHtml.includes('youtube-nocookie.com/embed/0anIyVGeWOI'), 'Resolved safe embed URL');
    assert.ok(videoHtml.includes('Transcript or verified captions'), 'Transcript field present');
    assert.ok(videoHtml.includes('Supported providers: <strong>YouTube</strong>, <strong>Vimeo</strong>, and <strong>Loom</strong>'), 'Approved providers explained');
  });

  await t.test('P24: QuizEditorPage renders 2-8 choices, single/multiple toggle, and explanation', () => {
    const quizHtml = renderQuizEditorPage({
      courseId: 'course-1',
      courseTitle: 'Analytical Engine Architecture',
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      stepId: 'step-3',
      stepTitle: 'Logic Checkpoint',
      quizType: 'single_choice',
      prompt: 'Which component performs addition?',
      options: [
        { id: '1', text: 'The Mill', isCorrect: true },
        { id: '2', text: 'The Store', isCorrect: false },
        { id: '3', text: 'The Card Reader', isCorrect: false },
      ],
      explanation: 'The mill is the calculating unit.',
      revision: 1,
      isRequired: true,
      estimatedDurationMinutes: 5,
    });

    assert.ok(quizHtml.includes('Which component performs addition?'), 'Prompt rendered');
    assert.ok(quizHtml.includes('Answer choices (3 of 8)'), 'Choice counter rendered');
    assert.ok(quizHtml.includes('The Mill'), 'Option 1 text');
    assert.ok(quizHtml.includes('Correct answer'), 'Answer-key control label present');
    assert.ok(quizHtml.includes('Shown after a correct answer'), 'Post-pass explanation note present');
  });

  await t.test('P25: PythonExerciseEditorPage renders Problem, Code, Tests, and Validation tabs', () => {
    const pyHtml = renderPythonExerciseEditorPage({
      courseId: 'course-1',
      courseTitle: 'Analytical Engine Architecture',
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      stepId: 'step-4',
      stepTitle: 'Calculate Polynomial',
      activeSubTab: 'problem',
      problemStatement: 'Compute the polynomial value for given x.',
      inputFormat: 'Single integer x',
      outputFormat: 'Single integer result',
      constraints: '-100 <= x <= 100',
      starterCode: 'x = int(input())\n# Complete\n',
      referenceSolution: 'x = int(input())\nprint(x * x + 2 * x + 1)\n',
      hints: ['Use algebraic multiplication'],
      solutionExplanation: 'Evaluate (x+1)^2 or x*x + 2*x + 1',
      publicTests: [{ stdin: '2\n', expectedStdout: '9\n' }],
      hiddenTests: [{ stdin: '0\n', expectedStdout: '1\n' }],
      runtimeLimits: {
        cpuTimeoutSeconds: 3,
        wallTimeoutSeconds: 6,
        memoryLimitMib: 128,
      },
      validationStatus: 'passed',
      revision: 1,
      isRequired: true,
      estimatedDurationMinutes: 15,
    });

    assert.ok(pyHtml.includes('data-tab="problem"'), 'Problem tab nav button');
    assert.ok(pyHtml.includes('data-tab="code"'), 'Code tab nav button');
    assert.ok(pyHtml.includes('data-tab="tests"'), 'Tests tab nav button');
    assert.ok(pyHtml.includes('data-tab="validation"'), 'Validation tab nav button');
    assert.ok(pyHtml.includes('Private — Never sent to students'), 'Reference solution privacy badge');
    assert.ok(pyHtml.includes('Public test cases (1)'), 'Public test count');
    assert.ok(pyHtml.includes('Hidden test cases (1)'), 'Hidden test count');
    assert.ok(pyHtml.includes('Passed All Tests'), 'Validation pass badge');
  });

  await t.test('P26: AuthorPreviewPage renders persistent banner and true student view', () => {
    // 1. Theory Preview
    const theoryPreview = renderAuthorPreviewPage({
      courseId: 'course-1',
      courseTitle: 'Analytical Engine Architecture',
      stepId: 'step-1',
      stepTitle: 'Mill Operations',
      stepType: 'theory',
      content: { markdown: '# Overview\n\nStudy the mechanical gears.' },
      returnEditorUrl: '/teach/course-1/content/theory/step-1',
    });

    assert.ok(theoryPreview.includes('STUDENT PREVIEW'), 'Preview tag rendered');
    assert.ok(theoryPreview.includes("Preview — your actions won't affect student progress"), 'Preview banner notice');
    assert.ok(theoryPreview.includes('← Back to editor'), 'Return link present');
    assert.ok(theoryPreview.includes('Study the mechanical gears'), 'Theory text rendered');

    // 2. Python Preview
    const pyPreview = renderAuthorPreviewPage({
      courseId: 'course-1',
      courseTitle: 'Analytical Engine Architecture',
      stepId: 'step-4',
      stepTitle: 'Calculate Polynomial',
      stepType: 'python',
      content: {
        problemStatement: 'Compute polynomial for x.',
        starterCode: 'x = int(input())\n',
        publicTests: [{ stdin: '2\n', expectedStdout: '9\n' }],
      },
      returnEditorUrl: '/teach/course-1/content/python/step-4',
    });

    assert.ok(pyPreview.includes('Compute polynomial for x'), 'Problem rendered');
    assert.ok(pyPreview.includes('Run samples'), 'Student run action present');
    assert.ok(pyPreview.includes('Submit solution'), 'Student submit action present');
    assert.ok(!pyPreview.includes('referenceSolution'), 'Must not leak reference solution');
  });
});
