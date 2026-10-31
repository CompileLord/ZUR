import { DatabaseSync } from 'node:sqlite';
import { NotFoundError } from 'zur-shared';
import type { CourseVersionSnapshot } from 'zur-shared';
import type { CourseSummary } from './course-types.ts';

/**
 * Lowest layer of CourseService: owns the database handle and the version snapshot lookup.
 * CourseService is assembled as a chain of classes (base -> public catalog -> reports -> enrollment -> service)
 * so each source file stays small while the public API and `this` semantics stay unchanged.
 */
export abstract class CourseServiceBase {
  protected db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  abstract getCourse(userId: string, courseId: string): CourseSummary;

  getCourseVersionSnapshot(versionId: string): CourseVersionSnapshot {
    const row = this.db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(versionId) as any;
    if (!row || !row.snapshot_data) {
      throw new NotFoundError("This page isn't available.");
    }
    return JSON.parse(row.snapshot_data) as CourseVersionSnapshot;
  }
}
