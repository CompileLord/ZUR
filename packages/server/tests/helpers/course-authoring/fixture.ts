import type { TestContext } from 'node:test';
import { getDatabase } from '../../../src/db/database.ts';
import { runMigrations } from '../../../src/db/migrate.ts';
import { seedDatabase } from '../../../src/db/seed.ts';
import { CourseService } from '../../../src/services/course-service.ts';
import { CourseStructureService } from '../../../src/services/course-structure-service.ts';
import { CourseAutosaveService } from '../../../src/services/course-autosave-service.ts';

export async function setupAuthoringFixture(_t: TestContext) {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const courseService = new CourseService(db);
  const structureService = new CourseStructureService(db);
  const autosaveService = new CourseAutosaveService(db);

  // Seeded user: Ada Lovelace
  const adaId = 'user-student-1';
  // Seeded author: Charles Babbage
  const authorId = 'user-author-1';


  const state = { createdCourseId: '' };

  return { db, courseService, structureService, autosaveService, adaId, authorId, state };
}

export type AuthoringFixture = Awaited<ReturnType<typeof setupAuthoringFixture>>;
