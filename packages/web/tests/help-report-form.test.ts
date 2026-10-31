import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHelpPage } from '../src/pages/public/HelpPage.ts';

const courses = [
  { id: 'course-py-101', title: 'Python Foundations' },
  { id: 'course-js-201', title: 'JavaScript Basics' },
];

test('The help report form has no code-draft option because the help page has no code to send', () => {
  const html = renderHelpPage({ courseId: 'course-py-101', isReportModalOpen: true, isSignedIn: true, courses });
  assert.ok(!html.includes('report-include-code'));
  assert.ok(!/code draft/i.test(html));
});

test('Signed-out visitors see a sign-in prompt with a return path instead of the form', () => {
  const html = renderHelpPage({ isReportModalOpen: true, returnTo: '/help?report=broken_exercise' });
  assert.ok(!html.includes('id="report-issue-form"'));
  assert.ok(!html.includes('id="report-description"'));
  assert.match(html, /id="report-signin"[^>]*href="\/sign-in\?returnTo=%2Fhelp%3Freport%3Dbroken_exercise"/);
});

test('The sign-in return path is escaped', () => {
  const html = renderHelpPage({ returnTo: '/help?x="><script>alert(1)</script>' });
  assert.ok(html.includes('id="report-signin"'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
});

test('Signed-in learners pick an enrolled course by title and never type a raw course ID', () => {
  const html = renderHelpPage({ isSignedIn: true, courses, courseId: 'course-js-201', isReportModalOpen: true });
  assert.match(html, /<select[^>]*id="report-course-id"/);
  assert.ok(html.includes('Python Foundations') && html.includes('JavaScript Basics'));
  assert.match(html, /<option value="course-js-201" selected>/);
  assert.ok(!/type="text"[^>]*report-course-id|report-course-id[^>]*type="text"/.test(html));
  assert.ok(!html.includes('Course ID'));
  assert.ok(!html.includes('e.g. course-python-foundations'));
});

test('A course opened from context that is not in the enrolled list is still selectable by name', () => {
  const html = renderHelpPage({ isSignedIn: true, courses, courseId: 'course-other-9', isReportModalOpen: true });
  assert.match(html, /<option value="course-other-9" selected>The course you were viewing<\/option>/);
});

test('Signed-in learners without courses are told what to do instead of getting a form that cannot submit', () => {
  const none = renderHelpPage({ isSignedIn: true, courses: [], isReportModalOpen: true });
  assert.ok(!none.includes('id="report-issue-form"'));
  assert.match(none, /href="\/courses"/);
  const failed = renderHelpPage({ isSignedIn: true, courses: null, isReportModalOpen: true });
  assert.ok(!failed.includes('id="report-issue-form"'));
  assert.ok(failed.includes('could not load your courses'));
});
