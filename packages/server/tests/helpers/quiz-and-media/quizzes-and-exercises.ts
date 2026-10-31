import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from 'zur-shared';
import type { QuizMediaFixture } from './fixture.ts';

export async function quizAndExerciseTests(t: TestContext, f: QuizMediaFixture, shared: { course: { id: string }; lessonId: string }): Promise<void> {
  const { course, lessonId } = shared;
  const { db, structureService, quizService, authorId, studentId, exerciseService } = f;

  let quizStepId = '';

  await t.test('T036: Quiz creation, validation rules, and answer-key stripping', () => {
    // Add quiz step
    const step = structureService.addStep(authorId, course.id, lessonId, {
      title: 'Logic Gates Checkpoint',
      type: 'quiz',
    });
    quizStepId = step.id;

    // 1. Author updates quiz definition
    const updated = quizService.updateQuiz(authorId, quizStepId, 1, {
      kind: 'quiz',
      quizType: 'single_choice',
      prompt: 'Which logic gate outputs 1 only when both inputs are 1?',
      options: [
        { id: 'opt-and', text: 'AND Gate', isCorrect: true },
        { id: 'opt-or', text: 'OR Gate', isCorrect: false },
        { id: 'opt-xor', text: 'XOR Gate', isCorrect: false },
      ],
      explanation: 'An AND gate requires both inputs to be high.',
    });

    assert.equal(updated.revision, 2);
    assert.equal(updated.quiz.options.length, 3);

    // 2. Invalid quiz: single choice with 2 correct answers rejected
    assert.throws(
      () => {
        quizService.updateQuiz(authorId, quizStepId, 2, {
          kind: 'quiz',
          quizType: 'single_choice',
          prompt: 'Question',
          options: [
            { id: '1', text: 'A', isCorrect: true },
            { id: '2', text: 'B', isCorrect: true },
          ],
        });
      },
      ValidationError,
      'Single choice must have exactly 1 correct answer'
    );

    // 3. Student view strips isCorrect flags (PRD §11.2)
    const studentView = quizService.getStudentQuiz(authorId, null, quizStepId, true);
    assert.equal(studentView.title, 'Logic Gates Checkpoint');
    assert.equal(studentView.options.length, 3);
    for (const opt of studentView.options) {
      assert.equal((opt as any).isCorrect, undefined, 'isCorrect must be stripped for students');
    }
  });

  await t.test('T036: Quiz exact-set grading, attempt recording, and preview isolation', () => {
    // Create version and enrollment for Ada
    const versionId = 'version-arch-1';
    db.prepare(
      `INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at)
       VALUES (?, ?, 1, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    ).run(versionId, course.id, JSON.stringify({ modules: [{ lessons: [{ steps: [{ id: quizStepId, type: 'quiz', title: 'Logic Gates Checkpoint', content: quizService.getAuthorQuiz(authorId, quizStepId).quiz }] }] }] }));

    const enrollmentId = 'enroll-ada-arch';
    db.prepare(
      `INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    ).run(enrollmentId, studentId, course.id, versionId);

    // 1. Wrong answer
    const failResult = quizService.gradeQuiz(studentId, enrollmentId, quizStepId, ['opt-or'], false);
    assert.equal(failResult.verdict, 'WRONG_ANSWER');
    assert.equal(failResult.isPassed, false);
    assert.equal(failResult.explanation, undefined, 'Must not disclose explanation before passing');
    assert.equal(failResult.correctOptionIds, undefined, 'Must not disclose correct answer key');

    // 2. Correct answer
    const passResult = quizService.gradeQuiz(studentId, enrollmentId, quizStepId, ['opt-and'], false);
    assert.equal(passResult.verdict, 'PASSED');
    assert.equal(passResult.isPassed, true);
    assert.ok(passResult.explanation?.includes('AND gate requires both inputs'));
    assert.deepEqual(passResult.correctOptionIds, ['opt-and']);

    const attemptsCountAfterPass = (
      db.prepare('SELECT COUNT(*) as cnt FROM assessment_attempts WHERE step_id = ?').get(quizStepId) as any
    ).cnt;
    assert.equal(attemptsCountAfterPass, 2, '2 attempts recorded');

    // Verify step progress was marked completed
    const progress = db.prepare('SELECT is_completed FROM step_progress WHERE enrollment_id = ? AND step_id = ?').get(enrollmentId, quizStepId) as any;
    assert.equal(progress?.is_completed, 1);

    // 3. Preview mode isolation: isPreview=true does not mutate database
    const previewResult = quizService.gradeQuiz(authorId, null, quizStepId, ['opt-and'], true);
    assert.equal(previewResult.verdict, 'PASSED');

    const attemptsCountAfterPreview = (
      db.prepare('SELECT COUNT(*) as cnt FROM assessment_attempts WHERE step_id = ?').get(quizStepId) as any
    ).cnt;

    assert.equal(attemptsCountAfterPreview, attemptsCountAfterPass, 'Preview mode must not write assessment attempts');
  });

  let pythonStepId = '';

  await t.test('T037: Python exercise authoring: tests, reference solution, and limits', () => {
    const step = structureService.addStep(authorId, course.id, lessonId, {
      title: 'Sum of Two Numbers',
      type: 'python',
    });
    pythonStepId = step.id;

    // Update exercise definition with public and hidden tests
    const exercise = exerciseService.updateExercise(authorId, pythonStepId, 1, {
      title: 'Sum of Two Numbers',
      problemStatement: 'Read two integers a and b from stdin and print their sum.',
      inputFormat: 'Two space-separated integers on a single line.',
      outputFormat: 'A single integer representing the sum.',
      constraints: '-1000 <= a, b <= 1000',
      starterCode: 'import sys\n# Complete the solution\n',
      referenceSolution: 'import sys\na, b = map(int, sys.stdin.read().split())\nprint(a + b)\n',
      hints: ['Use sys.stdin.read().split() to read integers', 'Use the + operator'],
      solutionExplanation: 'The problem can be solved by reading whitespace-separated tokens and casting to int.',
      runtimeLimits: {
        cpuTimeoutSeconds: 2,
        wallTimeoutSeconds: 5,
        memoryLimitMib: 64,
      },
      publicTests: [
        { stdin: '2 3\n', expectedStdout: '5\n' },
        { stdin: '10 -5\n', expectedStdout: '5\n' },
      ],
      hiddenTests: [
        { stdin: '0 0\n', expectedStdout: '0\n' },
        { stdin: '1000 1000\n', expectedStdout: '2000\n' },
      ],
    });

    assert.equal(exercise.revision, 2);
    assert.equal(exercise.publicTests.length, 2);
    assert.equal(exercise.hiddenTests.length, 2);
    assert.equal(exercise.runtimeLimits.cpuTimeoutSeconds, 2);

    // Author payload includes reference solution and hidden tests
    const authorPayload = exerciseService.getAuthorExercise(authorId, pythonStepId);
    assert.ok(authorPayload.referenceSolution.includes('print(a + b)'));
    assert.equal(authorPayload.hiddenTests.length, 2);
  });

  await t.test('T039: Student preview payload strips hidden tests and reference solution', () => {
    const studentPayload = exerciseService.getStudentExercise(pythonStepId);
    assert.equal((studentPayload as any).referenceSolution, undefined, 'Student payload must NOT contain reference solution');
    assert.equal(studentPayload.publicTests.length, 2);
    assert.equal((studentPayload as any).hiddenTests, undefined, 'Student payload must NOT contain hidden tests');
    assert.equal(studentPayload.problemStatement, 'Read two integers a and b from stdin and print their sum.');
  });
}
