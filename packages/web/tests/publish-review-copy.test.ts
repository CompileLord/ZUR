import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCoursePublishPage } from '../src/pages/author/CoursePublishPage.ts';

const html = renderCoursePublishPage({
  courseId: 'c1', courseTitle: 'Course', publicationState: 'draft', hasUnpublishedChanges: true, draftRevision: 3,
  currentVersionNumber: null, newVersionNumber: 1, activeEnrolledStudents: 0,
  stepTypeMap: { 'step-py': 'python', 'step-quiz': 'quiz' },
  validation: {
    isValid: false, draftRevision: 3, warnings: [],
    errors: [
      { stepId: 'step-py', message: 'Missing reference solution', blocking: true, field: 'referenceSolution' },
      { stepId: 'step-quiz', message: 'Quiz needs a question', blocking: true, field: 'prompt' },
      { message: 'Course needs a description', blocking: true, field: 'description' },
    ],
  },
} as any);

test('only Python steps offer "Edit tests"', () => {
  assert.match(html, /id="edit-tests-step-py"/);
  assert.doesNotMatch(html, /id="edit-tests-step-quiz"/);
  assert.doesNotMatch(html, /id="edit-tests-general"/);
});

test('the summary counts items to fix, not "exercises"', () => {
  assert.match(html, /3 items need review/);
  assert.doesNotMatch(html, /exercises? needs? review/);
});
