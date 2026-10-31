import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCourseSettingsPage } from '../src/pages/author/CourseSettingsPage.ts';

const course = {
  id: 'c-1', title: 'Python foundations', description: 'd', categoryId: 'cat-1', tags: [], difficulty: 'beginner', language: 'en',
  learningOutcomes: [], prerequisites: '', estimatedDurationMinutes: 60, visibility: 'public', enrollmentPolicy: 'open',
  publicationStatus: 'published', draftRevision: 4, currentVersionId: 'v-2',
  versions: [
    { id: 'v-2', versionNumber: 2, publishedAt: '2026-10-20T10:00:00.000Z', activeLearnerCount: 3 },
    { id: 'v-1', versionNumber: 1, publishedAt: '2026-09-01T10:00:00.000Z', activeLearnerCount: 1 },
  ],
} as const;

// Learners stay on the version they enrolled in, so the author needs to see who is where.
test('Settings > Versions marks the current version and shows learners pinned to each', () => {
  const html = renderCourseSettingsPage({ course: course as any, categories: [] });
  const section = html.slice(html.indexOf('data-settings-section="versions"'));
  assert.match(section, /Version 2[\s\S]*Current[\s\S]*3 learners/);
  assert.match(section, /Version 1[\s\S]*1 learner\b/);
});
