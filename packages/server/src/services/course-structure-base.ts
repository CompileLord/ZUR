import { DatabaseSync } from 'node:sqlite';
import { NotFoundError } from 'zur-shared';

export class CourseStructureBase {
  protected db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  protected verifyCourseOwner(userId: string, courseId: string): void {
    const course = this.db.prepare('SELECT owner_id FROM courses WHERE id = ?').get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }
    if (course.owner_id !== userId) {
      const user = this.db.prepare('SELECT capabilities FROM users WHERE id = ?').get(userId) as any;
      const caps = user ? JSON.parse(user.capabilities || '[]') : [];
      if (!caps.includes('admin')) {
        throw new NotFoundError("This page isn't available.");
      }
    }
  }

  protected bumpCourseRevision(courseId: string): void {
    this.db
      .prepare(
        "UPDATE courses SET draft_revision = draft_revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .run(courseId);
  }

  protected getStepInCourse(stepId: string, courseId: string): any {
    const step = this.db
      .prepare(
        `SELECT s.* FROM steps s
         JOIN lessons l ON s.lesson_id = l.id
         JOIN modules m ON l.module_id = m.id
         WHERE s.id = ? AND m.course_id = ?`
      )
      .get(stepId, courseId) as any;
    if (!step) {
      throw new NotFoundError('Step not found in this course');
    }
    return step;
  }

  protected getLessonInCourse(lessonId: string, courseId: string): any {
    const lesson = this.db
      .prepare(
        `SELECT l.* FROM lessons l
         JOIN modules m ON l.module_id = m.id
         WHERE l.id = ? AND m.course_id = ?`
      )
      .get(lessonId, courseId) as any;
    if (!lesson) {
      throw new NotFoundError('Lesson not found in this course');
    }
    return lesson;
  }

  protected getModuleInCourse(moduleId: string, courseId: string): any {
    const mod = this.db
      .prepare('SELECT id FROM modules WHERE id = ? AND course_id = ?')
      .get(moduleId, courseId) as any;
    if (!mod) {
      throw new NotFoundError('Module not found in this course');
    }
    return mod;
  }
}
