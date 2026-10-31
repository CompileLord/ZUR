import crypto from 'node:crypto';
import { ValidationError, NotFoundError } from 'zur-shared';
import type { StepTreeSummary, LessonTreeSummary, ModuleTreeSummary, CourseTree } from './course-structure-types.ts';
import type { StepType } from 'zur-shared';
import { CourseStructureBase } from './course-structure-base.ts';

export class CourseOutlineOperations extends CourseStructureBase {
  getCourseTree(userId: string, courseId: string): CourseTree {
    this.verifyCourseOwner(userId, courseId);

    const course = this.db.prepare('SELECT id, title FROM courses WHERE id = ?').get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    const modules = this.db
      .prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC, created_at ASC')
      .all(courseId) as any[];

    let totalSteps = 0;

    const moduleSummaries: ModuleTreeSummary[] = modules.map((m) => {
      const lessons = this.db
        .prepare('SELECT * FROM lessons WHERE module_id = ? ORDER BY position ASC, created_at ASC')
        .all(m.id) as any[];

      const lessonSummaries: LessonTreeSummary[] = lessons.map((l) => {
        const steps = this.db
          .prepare('SELECT * FROM steps WHERE lesson_id = ? ORDER BY position ASC, created_at ASC')
          .all(l.id) as any[];

        totalSteps += steps.length;

        const stepSummaries: StepTreeSummary[] = steps.map((s) => ({
          id: s.id,
          lessonId: s.lesson_id,
          type: s.type as StepType,
          title: s.title,
          position: s.position,
          isRequired: Boolean(s.is_required),
          estimatedDurationMinutes: s.estimated_duration_minutes || 5,
        }));

        return {
          id: l.id,
          moduleId: l.module_id,
          title: l.title,
          description: l.description || undefined,
          position: l.position,
          steps: stepSummaries,
        };
      });

      return {
        id: m.id,
        courseId: m.course_id,
        title: m.title,
        position: m.position,
        lessons: lessonSummaries,
      };
    });

    return {
      courseId: course.id,
      courseTitle: course.title,
      modules: moduleSummaries,
      totalSteps,
    };
  }

  // --- Module Operations ---

  addModule(userId: string, courseId: string, title: string, position?: number): { id: string; title: string; position: number } {
    this.verifyCourseOwner(userId, courseId);
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) {
      throw new ValidationError('Module title cannot be empty');
    }

    let pos = position;
    if (pos === undefined) {
      const maxPos = (
        this.db.prepare('SELECT MAX(position) as mp FROM modules WHERE course_id = ?').get(courseId) as any
      )?.mp;
      pos = (maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0) as number;
    }

    const moduleId = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare('INSERT INTO modules (id, course_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(moduleId, courseId, cleanTitle, pos, now, now);

    this.bumpCourseRevision(courseId);

    return { id: moduleId, title: cleanTitle, position: pos };
  }

  updateModule(userId: string, courseId: string, moduleId: string, title: string): { id: string; title: string } {
    this.verifyCourseOwner(userId, courseId);
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) {
      throw new ValidationError('Module title cannot be empty');
    }

    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE modules SET title = ?, updated_at = ? WHERE id = ? AND course_id = ?')
      .run(cleanTitle, now, moduleId, courseId);

    this.bumpCourseRevision(courseId);

    return { id: moduleId, title: cleanTitle };
  }

  reorderModules(userId: string, courseId: string, moduleIds: string[]): { success: boolean; newRevision: number } {
    if (!Array.isArray(moduleIds)) {
      throw new ValidationError('moduleIds must be an array of module IDs');
    }
    for (const id of moduleIds) {
      if (typeof id !== 'string' || !id.trim()) {
        throw new ValidationError('Invalid module ID in reorder list');
      }
    }
    if (new Set(moduleIds).size !== moduleIds.length) {
      throw new ValidationError('Reorder list contains duplicate module IDs');
    }

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.verifyCourseOwner(userId, courseId);

      const existing = this.db
        .prepare('SELECT id FROM modules WHERE course_id = ?')
        .all(courseId) as Array<{ id: string }>;
      if (moduleIds.length !== existing.length) {
        throw new ValidationError(
          `Reorder list length (${moduleIds.length}) does not match module count in course (${existing.length})`
        );
      }
      const existingSet = new Set(existing.map((m) => m.id));
      for (const id of moduleIds) {
        if (!existingSet.has(id)) {
          throw new ValidationError(`Module ${id} does not belong to course ${courseId}`);
        }
      }

      const now = new Date().toISOString();
      for (let i = 0; i < moduleIds.length; i++) {
        this.db
          .prepare('UPDATE modules SET position = ?, updated_at = ? WHERE id = ? AND course_id = ?')
          .run(i, now, moduleIds[i], courseId);
      }

      this.bumpCourseRevision(courseId);
      const updated = this.db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as any;
      this.db.exec('COMMIT');
      return { success: true, newRevision: updated ? updated.draft_revision : 1 };
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }

  deleteModule(userId: string, courseId: string, moduleId: string): { success: boolean; deletedModuleId: string } {
    this.verifyCourseOwner(userId, courseId);

    this.db.prepare('DELETE FROM modules WHERE id = ? AND course_id = ?').run(moduleId, courseId);
    this.bumpCourseRevision(courseId);

    return { success: true, deletedModuleId: moduleId };
  }

  // --- Lesson Operations ---

  addLesson(
    userId: string,
    courseId: string,
    moduleId: string,
    title: string,
    description?: string,
    position?: number
  ): { id: string; moduleId: string; title: string; position: number } {
    this.verifyCourseOwner(userId, courseId);
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) {
      throw new ValidationError('Lesson title cannot be empty');
    }

    const mod = this.db.prepare('SELECT id FROM modules WHERE id = ? AND course_id = ?').get(moduleId, courseId);
    if (!mod) {
      throw new NotFoundError('Module not found in this course');
    }

    let pos = position;
    if (pos === undefined) {
      const maxPos = (
        this.db.prepare('SELECT MAX(position) as mp FROM lessons WHERE module_id = ?').get(moduleId) as any
      )?.mp;
      pos = (maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0) as number;
    }

    const lessonId = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        'INSERT INTO lessons (id, module_id, title, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(lessonId, moduleId, cleanTitle, description || '', pos, now, now);

    this.bumpCourseRevision(courseId);

    return { id: lessonId, moduleId, title: cleanTitle, position: pos };
  }

  updateLesson(
    userId: string,
    courseId: string,
    lessonId: string,
    title: string,
    description?: string
  ): { id: string; title: string; description?: string } {
    this.verifyCourseOwner(userId, courseId);
    this.getLessonInCourse(lessonId, courseId);
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) {
      throw new ValidationError('Lesson title cannot be empty');
    }

    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE lessons SET title = ?, description = ?, updated_at = ? WHERE id = ?')
      .run(cleanTitle, description !== undefined ? description : '', now, lessonId);

    this.bumpCourseRevision(courseId);

    return { id: lessonId, title: cleanTitle, description };
  }

  reorderLessons(userId: string, courseId: string, moduleId: string, lessonIds: string[]): { success: boolean; newRevision: number } {
    if (!Array.isArray(lessonIds)) {
      throw new ValidationError('lessonIds must be an array of lesson IDs');
    }
    for (const id of lessonIds) {
      if (typeof id !== 'string' || !id.trim()) {
        throw new ValidationError('Invalid lesson ID in reorder list');
      }
    }
    if (new Set(lessonIds).size !== lessonIds.length) {
      throw new ValidationError('Reorder list contains duplicate lesson IDs');
    }

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.verifyCourseOwner(userId, courseId);
      this.getModuleInCourse(moduleId, courseId);

      const existing = this.db
        .prepare('SELECT id FROM lessons WHERE module_id = ?')
        .all(moduleId) as Array<{ id: string }>;
      if (lessonIds.length !== existing.length) {
        throw new ValidationError(
          `Reorder list length (${lessonIds.length}) does not match lesson count in module (${existing.length})`
        );
      }
      const existingSet = new Set(existing.map((l) => l.id));
      for (const id of lessonIds) {
        if (!existingSet.has(id)) {
          throw new ValidationError(`Lesson ${id} does not belong to module ${moduleId}`);
        }
      }

      const now = new Date().toISOString();
      for (let i = 0; i < lessonIds.length; i++) {
        this.db
          .prepare('UPDATE lessons SET position = ?, updated_at = ? WHERE id = ? AND module_id = ?')
          .run(i, now, lessonIds[i], moduleId);
      }

      this.bumpCourseRevision(courseId);
      const updated = this.db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as any;
      this.db.exec('COMMIT');
      return { success: true, newRevision: updated ? updated.draft_revision : 1 };
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }

  deleteLesson(userId: string, courseId: string, lessonId: string): { success: boolean; deletedLessonId: string } {
    this.verifyCourseOwner(userId, courseId);
    this.getLessonInCourse(lessonId, courseId);

    this.db.prepare('DELETE FROM lessons WHERE id = ?').run(lessonId);
    this.bumpCourseRevision(courseId);

    return { success: true, deletedLessonId: lessonId };
  }
}
