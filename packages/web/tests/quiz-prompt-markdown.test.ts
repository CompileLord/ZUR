import test from 'node:test';
import assert from 'node:assert/strict';
import { renderQuizStepPage } from '../src/pages/learning/QuizStepPage.ts';

const base = {
  courseTitle: 'Python Basics', courseOverviewUrl: '/learn/enr-1', lessonTitle: 'Loops',
  stepTitle: 'Range quiz', stepOrdinalText: 'Step 1 of 2', isRequired: true, estimatedDurationMinutes: 2,
  quizType: 'single_choice' as const, options: [{ id: 'a', text: '3' }], enrollmentId: 'enr-1',
  stepId: 's-1', isCompleted: false,
};

test('quiz prompt renders fenced code as a code block, not stray backticks', () => {
  const html = renderQuizStepPage({ ...base, prompt: 'What does this print?\n\n```python\nfor i in range(3):\n    print(i)\n```' });
  assert.match(html, /<pre><code class="language-python">for i in range\(3\):\n {4}print\(i\)<\/code><\/pre>/);
  assert.equal(html.includes('```'), false);
});

test('quiz prompt still escapes raw HTML', () => {
  const html = renderQuizStepPage({ ...base, prompt: 'Pick one <img src=x onerror=alert(1)>' });
  assert.equal(/<img/i.test(html), false);
});
