import test from 'node:test';
import { setupAuthoringFixture } from './helpers/course-authoring/fixture.ts';
import { draftAndStructureTests } from './helpers/course-authoring/drafts-and-structure.ts';
import { previewPublicationSecurityTests } from './helpers/course-authoring/preview-publication-security.ts';

test('Course Authoring, Structure & Autosave (T029-T031, T038)', async (t) => {
  const f = await setupAuthoringFixture(t);
  await draftAndStructureTests(t, f);
  await previewPublicationSecurityTests(t, f);
});
