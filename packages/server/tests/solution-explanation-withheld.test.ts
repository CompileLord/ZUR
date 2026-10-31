import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { CourseService } from '../src/services/course-service.ts';

function withExplanation() {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const { pinned_version_id: versionId } = db.prepare("SELECT pinned_version_id FROM enrollments WHERE id = 'enr-ada'").get() as { pinned_version_id: string };
  const { snapshot_data } = db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(versionId) as { snapshot_data: string };
  const snapshot = JSON.parse(snapshot_data);
  for (const mod of snapshot.modules) for (const lesson of mod.lessons) for (const step of lesson.steps) {
    if (step.id === 'step-6-python-evenodd') step.content = { ...step.content, solutionExplanation: 'Read the number, then test n % 2.' };
  }
  db.prepare('UPDATE course_versions SET snapshot_data = ? WHERE id = ?').run(JSON.stringify(snapshot), versionId);
  return new CourseService(db);
}

// The worked explanation gives the answer away, so learners get it only after passing the step.
test('python solution explanation is withheld until the step is passed', () => {
  const courses = withExplanation();
  const before = courses.getEnrolledStepContent('user-student-1', 'enr-ada', 'step-6-python-evenodd');
  assert.equal(before.content.solutionExplanation, undefined);
  const after = courses.getEnrolledStepContent('user-student-1', 'enr-ada', 'step-6-python-evenodd', { revealAnswers: true });
  assert.equal(after.content.solutionExplanation, 'Read the number, then test n % 2.');
});
