import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderAcceptInvitationPage,
  renderDashboardContinuePage,
  renderMyCoursesPage,
  renderEnrolledCoursePage,
  renderTheoryStepPage,
  renderVideoStepPage,
  renderQuizStepPage,
} from '../src/pages/learning/index.ts';

test('Learning Pages & Shell Workspaces (P08–P14, S2–S4)', async (t) => {
  const mockUser = {
    displayName: 'Ada Lovelace',
    email: 'ada@zur.internal',
    capabilities: ['student'] as ('student' | 'author' | 'admin')[],
  };

  // --- P08: Accept Invitation Page ---
  await t.test('P08: AcceptInvitationPage renders valid invitation preview and auth prompt', () => {
    // Signed-out user view
    const signedOutHtml = renderAcceptInvitationPage({
      token: 'tok-12345',
      valid: true,
      courseTitle: 'Introduction to Python',
      courseDescription: 'A beginner course.',
      inviterName: 'Guido van Rossum',
      expiresAt: '2026-10-01T00:00:00.000Z',
      currentUser: null,
    });

    assert.ok(signedOutHtml.includes('Join Introduction to Python'));
    assert.ok(signedOutHtml.includes('Guido van Rossum'));
    assert.ok(signedOutHtml.includes('Sign in to accept'));
    assert.ok(signedOutHtml.includes('Create account'));

    // Signed-in user view
    const signedInHtml = renderAcceptInvitationPage({
      token: 'tok-12345',
      valid: true,
      courseTitle: 'Introduction to Python',
      inviterName: 'Guido van Rossum',
      currentUser: mockUser,
      recipientEmailMasked: 'a***@z***.internal',
    });

    assert.ok(signedInHtml.includes('Accept and start learning'));
    assert.ok(signedInHtml.includes('a***@z***.internal'));
    assert.ok(signedInHtml.includes('Signing in as <strong>Ada Lovelace</strong>'));

    // Invalid / Revoked states
    const revokedHtml = renderAcceptInvitationPage({
      token: 'tok-revoked',
      valid: false,
      reason: 'revoked',
    });
    assert.ok(revokedHtml.includes('revoked by the course instructor'));
    assert.ok(revokedHtml.includes('role="alert"'));
  });

  // --- P09: Dashboard Continue Page ---
  await t.test('P09: DashboardContinuePage renders dominant resume card, progress bar, and empty state', () => {
    // Active learning state
    const html = renderDashboardContinuePage({
      user: mockUser,
      continueCourse: {
        courseId: 'course-1',
        enrollmentId: 'enr-1',
        title: 'Python Foundations',
        description: 'Learn Python basics.',
        pinnedVersionNumber: 1,
        percentage: 50,
        completedRequired: 2,
        totalRequired: 4,
        isCompleted: false,
        nextIncompleteStepId: 'step-3',
        nextStepTitle: 'Control Flow Quiz',
      },
      recentCourses: [
        {
          courseId: 'course-2',
          enrollmentId: 'enr-2',
          title: 'Algorithms',
          description: 'Sort and search.',
          difficulty: 'intermediate',
          percentage: 100,
          isCompleted: true,
          status: 'active',
        },
      ],
    });

    assert.ok(html.includes('Continue learning'));
    assert.ok(html.includes('Python Foundations'));
    assert.ok(html.includes('Version 1'));
    assert.ok(html.includes('2 of 4 required steps'));
    assert.ok(html.includes('Next: <strong>Control Flow Quiz</strong>'));
    assert.ok(html.includes('/learn/enr-1/steps/step-3'));
    assert.ok(html.includes('Algorithms'));

    // First-time learner empty state
    const emptyHtml = renderDashboardContinuePage({
      user: mockUser,
      continueCourse: null,
      recentCourses: [],
    });
    assert.ok(emptyHtml.includes('Your next lesson starts here'));
    assert.ok(emptyHtml.includes('Explore courses'));
  });

  // --- P10: My Courses Page ---
  await t.test('P10: MyCoursesPage renders filter tabs, course cards, leave dialog, and previous enrollments', () => {
    const html = renderMyCoursesPage({
      user: mockUser,
      activeFilter: 'in_progress',
      courses: [
        {
          id: 'enr-1',
          courseId: 'course-1',
          courseTitle: 'Python 101',
          courseDescription: 'Basic syntax.',
          difficulty: 'beginner',
          pinnedVersionNumber: 1,
          status: 'active',
          percentage: 40,
          completedRequired: 2,
          totalRequired: 5,
          isCompleted: false,
          nextStepId: 'step-3',
          updatedAt: '2026-09-24T12:00:00Z',
        },
      ],
      previousCourses: [
        {
          id: 'enr-old',
          courseId: 'course-old',
          courseTitle: 'Legacy Python 2',
          courseDescription: 'Old course.',
          difficulty: 'advanced',
          pinnedVersionNumber: 1,
          status: 'left',
          percentage: 80,
          completedRequired: 4,
          totalRequired: 5,
          isCompleted: false,
          updatedAt: '2026-09-20T12:00:00Z',
        },
      ],
      leaveCourseDialogFor: {
        courseId: 'course-1',
        courseTitle: 'Python 101',
      },
    });

    assert.ok(html.includes('My courses'));
    assert.ok(html.includes('In progress (1)'));
    assert.ok(html.includes('Python 101'));
    assert.ok(html.includes('Leave course?'));
    assert.ok(html.includes('Previous enrollments'));
    assert.ok(html.includes('Legacy Python 2'));
    assert.ok(html.includes('Rejoin course'));
  });

  // --- P11: Enrolled Course Page ---
  await t.test('P11: EnrolledCoursePage renders syllabus tree, rail items, and completion summary', () => {
    const html = renderEnrolledCoursePage({
      user: mockUser,
      enrollmentId: 'enr-1',
      courseId: 'course-1',
      title: 'Data Structures in Python',
      description: 'Lists, sets, dicts and trees.',
      difficulty: 'intermediate',
      estimatedDurationMinutes: 120,
      pinnedVersionNumber: 2,
      percentage: 100,
      completedRequired: 3,
      totalRequired: 3,
      waivedRequired: 1,
      isCompleted: true,
      completedAt: '2026-09-24T10:00:00Z',
      nextStepId: 'step-1',
      modules: [
        {
          id: 'mod-1',
          title: 'Linear Collections',
          lessons: [
            {
              id: 'les-1',
              title: 'Lists and Tuples',
              steps: [
                {
                  id: 'step-1',
                  title: 'List Concepts',
                  type: 'theory',
                  isRequired: true,
                  estimatedDurationMinutes: 10,
                  isCompleted: true,
                  isWaived: false,
                },
                {
                  id: 'step-2',
                  title: 'List Exercises',
                  type: 'python',
                  isRequired: true,
                  estimatedDurationMinutes: 20,
                  isCompleted: false,
                  isWaived: true,
                  waiverReason: 'Test bug waiver',
                },
              ],
            },
          ],
        },
      ],
    });

    assert.ok(html.includes('Data Structures in Python'));
    assert.ok(html.includes('Version 2'));
    assert.ok(html.includes('Course complete'));
    assert.ok(html.includes('(1 waived)'));
    assert.ok(html.includes('Module 1: Linear Collections'));
    assert.ok(html.includes('Lesson 1: Lists and Tuples'));
    assert.ok(html.includes('List Concepts'));
    assert.ok(html.includes('Waived'));
  });

  // --- P12: Theory Step Page ---
  await t.test('P12: TheoryStepPage renders markdown content, metadata, and mark-complete actions', () => {
    const html = renderTheoryStepPage({
      courseTitle: 'Python Basics',
      courseOverviewUrl: '/learn/enr-1',
      lessonTitle: 'Variables',
      stepTitle: 'Declaring Variables',
      stepOrdinalText: 'Step 1 of 4',
      isRequired: true,
      estimatedDurationMinutes: 5,
      markdownContent: '## Variable Basics\nIn Python, you do not declare variable types explicitly.\n\n```python\nx = 42\n```',
      enrollmentId: 'enr-1',
      stepId: 'step-1',
      isCompleted: false,
      nextStepUrl: '/learn/enr-1/steps/step-2',
    });

    assert.ok(html.includes('Step 1 of 4'));
    assert.ok(html.includes('Declaring Variables'));
    assert.ok(html.includes('<h2>Variable Basics</h2>'));
    assert.ok(html.includes('<code class="language-python">x = 42'));
    assert.ok(html.includes('Mark complete and continue'));
    assert.ok(html.includes('Report issue'));
  });

  // --- P13: Video Step Page ---
  await t.test('P13: VideoStepPage renders privacy-safe iframe and transcript disclosure', () => {
    const html = renderVideoStepPage({
      courseTitle: 'Python Basics',
      courseOverviewUrl: '/learn/enr-1',
      lessonTitle: 'Functions',
      stepTitle: 'Defining Functions Video',
      stepOrdinalText: 'Step 2 of 4',
      isRequired: true,
      estimatedDurationMinutes: 8,
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      transcript: 'Welcome to this lesson on function definitions.',
      captionVerified: true,
      enrollmentId: 'enr-1',
      stepId: 'step-2',
      isCompleted: false,
    });

    assert.ok(html.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ'));
    assert.ok(html.includes('Transcript'));
    assert.ok(html.includes('Welcome to this lesson on function definitions.'));
    assert.ok(html.includes('Verified'));
    assert.ok(html.includes('Mark complete and continue'));
  });

  // --- P14: Quiz Step Page ---
  await t.test('P14: QuizStepPage renders options, prevents pre-pass answer leakage, and renders feedback', () => {
    // Initial attempt view: options rendered, no correct answers leaked
    const initialHtml = renderQuizStepPage({
      courseTitle: 'Python Basics',
      courseOverviewUrl: '/learn/enr-1',
      lessonTitle: 'Data Types',
      stepTitle: 'Integer Division Quiz',
      stepOrdinalText: 'Step 3 of 4',
      isRequired: true,
      estimatedDurationMinutes: 3,
      quizType: 'single_choice',
      prompt: 'What does 7 // 2 evaluate to in Python 3?',
      options: [
        { id: 'opt-1', text: '3.5' },
        { id: 'opt-2', text: '3' },
        { id: 'opt-3', text: '4' },
      ],
      enrollmentId: 'enr-1',
      stepId: 'step-3',
      isCompleted: false,
      selectedOptionIds: ['opt-1'],
    });

    assert.ok(initialHtml.includes('What does 7 // 2 evaluate to in Python 3?'));
    assert.ok(initialHtml.includes('3.5'));
    assert.ok(initialHtml.includes('Check answer'));
    assert.ok(!initialHtml.includes('Correct answer'));

    // Wrong answer feedback
    const wrongHtml = renderQuizStepPage({
      courseTitle: 'Python Basics',
      courseOverviewUrl: '/learn/enr-1',
      lessonTitle: 'Data Types',
      stepTitle: 'Integer Division Quiz',
      stepOrdinalText: 'Step 3 of 4',
      isRequired: true,
      estimatedDurationMinutes: 3,
      quizType: 'single_choice',
      prompt: 'What does 7 // 2 evaluate to in Python 3?',
      options: [
        { id: 'opt-1', text: '3.5' },
        { id: 'opt-2', text: '3' },
      ],
      enrollmentId: 'enr-1',
      stepId: 'step-3',
      isCompleted: false,
      feedback: {
        isPassed: false,
        verdict: 'WRONG_ANSWER',
      },
    });

    assert.ok(wrongHtml.includes("That answer isn't correct yet. Try again."));
    assert.ok(!wrongHtml.includes('explanation'));

    // Pass feedback: reveals explanation and highlights
    const passHtml = renderQuizStepPage({
      courseTitle: 'Python Basics',
      courseOverviewUrl: '/learn/enr-1',
      lessonTitle: 'Data Types',
      stepTitle: 'Integer Division Quiz',
      stepOrdinalText: 'Step 3 of 4',
      isRequired: true,
      estimatedDurationMinutes: 3,
      quizType: 'single_choice',
      prompt: 'What does 7 // 2 evaluate to in Python 3?',
      options: [
        { id: 'opt-1', text: '3.5' },
        { id: 'opt-2', text: '3' },
      ],
      enrollmentId: 'enr-1',
      stepId: 'step-3',
      isCompleted: true,
      selectedOptionIds: ['opt-2'],
      feedback: {
        isPassed: true,
        verdict: 'PASSED',
        explanation: '// performs floor division returning 3.',
        correctOptionIds: ['opt-2'],
      },
      nextStepUrl: '/learn/enr-1/steps/step-4',
    });

    assert.ok(passHtml.includes('All answers correct!'));
    assert.ok(passHtml.includes('// performs floor division returning 3.'));
    assert.ok(passHtml.includes('Next step →'));
  });
});
