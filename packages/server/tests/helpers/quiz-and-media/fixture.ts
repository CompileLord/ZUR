import type { TestContext } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { getDatabase } from '../../../src/db/database.ts';
import { runMigrations } from '../../../src/db/migrate.ts';
import { seedDatabase } from '../../../src/db/seed.ts';
import { CourseService } from '../../../src/services/course-service.ts';
import { CourseStructureService } from '../../../src/services/course-structure-service.ts';
import { MediaService } from '../../../src/services/media-service.ts';
import { QuizService } from '../../../src/services/quiz-service.ts';
import { ExerciseAuthoringService } from '../../../src/services/exercise-authoring-service.ts';

export async function setupQuizMediaFixture(_t: TestContext) {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const courseService = new CourseService(db);
  const structureService = new CourseStructureService(db);
  const testUploadDir = path.join(os.tmpdir(), 'zur-test-uploads');
  const mediaService = new MediaService(db, testUploadDir);
  const quizService = new QuizService(db);
    const exerciseService = new ExerciseAuthoringService(db);

  const authorId = 'user-author-1'; // Seeded author: Charles Babbage
  const studentId = 'user-student-1'; // Seeded student: Ada Lovelace

  return { db, courseService, structureService, testUploadDir, mediaService, quizService, authorId, studentId, exerciseService };
}

export type QuizMediaFixture = Awaited<ReturnType<typeof setupQuizMediaFixture>>;
