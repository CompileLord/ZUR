import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAuthorCoursesPage } from '../src/pages/author/AuthorCoursesPage.ts';
import { renderCourseBuilderPage } from '../src/pages/author/CourseBuilderPage.ts';
import { renderTheoryEditorPage } from '../src/pages/author/TheoryEditorPage.ts';
import { renderAuthorPreviewPage } from '../src/pages/author/AuthorPreviewPage.ts';
import { renderEnrolledCoursePage } from '../src/pages/learning/EnrolledCoursePage.ts';

const attack = 'Lesson"><img src=x onerror=alert(1)>';
const noInjectedImage = (html: string) => {
  assert.doesNotMatch(html, /<img src=x onerror=/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
};

test('S2 author and learning renderers escape untrusted course and step text', () => {
  const user = { displayName: attack, email: 'author@example.test', capabilities: ['student', 'author'] };
  noInjectedImage(renderAuthorCoursesPage({ user, courses: [{ id: 'course-1', title: attack, publicationStatus: 'draft', hasUnpublishedChanges: true, studentCount: 0, lastEditTime: new Date().toISOString() }] }));
  noInjectedImage(renderCourseBuilderPage({ courseId: 'course-1', courseTitle: attack, publicationState: 'draft', hasUnpublishedChanges: true, modules: [{ id: 'm1', courseId: 'course-1', title: attack, position: 0, lessons: [{ id: 'l1', moduleId: 'm1', title: attack, position: 0, steps: [{ id: 's1', lessonId: 'l1', title: attack, type: 'theory', position: 0, isRequired: true, estimatedDurationMinutes: 5 }] }] }] }));
  noInjectedImage(renderTheoryEditorPage({ courseId: 'course-1', courseTitle: attack, publicationState: 'draft', hasUnpublishedChanges: true, stepId: 's1', stepTitle: attack, markdown: '</textarea><img src=x onerror=alert(1)>', revision: 1, isRequired: true, estimatedDurationMinutes: 5 }));
  const preview = renderAuthorPreviewPage({ courseId: 'course-1', courseTitle: attack, stepId: 's1', stepTitle: attack, stepType: 'quiz', content: { prompt: attack, options: [{ id: 'o1', text: attack }] }, returnEditorUrl: 'javascript:alert(1)' });
  noInjectedImage(preview);
  assert.doesNotMatch(preview, /href="javascript:/);
  noInjectedImage(renderEnrolledCoursePage({ user, enrollmentId: 'e1', courseId: 'course-1', title: attack, description: attack, difficulty: 'beginner', estimatedDurationMinutes: 5, pinnedVersionNumber: 1, percentage: 0, completedRequired: 0, totalRequired: 1, isCompleted: false, modules: [{ id: 'm1', title: attack, lessons: [{ id: 'l1', title: attack, steps: [{ id: 's1', title: attack, type: 'theory', isRequired: true, estimatedDurationMinutes: 5, isCompleted: false, isWaived: false }] }] }] }));
  const legacy = renderEnrolledCoursePage({ user, enrollmentId: 'e1', courseId: 'course-1', title: 'Course', description: '', difficulty: 'beginner', estimatedDurationMinutes: 0, pinnedVersionNumber: 1, percentage: 0, completedRequired: 0, totalRequired: 1, isCompleted: false, modules: [{ id: 'm1', title: 'Module 1: Basics', lessons: [{ id: 'l1', title: 'Lesson 1: Start', steps: [{ id: 's1', title: 'Step', type: 'theory', isRequired: true, estimatedDurationMinutes: 0, isCompleted: false, isWaived: false }] }] }] });
  assert.match(legacy, /Module 1: Basics/);
  assert.match(legacy, /Lesson 1: Start/);
  assert.doesNotMatch(legacy, /Module 1: Module 1:|Lesson 1: Lesson 1:|~0 mins/);
});
