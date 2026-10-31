import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './database.ts';
import { runMigrations } from './migrate.ts';
import { assertDemoSeedAllowed } from './demo-guard.ts';
import { hashPassword } from '../services/password-service.ts';
import type { CourseDef, MentorDef, StepDef } from './demo/helpers.ts';
import { pythonFundamentals } from './demo/python-fundamentals.ts';
import { oopPython } from './demo/oop-python.ts';
import { dsaPython } from './demo/dsa-python.ts';

/**
 * Additive demo catalogue: 2 mentors (author accounts) and 3 fully published courses.
 * Unlike db:seed this never wipes existing data. Re-running skips courses that already exist;
 * pass --reset to delete and recreate only the demo courses (and anything that points at them).
 *   npm run db:seed-demo [-- --reset | --verify]
 */

export const demoMentors: MentorDef[] = [
  { id: 'user-demo-mentor-elena', email: 'elena.marsh@zur.local', name: 'Elena Marsh', password: 'MentorPass123!' },
  { id: 'user-demo-mentor-rohan', email: 'rohan.iyer@zur.local', name: 'Rohan Iyer', password: 'MentorPass123!' },
];

export const demoCourses: CourseDef[] = [pythonFundamentals, oopPython, dsaPython];

const CATEGORY_ID = 'cat-programming';
const clean = (s: string): string => s.replaceAll('¦', '`');
const courseId = (c: CourseDef) => `course-demo-${c.slug}`;

/** Runs every reference solution against its tests with the local python3. Returns failures. */
export function verifyReferenceSolutions(courses: CourseDef[] = demoCourses): string[] {
  const failures: string[] = [];
  for (const course of courses) {
    for (const mod of course.modules) {
      for (const lesson of mod.lessons) {
        for (const step of lesson.steps) {
          if (step.type !== 'python') continue;
          const hidden = step.tests.filter((x) => x.hidden).length;
          if (step.tests.length < 2 || hidden < 1 && step.tests.length < 3) failures.push(`${step.title}: needs more tests`);
          for (const [i, tc] of step.tests.entries()) {
            const run = spawnSync('python3', ['-I', '-c', step.solution], { input: tc.stdin, encoding: 'utf8', timeout: 10000 });
            const got = (run.stdout ?? '').replace(/\s+$/, '');
            if (run.status !== 0 || got !== tc.out.replace(/\s+$/, '')) {
              failures.push(`${course.slug} / ${step.title} / test ${i}: expected ${JSON.stringify(tc.out)}, got ${JSON.stringify(got)} ${run.stderr ?? ''}`);
            }
          }
        }
      }
    }
  }
  return failures;
}

function contentFor(step: StepDef): unknown {
  switch (step.type) {
    case 'theory':
      return { kind: 'theory', markdown: clean(step.markdown) };
    case 'video':
      return { kind: 'video', videoUrl: step.videoUrl, provider: step.provider, transcript: clean(step.transcript), captionVerified: true };
    case 'quiz':
      return {
        kind: 'quiz',
        quizType: step.quizType,
        prompt: clean(step.prompt),
        options: step.options.map(([text, isCorrect], i) => ({ id: `opt-${i + 1}`, text: clean(text), isCorrect })),
        explanation: clean(step.explanation),
      };
    case 'python':
      return {
        kind: 'python',
        problemStatement: clean(step.statement),
        inputFormat: step.input,
        outputFormat: step.output,
        constraints: step.constraints,
        starterCode: step.starter,
        referenceSolution: step.solution,
        hints: step.hints.map(clean),
        solutionExplanation: clean(step.explanation),
        runtimeLimits: { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 },
      };
  }
}

export function resetDemoCourses(dbPath?: string): void {
  const db = getDatabase(dbPath);
  const ids = demoCourses.map(courseId);
  const marks = ids.map(() => '?').join(',');
  const stepIds = (db.prepare(
    `SELECT s.id FROM steps s JOIN lessons l ON l.id = s.lesson_id JOIN modules m ON m.id = l.module_id WHERE m.course_id IN (${marks})`,
  ).all(...ids) as Array<{ id: string }>).map((r) => r.id);
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((r) => r.name);
  const cols = (table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN;');
  try {
    const enrollmentIds = (db.prepare(`SELECT id FROM enrollments WHERE course_id IN (${marks})`).all(...ids) as Array<{ id: string }>).map((r) => r.id);
    const del = (table: string, column: string, values: string[]) => {
      if (!values.length || !tables.includes(table) || !cols(table).includes(column)) return;
      db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${values.map(() => '?').join(',')})`).run(...values);
    };
    for (const table of tables) {
      if (['steps', 'step_contents', 'test_cases', 'enrollments', 'courses', 'modules', 'lessons', 'course_versions'].includes(table)) continue;
      del(table, 'step_id', stepIds);
      del(table, 'enrollment_id', enrollmentIds);
      del(table, 'course_id', ids);
    }
    del('test_cases', 'step_id', stepIds);
    del('step_contents', 'step_id', stepIds);
    del('steps', 'id', stepIds);
    db.prepare(`DELETE FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id IN (${marks}))`).run(...ids);
    del('modules', 'course_id', ids);
    del('enrollments', 'course_id', ids);
    del('course_versions', 'course_id', ids);
    del('courses', 'id', ids);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

export function seedDemoCatalogue(dbPath?: string, options: { reset?: boolean } = {}): { created: string[]; skipped: string[] } {
  runMigrations(dbPath);
  const db = getDatabase(dbPath);
  if (options.reset) resetDemoCourses(dbPath);

  const created: string[] = [];
  const skipped: string[] = [];
  const now = new Date().toISOString();

  db.exec('BEGIN;');
  try {
    db.prepare(`INSERT OR IGNORE INTO categories (id, name, slug, created_at) VALUES (?, 'Programming', 'programming', ?)`).run(CATEGORY_ID, now);
    const categoryId = (db.prepare(`SELECT id FROM categories WHERE slug = 'programming'`).get() as { id: string }).id;

    const mentorIds = new Map<string, string>();
    for (const m of demoMentors) {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(m.email) as { id: string } | undefined;
      if (existing) {
        mentorIds.set(m.email, existing.id);
        continue;
      }
      db.prepare(
        `INSERT INTO users (id, email, password_hash, display_name, email_verified, capabilities, account_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, 'active', ?, ?)`,
      ).run(m.id, m.email, hashPassword(m.password), m.name, JSON.stringify(['student', 'author']), now, now);
      mentorIds.set(m.email, m.id);
    }

    for (const course of demoCourses) {
      const cid = courseId(course);
      if (db.prepare('SELECT 1 FROM courses WHERE id = ?').get(cid)) {
        skipped.push(course.title);
        continue;
      }
      const ownerId = mentorIds.get(course.mentorEmail)!;
      const total = course.modules.flatMap((m) => m.lessons).flatMap((l) => l.steps).reduce((n, s) => n + s.minutes, 0);

      db.prepare(
        `INSERT INTO courses (
           id, owner_id, title, description, category_id, tags, difficulty, language, learning_outcomes, prerequisites,
           estimated_duration_minutes, visibility, enrollment_policy, publication_status, is_suspended, draft_revision, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'en', ?, ?, ?, 'public', 'open', 'draft', 0, 1, ?, ?)`,
      ).run(cid, ownerId, course.title, course.description, categoryId, JSON.stringify(course.tags), course.difficulty,
        JSON.stringify(course.outcomes), course.prerequisites, total, now, now);

      const snapshotModules = course.modules.map((mod, mi) => {
        const moduleId = `${cid}-m${mi + 1}`;
        db.prepare('INSERT INTO modules (id, course_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(moduleId, cid, mod.title, mi, now, now);
        const lessons = mod.lessons.map((lesson, li) => {
          const lessonId = `${moduleId}-l${li + 1}`;
          db.prepare('INSERT INTO lessons (id, module_id, title, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(lessonId, moduleId, lesson.title, lesson.description, li, now, now);
          const steps = lesson.steps.map((step, si) => {
            const stepId = `${lessonId}-s${si + 1}`;
            db.prepare(
              `INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
            ).run(stepId, lessonId, step.type, step.title, si, step.minutes, now, now);
            const content = contentFor(step) as Record<string, unknown>;
            db.prepare('INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, ?)')
              .run(`${stepId}-content`, stepId, JSON.stringify(content), now);
            if (step.type === 'python') {
              const testCases = step.tests.map((tc, ti) => {
                const id = `${stepId}-tc${ti + 1}`;
                db.prepare('INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                  .run(id, stepId, tc.stdin, tc.out, tc.hidden ? 1 : 0, ti, now);
                return { id, stepId, stdin: tc.stdin, expectedStdout: tc.out, isHidden: Boolean(tc.hidden), position: ti, createdAt: now };
              });
              testCases.sort((a, b) => Number(a.isHidden) - Number(b.isHidden) || a.position - b.position);
              content.testCases = testCases;
            }
            return { id: stepId, type: step.type, title: step.title, position: si, isRequired: true, estimatedDurationMinutes: step.minutes, content };
          });
          return { id: lessonId, title: lesson.title, description: lesson.description, position: li, steps };
        });
        return { id: moduleId, title: mod.title, position: mi, lessons };
      });

      const versionId = `${cid}-v1`;
      db.prepare('INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at) VALUES (?, ?, 1, ?, ?)').run(
        versionId, cid, JSON.stringify({
          courseId: cid, versionNumber: 1, sourceRevision: 2, title: course.title, description: course.description,
          categoryId, tags: course.tags, difficulty: course.difficulty, language: 'en', learningOutcomes: course.outcomes,
          prerequisites: course.prerequisites, estimatedDurationMinutes: total, modules: snapshotModules, publishedAt: now,
        }), now);
      db.prepare(`UPDATE courses SET current_version_id = ?, publication_status = 'published', draft_revision = 2, updated_at = ? WHERE id = ?`)
        .run(versionId, now, cid);
      db.prepare(
        `INSERT INTO audit_events (id, actor_id, action, target_type, target_id, reason, metadata, correlation_id, created_at)
         VALUES (?, ?, 'course:publish', 'course', ?, 'Demo catalogue seed', ?, NULL, ?)`,
      ).run(crypto.randomUUID(), ownerId, cid, JSON.stringify({ versionNumber: 1, versionId, previousVersionId: null }), now);
      created.push(course.title);
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
  return { created, skipped };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertDemoSeedAllowed('db:seed-demo');
  const args = process.argv.slice(2);
  if (args.includes('--verify')) {
    const failures = verifyReferenceSolutions();
    if (failures.length) {
      console.error(failures.join('\n'));
      process.exit(1);
    }
    console.log('All reference solutions pass all of their tests.');
  } else {
    const { created, skipped } = seedDemoCatalogue(undefined, { reset: args.includes('--reset') });
    for (const title of created) console.log(`created: ${title}`);
    for (const title of skipped) console.log(`exists (use --reset to rebuild): ${title}`);
    console.log(`Mentors: ${demoMentors.map((m) => `${m.email} / ${m.password}`).join(', ')}`);
  }
}
