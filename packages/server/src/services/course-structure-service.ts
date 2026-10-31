import crypto from 'node:crypto';
import { ValidationError, NotFoundError } from 'zur-shared';
import type { StepTreeSummary, LessonTreeSummary, ModuleTreeSummary } from './course-structure-types.ts';
import type { StepType } from 'zur-shared';
import { CourseStepOperations } from './course-structure-steps.ts';

export type { StepTreeSummary, LessonTreeSummary, ModuleTreeSummary, CourseTree } from './course-structure-types.ts';

export class CourseStructureService extends CourseStepOperations {
  duplicateLesson(userId: string, courseId: string, lessonId: string, targetModuleId?: string): LessonTreeSummary {
    this.verifyCourseOwner(userId, courseId);

    const lesson = this.db.prepare(`
      SELECT l.* FROM lessons l
      JOIN modules m ON l.module_id = m.id
      WHERE l.id = ? AND m.course_id = ?
    `).get(lessonId, courseId) as any;

    if (!lesson) {
      throw new NotFoundError('Lesson to duplicate not found in this course.');
    }

    const moduleId = targetModuleId || lesson.module_id;
    const targetModule = this.db.prepare('SELECT id FROM modules WHERE id = ? AND course_id = ?').get(moduleId, courseId);
    if (!targetModule) {
      throw new ValidationError('Target parent must be a valid module within the course.');
    }

    const newLessonId = crypto.randomUUID();
    const newTitle = `${lesson.title} (Copy)`;
    const maxPos = (this.db.prepare('SELECT MAX(position) as mp FROM lessons WHERE module_id = ?').get(moduleId) as any)?.mp;
    const newPosition = maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO lessons (id, module_id, title, description, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(newLessonId, moduleId, newTitle, lesson.description, newPosition, now, now);

    const originalSteps = this.db.prepare('SELECT * FROM steps WHERE lesson_id = ? ORDER BY position ASC').all(lessonId) as any[];
    const duplicatedSteps: StepTreeSummary[] = [];

    for (const step of originalSteps) {
      const newStepId = crypto.randomUUID();
      this.db.prepare(`
        INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newStepId, newLessonId, step.type, step.title, step.position, step.is_required, step.estimated_duration_minutes, now, now);

      const content = this.db.prepare('SELECT content_payload FROM step_contents WHERE step_id = ?').get(step.id) as any;
      if (content) {
        this.db.prepare(`
          INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at)
          VALUES (?, ?, ?, 1, ?)
        `).run(crypto.randomUUID(), newStepId, content.content_payload, now);
      }

      if (step.type === 'python') {
        const tests = this.db.prepare('SELECT * FROM test_cases WHERE step_id = ?').all(step.id) as any[];
        for (const t of tests) {
          this.db.prepare(`
            INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(crypto.randomUUID(), newStepId, t.stdin, t.expected_stdout, t.is_hidden, t.position, now);
        }
      }

      duplicatedSteps.push({
        id: newStepId,
        lessonId: newLessonId,
        type: step.type as StepType,
        title: step.title,
        position: step.position,
        isRequired: Boolean(step.is_required),
        estimatedDurationMinutes: step.estimated_duration_minutes,
      });
    }

    this.bumpCourseRevision(courseId);

    return {
      id: newLessonId,
      moduleId,
      title: newTitle,
      description: lesson.description,
      position: newPosition,
      steps: duplicatedSteps,
    };
  }

  duplicateModule(userId: string, courseId: string, moduleId: string): ModuleTreeSummary {
    this.verifyCourseOwner(userId, courseId);

    const mod = this.db.prepare('SELECT * FROM modules WHERE id = ? AND course_id = ?').get(moduleId, courseId) as any;
    if (!mod) {
      throw new NotFoundError('Module to duplicate not found in this course.');
    }

    const newModuleId = crypto.randomUUID();
    const newTitle = `${mod.title} (Copy)`;
    const maxPos = (this.db.prepare('SELECT MAX(position) as mp FROM modules WHERE course_id = ?').get(courseId) as any)?.mp;
    const newPosition = maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO modules (id, course_id, title, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(newModuleId, courseId, newTitle, newPosition, now, now);

    const lessons = this.db.prepare('SELECT id FROM lessons WHERE module_id = ? ORDER BY position ASC').all(moduleId) as any[];
    const duplicatedLessons: LessonTreeSummary[] = [];

    for (const l of lessons) {
      const dup = this.duplicateLesson(userId, courseId, l.id, newModuleId);
      duplicatedLessons.push(dup);
    }

    this.bumpCourseRevision(courseId);

    return {
      id: newModuleId,
      courseId,
      title: newTitle,
      position: newPosition,
      lessons: duplicatedLessons,
    };
  }

  moveContent(
    userId: string,
    courseId: string,
    contentType: 'module' | 'lesson' | 'step',
    id: string,
    targetParentId?: string,
    position?: number
  ): { success: boolean; newRevision: number } {
    this.verifyCourseOwner(userId, courseId);
    const now = new Date().toISOString();

    if (contentType === 'module') {
      const mod = this.db.prepare('SELECT * FROM modules WHERE id = ? AND course_id = ?').get(id, courseId) as any;
      if (!mod) throw new NotFoundError('Module not found in this course.');
      if (targetParentId && targetParentId !== courseId) {
        throw new ValidationError('A module can only belong directly to the course.');
      }
      if (position !== undefined) {
        this.db.prepare('UPDATE modules SET position = ?, updated_at = ? WHERE id = ?').run(position, now, id);
      }
    } else if (contentType === 'lesson') {
      const lesson = this.db.prepare(`
        SELECT l.* FROM lessons l
        JOIN modules m ON l.module_id = m.id
        WHERE l.id = ? AND m.course_id = ?
      `).get(id, courseId) as any;
      if (!lesson) throw new NotFoundError('Lesson not found in this course.');

      let newModuleId = lesson.module_id;
      if (targetParentId && targetParentId !== lesson.module_id) {
        const targetMod = this.db.prepare('SELECT id FROM modules WHERE id = ? AND course_id = ?').get(targetParentId, courseId);
        if (!targetMod) {
          throw new ValidationError('Target parent must be a valid module within the same course.');
        }
        newModuleId = targetParentId;
      }

      const newPos = position !== undefined ? position : lesson.position;
      this.db.prepare('UPDATE lessons SET module_id = ?, position = ?, updated_at = ? WHERE id = ?').run(newModuleId, newPos, now, id);
    } else if (contentType === 'step') {
      const step = this.db.prepare(`
        SELECT s.* FROM steps s
        JOIN lessons l ON s.lesson_id = l.id
        JOIN modules m ON l.module_id = m.id
        WHERE s.id = ? AND m.course_id = ?
      `).get(id, courseId) as any;
      if (!step) throw new NotFoundError('Step not found in this course.');

      let newLessonId = step.lesson_id;
      if (targetParentId && targetParentId !== step.lesson_id) {
        const targetLesson = this.db.prepare(`
          SELECT l.id FROM lessons l
          JOIN modules m ON l.module_id = m.id
          WHERE l.id = ? AND m.course_id = ?
        `).get(targetParentId, courseId);
        if (!targetLesson) {
          throw new ValidationError('Target parent must be a valid lesson within the same course.');
        }
        const countRow = this.db.prepare('SELECT COUNT(*) as cnt FROM steps WHERE lesson_id = ?').get(targetParentId) as any;
        if (countRow?.cnt >= 20) {
          throw new ValidationError('A lesson cannot contain more than 20 steps.');
        }
        newLessonId = targetParentId;
      }

      const newPos = position !== undefined ? position : step.position;
      this.db.prepare('UPDATE steps SET lesson_id = ?, position = ?, updated_at = ? WHERE id = ?').run(newLessonId, newPos, now, id);
    } else {
      throw new ValidationError(`Unsupported content_type: ${contentType}`);
    }

    this.bumpCourseRevision(courseId);
    const updatedCourse = this.db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as any;
    return { success: true, newRevision: updatedCourse.draft_revision };
  }

  duplicateContent(
    userId: string,
    courseId: string,
    contentType: 'module' | 'lesson' | 'step',
    id: string,
    targetParentId?: string
  ): { success: boolean; createdId: string; createdSummary: any; newRevision: number } {
    this.verifyCourseOwner(userId, courseId);

    let createdId = '';
    let createdSummary: any = null;

    if (contentType === 'step') {
      const dup = this.duplicateStep(userId, courseId, id);
      createdId = dup.id;
      createdSummary = dup;
      if (targetParentId && targetParentId !== dup.lessonId) {
        this.moveContent(userId, courseId, 'step', dup.id, targetParentId);
      }
    } else if (contentType === 'lesson') {
      const dup = this.duplicateLesson(userId, courseId, id, targetParentId);
      createdId = dup.id;
      createdSummary = dup;
    } else if (contentType === 'module') {
      if (targetParentId && targetParentId !== courseId) {
        throw new ValidationError('Target parent for a module must be the course itself.');
      }
      const dup = this.duplicateModule(userId, courseId, id);
      createdId = dup.id;
      createdSummary = dup;
    } else {
      throw new ValidationError(`Unsupported content_type: ${contentType}`);
    }

    const updatedCourse = this.db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as any;
    return { success: true, createdId, createdSummary, newRevision: updatedCourse.draft_revision };
  }
}
