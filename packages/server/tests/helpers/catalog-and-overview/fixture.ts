import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../../../src/db/database.ts';
import { runMigrations } from '../../../src/db/migrate.ts';
import { seedDatabase } from '../../../src/db/seed.ts';
import { createServer } from '../../../src/server.ts';
import { CourseService } from '../../../src/services/course-service.ts';
import { CoursePublicationService } from '../../../src/services/course-publication-service.ts';
import type { AddressInfo } from 'node:net';

export async function setupCatalogFixture(t: TestContext) {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const courseService = new CourseService(db);
  const publicationService = new CoursePublicationService(db);

  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  const authorId = 'user-author-1'; // guido@zur.internal (AuthorPass123!)
  const studentId = 'user-student-1'; // ada@zur.internal (StudentPass123!)

  // Insert test categories
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, slug, created_at)
    VALUES ('cat-core', 'Core Python', 'core-python', ?)
  `).run(now);
  db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, slug, created_at)
    VALUES ('cat-web', 'Web Backend', 'web-backend', ?)
  `).run(now);

  // 1. Author sign in
  const authorRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'guido@zur.internal', password: 'AuthorPass123!' }),
  });
  assert.strictEqual(authorRes.status, 200);
  const authorSession = (await authorRes.json()) as any;
  const authorToken = authorSession.token;

  // 2. Student sign in
  const studentRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ada@zur.internal', password: 'StudentPass123!' }),
  });
  assert.strictEqual(studentRes.status, 200);
  const studentSession = (await studentRes.json()) as any;
  const studentToken = studentSession.token;

  // 3. Set up courses in different states:
  // Course A: Public, published, beginner, cat-core
  const courseA = courseService.createCourseDraft(authorId, {
    title: 'Python Foundations For Beginners',
  });
  courseService.updateCourseMetadata(authorId, courseA.id, 1, {
    description: 'Learn syntax, loops, and basic constructs.',
    difficulty: 'beginner',
    language: 'en',
    categoryId: 'cat-core',
    learningOutcomes: ['Write loops', 'Declare functions'],
    prerequisites: 'None',
    estimatedDurationMinutes: 60,
  });
  courseService.updateCourseAccessSettings(authorId, courseA.id, {
    visibility: 'public',
    enrollmentPolicy: 'open',
  });
  const draftARow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseA.id) as any;
  await publicationService.publishCourse(authorId, courseA.id, {
    expectedRevision: draftARow.draft_revision,
    changeSummary: 'Release A',
  });

  // Course B: Public, published, advanced, cat-web
  const courseB = courseService.createCourseDraft(authorId, {
    title: 'Advanced Async IO Systems',
  });
  courseService.updateCourseMetadata(authorId, courseB.id, 1, {
    description: 'Master coroutines and concurrent event loops.',
    difficulty: 'advanced',
    language: 'en',
    categoryId: 'cat-web',
    learningOutcomes: ['Build event loops', 'Handle async context managers'],
    estimatedDurationMinutes: 180,
  });
  courseService.updateCourseAccessSettings(authorId, courseB.id, {
    visibility: 'public',
    enrollmentPolicy: 'open',
  });
  const draftBRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseB.id) as any;
  await publicationService.publishCourse(authorId, courseB.id, {
    expectedRevision: draftBRow.draft_revision,
    changeSummary: 'Release B',
  });

  // Course C: Unlisted, published, invitation-only
  const courseC = courseService.createCourseDraft(authorId, {
    title: 'Unlisted Corporate Pilot',
  });
  courseService.updateCourseMetadata(authorId, courseC.id, 1, {
    description: 'Special cohort course.',
    difficulty: 'intermediate',
    language: 'en',
    categoryId: 'cat-core',
    learningOutcomes: ['Corporate patterns'],
    estimatedDurationMinutes: 45,
  });
  courseService.updateCourseAccessSettings(authorId, courseC.id, {
    visibility: 'unlisted',
    enrollmentPolicy: 'invitation_only',
  });
  const draftCRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseC.id) as any;
  await publicationService.publishCourse(authorId, courseC.id, {
    expectedRevision: draftCRow.draft_revision,
    changeSummary: 'Release C',
  });

  // Course D: Private, published
  const courseD = courseService.createCourseDraft(authorId, {
    title: 'Private Teacher Notes',
  });
  courseService.updateCourseMetadata(authorId, courseD.id, 1, {
    description: 'Internal private notes.',
    difficulty: 'beginner',
    language: 'en',
    categoryId: 'cat-core',
    learningOutcomes: ['Teaching methods'],
    estimatedDurationMinutes: 30,
  });
  courseService.updateCourseAccessSettings(authorId, courseD.id, {
    visibility: 'private',
    enrollmentPolicy: 'invitation_only',
  });
  const draftDRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseD.id) as any;
  await publicationService.publishCourse(authorId, courseD.id, {
    expectedRevision: draftDRow.draft_revision,
    changeSummary: 'Release D',
  });

  // Course E: Public, draft (never published)
  const courseE = courseService.createCourseDraft(authorId, {
    title: 'Work In Progress Draft Course',
  });

  // Course F: Public, published, but suspended
  const courseF = courseService.createCourseDraft(authorId, {
    title: 'Suspended Course Investigation',
  });
  courseService.updateCourseMetadata(authorId, courseF.id, 1, {
    description: 'Investigative flagged course.',
    difficulty: 'beginner',
    language: 'en',
    categoryId: 'cat-core',
    learningOutcomes: ['Investigate behaviors'],
    estimatedDurationMinutes: 30,
  });
  courseService.updateCourseAccessSettings(authorId, courseF.id, {
    visibility: 'public',
    enrollmentPolicy: 'open',
  });
  const draftFRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseF.id) as any;
  await publicationService.publishCourse(authorId, courseF.id, {
    expectedRevision: draftFRow.draft_revision,
    changeSummary: 'Release F',
  });
  db.prepare('UPDATE courses SET is_suspended = 1 WHERE id = ?').run(courseF.id);

  // Course G: Public, published, Spanish language (non-English)
  const courseG = courseService.createCourseDraft(authorId, {
    title: 'Fundamentos de Python en Español',
  });
  courseService.updateCourseMetadata(authorId, courseG.id, 1, {
    description: 'Aprende los conceptos fundamentales de Python en español.',
    difficulty: 'beginner',
    language: 'es',
    categoryId: 'cat-core',
    learningOutcomes: ['Escribir bucles', 'Definir funciones'],
    prerequisites: 'Ninguno',
    estimatedDurationMinutes: 90,
  });
  courseService.updateCourseAccessSettings(authorId, courseG.id, {
    visibility: 'public',
    enrollmentPolicy: 'open',
  });
  const draftGRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseG.id) as any;
  await publicationService.publishCourse(authorId, courseG.id, {
    expectedRevision: draftGRow.draft_revision,
    changeSummary: 'Release G Spanish',
  });

  return { db, courseService, publicationService, server, port, baseUrl, authorId, studentId, now, authorRes, authorSession, authorToken, studentRes, studentSession, studentToken, courseA, draftARow, courseB, draftBRow, courseC, draftCRow, courseD, draftDRow, courseE, courseF, draftFRow, courseG, draftGRow };
}

export type CatalogFixture = Awaited<ReturnType<typeof setupCatalogFixture>>;
