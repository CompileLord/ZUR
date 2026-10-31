import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { CourseService } from '../src/services/course-service.ts';
import { CourseStructureService } from '../src/services/course-structure-service.ts';
import { CourseValidationService } from '../src/services/course-validation-service.ts';

// A step the author never filled in must block publishing, never ship as "Option 1 / Option 2".
test('newly added steps start empty and block publishing until written', async () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const author = 'user-author-1';
  const course = new CourseService(db).createCourseDraft(author, { title: 'Placeholders' });
  const structure = new CourseStructureService(db);
  const mod = structure.addModule(author, course.id, 'Basics');
  const lesson = structure.addLesson(author, course.id, mod.id, 'First lesson');
  const steps = (['theory', 'quiz', 'python'] as const).map((type) => structure.addStep(author, course.id, lesson.id, { title: `New ${type}`, type }));

  const result = await new CourseValidationService(db).validateCourseDraft(author, course.id);
  const fieldsFor = (stepId: string) => result.errors.filter((e: any) => e.stepId === stepId).map((e: any) => e.field);
  assert.ok(fieldsFor(steps[0].id).includes('markdown'), 'theory needs written content');
  assert.ok(fieldsFor(steps[1].id).includes('prompt'), 'quiz needs a real question');
  assert.ok(fieldsFor(steps[2].id).includes('problemStatement'), 'python needs a problem statement');

  const quiz = JSON.parse((db.prepare('SELECT content_payload FROM step_contents WHERE step_id = ?').get(steps[1].id) as any).content_payload);
  assert.equal(JSON.stringify(quiz).includes('Option 1'), false);
});

test('the starter step of a new course is empty and blocks publishing until written', async () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const course = new CourseService(db).createCourseDraft('user-author-1', { title: 'Fresh course' });
  const starter = db.prepare(`SELECT s.id, c.content_payload FROM steps s JOIN step_contents c ON c.step_id = s.id
    JOIN lessons l ON l.id = s.lesson_id JOIN modules m ON m.id = l.module_id WHERE m.course_id = ?`).get(course.id) as { id: string; content_payload: string };
  assert.equal(JSON.parse(starter.content_payload).markdown, '');
  const result = await new CourseValidationService(db).validateCourseDraft('user-author-1', course.id);
  assert.ok(result.errors.some((e: any) => e.stepId === starter.id && e.field === 'markdown'));
});
