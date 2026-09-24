import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCoursePublishPage } from '../src/pages/author/CoursePublishPage.ts';

test('P27 Course Review and Publication Page (T041)', async (t) => {
  const courseId = 'course-123';
  const courseTitle = 'Python Foundations';

  await t.test('Renders blocking validation errors and disables publish action', () => {
    const html = renderCoursePublishPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      draftRevision: 3,
      currentVersionNumber: null,
      newVersionNumber: 1,
      activeEnrolledStudents: 0,
      validation: {
        isValid: false,
        draftRevision: 3,
        errors: [
          {
            stepId: 'step-1',
            message: 'Python exercise "Sum of Two Numbers" is missing a reference solution',
            blocking: true,
            field: 'referenceSolution',
          },
          {
            stepId: 'step-2',
            message: 'Single-choice quiz "Types Quiz" must have exactly 1 correct answer',
            blocking: true,
            field: 'options',
          },
        ],
        warnings: [
          {
            stepId: 'step-1',
            message: 'Python exercise has no hints for learners',
            field: 'hints',
          },
        ],
      },
    });

    assert.ok(html.includes('Review publication'), 'Page header must be present');
    assert.ok(html.includes('Draft Rev 3'), 'Draft revision badge present');
    assert.ok(html.includes('Blocking issues (2)'), 'Blocking errors section present');
    assert.ok(html.includes('missing a reference solution'), 'Reference solution error displayed');
    assert.ok(html.includes('Edit step →'), 'Jump link to step editor present');
    assert.ok(html.includes('Warnings (1)'), 'Warnings section present');
    assert.ok(html.includes('Fix blocking issues before publishing'), 'Blocking issue guidance present');
    assert.ok(html.includes('disabled aria-disabled="true"'), 'Publish button must be disabled');
    assert.ok(
      html.includes('Existing students will continue on their current version. New enrollments will receive this update.'),
      'Must display version impact statement'
    );
  });

  await t.test('Renders valid pre-publish state and enabled publish button', () => {
    const html = renderCoursePublishPage({
      courseId,
      courseTitle,
      publicationState: 'published',
      hasUnpublishedChanges: true,
      draftRevision: 5,
      currentVersionNumber: 1,
      newVersionNumber: 2,
      activeEnrolledStudents: 12,
      validation: {
        isValid: true,
        draftRevision: 5,
        errors: [],
        warnings: [],
      },
      showConfirmModal: true,
    });

    assert.ok(html.includes('Pre-publish checklist passed with 0 blocking errors'));
    assert.ok(html.includes('Publish Version 2'), 'Update action button present');
    assert.ok(!html.includes('disabled aria-disabled="true"'), 'Publish button must be enabled');
    assert.ok(html.includes('Current published version:'), 'Current version label');
    assert.ok(html.includes('Version 1'), 'Current version value');
    assert.ok(html.includes('12'), 'Active enrolled student count');
    assert.ok(html.includes('Confirm Publication'), 'Confirmation modal dialog present');
  });

  await t.test('Renders stale revision warning when draft modified concurrently', () => {
    const html = renderCoursePublishPage({
      courseId,
      courseTitle,
      publicationState: 'draft',
      hasUnpublishedChanges: true,
      draftRevision: 4,
      newVersionNumber: 1,
      activeEnrolledStudents: 0,
      validation: {
        isValid: true,
        draftRevision: 4,
        errors: [],
        warnings: [],
      },
      staleRevision: true,
    });

    assert.ok(html.includes('Stale Revision Detected'), 'Stale revision title present');
    assert.ok(html.includes('Revalidate current draft'), 'Revalidation action present');
  });

  await t.test('Renders release receipt view after successful publication', () => {
    const html = renderCoursePublishPage({
      courseId,
      courseTitle,
      publicationState: 'published',
      hasUnpublishedChanges: false,
      draftRevision: 6,
      newVersionNumber: 2,
      activeEnrolledStudents: 15,
      validation: {
        isValid: true,
        draftRevision: 6,
        errors: [],
        warnings: [],
      },
      receipt: {
        versionNumber: 2,
        versionId: 'ver-uuid-999',
        publishedAt: '2026-09-24T12:00:00.000Z',
        studentCountPinnedToOldVersions: 15,
      },
    });

    assert.ok(html.includes('Publication Receipt'), 'Receipt header present');
    assert.ok(html.includes('Released Version 2'), 'Version badge present');
    assert.ok(html.includes('ver-uuid-999'), 'Version ID present');
    assert.ok(html.includes('15'), 'Old version pinned student count present');
    assert.ok(html.includes('Invite students'), 'Invite action present');
    assert.ok(html.includes('View course'), 'View course action present');
    assert.ok(html.includes('Back to editor'), 'Back to editor action present');
  });
});
