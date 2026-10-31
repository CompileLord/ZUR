import test from 'node:test';
import assert from 'node:assert/strict';
import { passedQuizFeedback, renderQuizWorkspaceContent } from '../src/pages/learning/QuizStepPage.ts';

const content = {
  quizType: 'single_choice', prompt: 'Pick', explanation: 'Use `=` to assign.',
  options: [{ id: 'a', text: 'n = 10', isCorrect: true }, { id: 'b', text: 'let n = 10', isCorrect: false }],
};

test('a passed quiz reopens showing the correct answer and the explanation', () => {
  const feedback = passedQuizFeedback(content, true);
  assert.deepEqual(feedback, { isPassed: true, verdict: 'PASSED', explanation: 'Use `=` to assign.', correctOptionIds: ['a'] });
  const { workspaceContent } = renderQuizWorkspaceContent({
    courseTitle: 'C', courseOverviewUrl: '/learn/e', lessonTitle: 'L', stepTitle: 'Q', stepOrdinalText: 'Step 1 of 1',
    isRequired: true, estimatedDurationMinutes: 1, quizType: 'single_choice', prompt: 'Pick',
    options: content.options.map(({ id, text }) => ({ id, text })), enrollmentId: 'e', stepId: 's',
    isCompleted: true, selectedOptionIds: feedback!.correctOptionIds, feedback,
  });
  assert.match(workspaceContent, /<code>=<\/code> to assign/);
});

test('an unpassed quiz, or content without answer keys, gets no revisit feedback', () => {
  assert.equal(passedQuizFeedback(content, false), null);
  assert.equal(passedQuizFeedback({ ...content, options: content.options.map(({ id, text }) => ({ id, text })) }, true), null);
});
