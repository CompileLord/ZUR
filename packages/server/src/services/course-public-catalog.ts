import { NotFoundError } from 'zur-shared';
import type { CourseVisibility, EnrollmentPolicy, PublicationStatus } from 'zur-shared';
import { CourseServiceBase } from './course-service-base.ts';


/**
 * Published course versions are immutable (a change is a NEW version id), so lesson/step counts derived
 * from a version snapshot can be cached by version id with no invalidation. Bounded LRU.
 */
export const VERSION_COUNTS_CACHE_MAX = 500;
const versionCountsCache = new Map<string, { lessonCount: number; stepCount: number }>();
export function clearVersionCountsCache(): void { versionCountsCache.clear(); }
export function versionCountsCacheSize(): number { return versionCountsCache.size; }

export function computeSnapshotCounts(snapshotData: string | null | undefined): { lessonCount: number; stepCount: number } {
  let lessonCount = 0;
  let stepCount = 0;
  try {
    const snap = snapshotData ? JSON.parse(snapshotData) : null;
    for (const mod of snap?.modules || []) {
      for (const les of mod.lessons || []) {
        lessonCount += 1;
        stepCount += (les.steps || []).length;
      }
    }
  } catch {
    return { lessonCount: 0, stepCount: 0 };
  }
  return { lessonCount, stepCount };
}

/** Public catalog, category list and public course overview (no caller authorization beyond visibility rules). */
export abstract class CoursePublicCatalog extends CourseServiceBase {
  /** Lesson/step counts of a published version; cached by (immutable) version id, LRU-bounded. */
  private getVersionCounts(versionId: string | null | undefined): { lessonCount: number; stepCount: number } {
    if (!versionId) return { lessonCount: 0, stepCount: 0 };
    const hit = versionCountsCache.get(versionId);
    if (hit) {
      versionCountsCache.delete(versionId);
      versionCountsCache.set(versionId, hit); // refresh recency
      return hit;
    }
    const row = this.db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(versionId) as { snapshot_data: string | null } | undefined;
    const counts = computeSnapshotCounts(row?.snapshot_data);
    if (row) {
      versionCountsCache.set(versionId, counts);
      while (versionCountsCache.size > VERSION_COUNTS_CACHE_MAX) {
        const oldest = versionCountsCache.keys().next().value;
        if (oldest === undefined) break;
        versionCountsCache.delete(oldest);
      }
    }
    return counts;
  }

  listPublicCatalog(options: {
    search?: string;
    categoryId?: string;
    level?: string;
    language?: string;
    limit?: number;
    offset?: number;
  } = {}): {
    courses: any[];
    total: number;
    limit: number;
    offset: number;
    languages: string[];
  } {
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    const offset = Math.max(0, options.offset || 0);

    let whereClause = "WHERE c.publication_status = 'published' AND c.is_suspended = 0 AND c.visibility = 'public'";
    const params: any[] = [];

    if (options.categoryId) {
      whereClause += ' AND c.category_id = ?';
      params.push(options.categoryId);
    }

    if (options.level) {
      whereClause += ' AND c.difficulty = ?';
      params.push(options.level);
    }

    if (options.language) {
      whereClause += ' AND c.language = ?';
      params.push(options.language);
    }

    let orderClause = 'ORDER BY c.updated_at DESC';

    if (options.search) {
      const term = `%${options.search.trim().toLowerCase()}%`;
      whereClause += ' AND (LOWER(c.title) LIKE ? OR LOWER(c.description) LIKE ? OR LOWER(c.tags) LIKE ? OR LOWER(u.display_name) LIKE ?)';
      params.push(term, term, term, term);
      orderClause = 'ORDER BY CASE WHEN LOWER(c.title) LIKE ? THEN 0 ELSE 1 END, c.updated_at DESC';
    }

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM courses c LEFT JOIN users u ON c.owner_id = u.id ${whereClause}`)
      .get(...params) as any;
    const total = countRow ? countRow.cnt : 0;

    const selectParams = [...params];
    if (options.search) {
      selectParams.push(`%${options.search.trim().toLowerCase()}%`);
    }
    selectParams.push(limit, offset);

    const rows = this.db
      .prepare(
        `SELECT
          c.id, c.title, c.description, c.category_id, c.tags, c.difficulty,
          c.language, c.learning_outcomes, c.estimated_duration_minutes,
          c.current_version_id, c.created_at, c.updated_at,
          cat.name as category_name,
          u.display_name as author_name,
          cv.version_number as version_number
        FROM courses c
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN users u ON c.owner_id = u.id
        LEFT JOIN course_versions cv ON c.current_version_id = cv.id
        ${whereClause}
        ${orderClause}
        LIMIT ? OFFSET ?`
      )
      .all(...selectParams) as any[];

    const courses = rows.map((r) => {
      // Counts come from the published version snapshot only, never from drafts.
      const { lessonCount, stepCount } = this.getVersionCounts(r.current_version_id);
      return {
      lessonCount,
      stepCount,
      id: r.id,
      title: r.title,
      description: r.description || '',
      categoryId: r.category_id,
      categoryName: r.category_name,
      tags: JSON.parse(r.tags || '[]'),
      difficulty: r.difficulty,
      language: r.language,
      learningOutcomes: JSON.parse(r.learning_outcomes || '[]'),
      estimatedDurationMinutes: r.estimated_duration_minutes,
      currentVersionId: r.current_version_id,
      versionNumber: r.version_number || 1,
      authorName: r.author_name || 'Anonymous',
      updatedAt: r.updated_at,
      };
    });

    const langRows = this.db
      .prepare(
        `SELECT DISTINCT c.language
         FROM courses c
         WHERE c.publication_status = 'published' AND c.is_suspended = 0 AND c.visibility = 'public' AND c.language IS NOT NULL AND TRIM(c.language) != ''
         ORDER BY c.language ASC`
      )
      .all() as Array<{ language: string }>;
    const languages = langRows.map((r) => r.language).filter(Boolean);

    return { courses, total, limit, offset, languages };
  }

  listCategories(): Array<{ id: string; name: string; slug: string }> {
    const rows = this.db.prepare('SELECT id, name, slug FROM categories ORDER BY name ASC').all() as any[];
    return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug }));
  }

  getPublicCourseOverview(courseId: string, currentUserId?: string): {
    course: {
      id: string;
      title: string;
      description: string;
      categoryId: string;
      categoryName?: string;
      tags: string[];
      difficulty: string;
      language: string;
      learningOutcomes: string[];
      prerequisites: string;
      estimatedDurationMinutes: number;
      visibility: CourseVisibility;
      enrollmentPolicy: EnrollmentPolicy;
      publicationStatus: PublicationStatus;
      isSuspended: boolean;
      authorName: string;
      currentVersionId?: string;
      versionNumber: number;
      updatedAt: string;
    };
    syllabus: Array<{
      id: string;
      title: string;
      position: number;
      lessons: Array<{
        id: string;
        title: string;
        description: string;
        position: number;
        stepCounts: {
          theory: number;
          video: number;
          quiz: number;
          python: number;
          total: number;
        };
        steps: Array<{
          id: string;
          title: string;
          type: string;
          position: number;
          isRequired: boolean;
          estimatedDurationMinutes: number;
        }>;
      }>;
    }>;
    enrollmentStatus: {
      isEnrolled: boolean;
      enrollmentId?: string;
      status: string | null;
    };
    isEmailVerified: boolean;
  } {
    const row = this.db
      .prepare(
        `SELECT
          c.*,
          cat.name as category_name,
          u.display_name as author_name,
          cv.version_number as version_number
        FROM courses c
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN users u ON c.owner_id = u.id
        LEFT JOIN course_versions cv ON c.current_version_id = cv.id
        WHERE c.id = ?`
      )
      .get(courseId) as any;

    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    // Enforce public/private/unlisted/archived/suspended separation server-side (AC-05)
    if (row.visibility === 'private') {
      let isAuthorized = false;
      if (currentUserId) {
        if (row.owner_id === currentUserId) {
          isAuthorized = true;
        } else {
          const enr = this.db
            .prepare('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ? AND status = ?')
            .get(currentUserId, courseId, 'active') as any;
          if (enr) isAuthorized = true;
        }
      }
      if (!isAuthorized) {
        throw new NotFoundError("This page isn't available.");
      }
    }

    // Draft courses only visible to author
    if (row.publication_status === 'draft') {
      if (!currentUserId || row.owner_id !== currentUserId) {
        throw new NotFoundError("This page isn't available.");
      }
    }

    let enrollmentStatus: { isEnrolled: boolean; enrollmentId?: string; status: string | null } = {
      isEnrolled: false,
      status: null,
    };
    let isEmailVerified = false;

    if (currentUserId) {
      const userRow = this.db
        .prepare('SELECT email_verified FROM users WHERE id = ?')
        .get(currentUserId) as any;
      if (userRow) {
        isEmailVerified = userRow.email_verified === 1;
      }

      const enrRow = this.db
        .prepare('SELECT id, status FROM enrollments WHERE user_id = ? AND course_id = ?')
        .get(currentUserId, courseId) as any;
      if (enrRow) {
        enrollmentStatus = {
          isEnrolled: enrRow.status === 'active',
          enrollmentId: enrRow.id,
          status: enrRow.status,
        };
      }
    }

    const syllabus: any[] = [];
    if (row.current_version_id) {
      const vRow = this.db
        .prepare('SELECT snapshot_data FROM course_versions WHERE id = ?')
        .get(row.current_version_id) as any;
      if (vRow && vRow.snapshot_data) {
        try {
          const snapshot = JSON.parse(vRow.snapshot_data);
          for (const mod of snapshot.modules || []) {
            const lessons = (mod.lessons || []).map((les: any) => {
              const stepCounts = {
                theory: 0,
                video: 0,
                quiz: 0,
                python: 0,
                total: (les.steps || []).length,
              };
              const steps = (les.steps || []).map((st: any) => {
                if (st.type === 'theory') stepCounts.theory++;
                else if (st.type === 'video') stepCounts.video++;
                else if (st.type === 'quiz') stepCounts.quiz++;
                else if (st.type === 'python') stepCounts.python++;
                return {
                  id: st.id,
                  title: st.title,
                  type: st.type,
                  position: st.position,
                  isRequired: Boolean(st.isRequired),
                  estimatedDurationMinutes: st.estimatedDurationMinutes || 0,
                };
              });
              return {
                id: les.id,
                title: les.title,
                description: les.description || '',
                position: les.position,
                stepCounts,
                steps,
              };
            });
            syllabus.push({
              id: mod.id,
              title: mod.title,
              position: mod.position,
              lessons,
            });
          }
        } catch {
          // ignore parsing error
        }
      }
    }

    if (syllabus.length === 0 || syllabus.every((m) => !m.lessons || m.lessons.length === 0)) {
      syllabus.length = 0;
      const modules = this.db
        .prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC')
        .all(courseId) as any[];
      for (const mod of modules) {
        const lessons = this.db
          .prepare('SELECT * FROM lessons WHERE module_id = ? ORDER BY position ASC')
          .all(mod.id) as any[];
        const lessonItems = lessons.map((les) => {
          const steps = this.db
            .prepare(
              'SELECT id, type, title, position, is_required, estimated_duration_minutes FROM steps WHERE lesson_id = ? ORDER BY position ASC'
            )
            .all(les.id) as any[];
          const stepCounts = {
            theory: 0,
            video: 0,
            quiz: 0,
            python: 0,
            total: steps.length,
          };
          const stepList = steps.map((s) => {
            if (s.type === 'theory') stepCounts.theory++;
            else if (s.type === 'video') stepCounts.video++;
            else if (s.type === 'quiz') stepCounts.quiz++;
            else if (s.type === 'python') stepCounts.python++;
            return {
              id: s.id,
              title: s.title,
              type: s.type,
              position: s.position,
              isRequired: Boolean(s.is_required),
              estimatedDurationMinutes: s.estimated_duration_minutes || 0,
            };
          });
          return {
            id: les.id,
            title: les.title,
            description: les.description || '',
            position: les.position,
            stepCounts,
            steps: stepList,
          };
        });
        syllabus.push({
          id: mod.id,
          title: mod.title,
          position: mod.position,
          lessons: lessonItems,
        });
      }
    }

    const course = {
      id: row.id,
      title: row.title,
      description: row.description || '',
      categoryId: row.category_id,
      categoryName: row.category_name,
      tags: JSON.parse(row.tags || '[]'),
      difficulty: row.difficulty,
      language: row.language,
      learningOutcomes: JSON.parse(row.learning_outcomes || '[]'),
      prerequisites: row.prerequisites || '',
      estimatedDurationMinutes: row.estimated_duration_minutes || 0,
      visibility: row.visibility,
      enrollmentPolicy: row.enrollment_policy,
      publicationStatus: row.publication_status,
      isSuspended: Boolean(row.is_suspended),
      authorName: row.author_name || 'Anonymous',
      currentVersionId: row.current_version_id,
      versionNumber: row.version_number || 1,
      updatedAt: row.updated_at,
    };

    return {
      course,
      syllabus,
      enrollmentStatus,
      isEmailVerified,
    };
  }
}
