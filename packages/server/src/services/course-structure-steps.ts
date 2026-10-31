import crypto from 'node:crypto';
import { ValidationError } from 'zur-shared';
import type { StepTreeSummary } from './course-structure-types.ts';
import type { StepType } from 'zur-shared';
import { CourseOutlineOperations } from './course-structure-outline.ts';

export class CourseStepOperations extends CourseOutlineOperations {
  // --- Step Operations ---

  addStep(
    userId: string,
    courseId: string,
    lessonId: string,
    stepData: {
      title: string;
      type: StepType;
      position?: number;
      isRequired?: boolean;
      estimatedDurationMinutes?: number;
    }
  ): StepTreeSummary {
    this.verifyCourseOwner(userId, courseId);
    this.getLessonInCourse(lessonId, courseId);

    const validTypes: StepType[] = ['theory', 'video', 'quiz', 'python'];
    if (!validTypes.includes(stepData.type)) {
      throw new ValidationError(`Invalid step type: ${stepData.type}`);
    }

    const cleanTitle = (stepData.title || '').trim();
    if (!cleanTitle) {
      throw new ValidationError('Step title cannot be empty');
    }

    // Limit check: 1 to 20 steps per lesson (PRD §8.3, §17, tasks.json T031)
    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM steps WHERE lesson_id = ?')
      .get(lessonId) as any;
    const currentSteps = countRow ? countRow.cnt : 0;
    if (currentSteps >= 20) {
      throw new ValidationError('A lesson cannot contain more than 20 steps.');
    }

    let pos = stepData.position;
    if (pos === undefined) {
      const maxPos = (
        this.db.prepare('SELECT MAX(position) as mp FROM steps WHERE lesson_id = ?').get(lessonId) as any
      )?.mp;
      pos = (maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0) as number;
    }

    const stepId = crypto.randomUUID();
    const now = new Date().toISOString();
    const isRequired = stepData.isRequired !== undefined ? (stepData.isRequired ? 1 : 0) : 1;
    const duration = stepData.estimatedDurationMinutes || 5;

    this.db
      .prepare(
        `INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(stepId, lessonId, stepData.type, cleanTitle, pos, isRequired, duration, now, now);

    // Initialize content payload based on step type
    let defaultPayload = '';
    if (stepData.type === 'theory') {
      defaultPayload = JSON.stringify({
        kind: 'theory',
        markdown: `# ${cleanTitle}\n\nEnter your theory lesson here.`,
      });
    } else if (stepData.type === 'video') {
      defaultPayload = JSON.stringify({
        kind: 'video',
        videoUrl: '',
        provider: 'youtube',
        transcript: '',
        captionVerified: false,
      });
    } else if (stepData.type === 'quiz') {
      defaultPayload = JSON.stringify({
        kind: 'quiz',
        quizType: 'single_choice',
        prompt: cleanTitle,
        options: [
          { id: crypto.randomUUID(), text: 'Option 1', isCorrect: true },
          { id: crypto.randomUUID(), text: 'Option 2', isCorrect: false },
        ],
        explanation: '',
      });
    } else if (stepData.type === 'python') {
      defaultPayload = JSON.stringify({
        kind: 'python',
        problemStatement: cleanTitle,
        inputFormat: 'Standard input format',
        outputFormat: 'Standard output format',
        constraints: 'Time limit: 5 seconds, Memory limit: 128 MiB',
        starterCode: '# Write your solution here\n',
        referenceSolution: '# Reference solution\n',
        hints: [],
        solutionExplanation: '',
        runtimeLimits: {
          cpuTimeoutSeconds: 5,
          wallTimeoutSeconds: 10,
          memoryLimitMib: 128,
        },
      });
    }

    this.db
      .prepare(
        `INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at)
         VALUES (?, ?, ?, 1, ?)`
      )
      .run(crypto.randomUUID(), stepId, defaultPayload, now);

    this.bumpCourseRevision(courseId);

    return {
      id: stepId,
      lessonId,
      type: stepData.type,
      title: cleanTitle,
      position: pos,
      isRequired: Boolean(isRequired),
      estimatedDurationMinutes: duration,
    };
  }

  updateStep(
    userId: string,
    courseId: string,
    stepId: string,
    stepData: {
      title?: string;
      isRequired?: boolean;
      estimatedDurationMinutes?: number;
    }
  ): StepTreeSummary {
    this.verifyCourseOwner(userId, courseId);

    const step = this.getStepInCourse(stepId, courseId);

    const title = stepData.title !== undefined ? stepData.title.trim() : step.title;
    if (!title) {
      throw new ValidationError('Step title cannot be empty');
    }

    const isRequired =
      stepData.isRequired !== undefined ? (stepData.isRequired ? 1 : 0) : step.is_required;
    const duration =
      stepData.estimatedDurationMinutes !== undefined
        ? Math.max(1, Number(stepData.estimatedDurationMinutes) || step.estimated_duration_minutes)
        : step.estimated_duration_minutes;

    const now = new Date().toISOString();

    this.db
      .prepare(
        'UPDATE steps SET title = ?, is_required = ?, estimated_duration_minutes = ?, updated_at = ? WHERE id = ?'
      )
      .run(title, isRequired, duration, now, stepId);

    this.bumpCourseRevision(courseId);

    return {
      id: stepId,
      lessonId: step.lesson_id,
      type: step.type as StepType,
      title,
      position: step.position,
      isRequired: Boolean(isRequired),
      estimatedDurationMinutes: duration,
    };
  }

  reorderSteps(userId: string, courseId: string, lessonId: string, stepIds: string[]): { success: boolean; newRevision: number } {
    if (!Array.isArray(stepIds)) {
      throw new ValidationError('stepIds must be an array of step IDs');
    }
    for (const id of stepIds) {
      if (typeof id !== 'string' || !id.trim()) {
        throw new ValidationError('Invalid step ID in reorder list');
      }
    }
    if (new Set(stepIds).size !== stepIds.length) {
      throw new ValidationError('Reorder list contains duplicate step IDs');
    }

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.verifyCourseOwner(userId, courseId);
      this.getLessonInCourse(lessonId, courseId);

      const existing = this.db
        .prepare('SELECT id FROM steps WHERE lesson_id = ?')
        .all(lessonId) as Array<{ id: string }>;
      if (stepIds.length !== existing.length) {
        throw new ValidationError(
          `Reorder list length (${stepIds.length}) does not match step count in lesson (${existing.length})`
        );
      }
      const existingSet = new Set(existing.map((s) => s.id));
      for (const id of stepIds) {
        if (!existingSet.has(id)) {
          throw new ValidationError(`Step ${id} does not belong to lesson ${lessonId}`);
        }
      }

      const now = new Date().toISOString();
      for (let i = 0; i < stepIds.length; i++) {
        this.db
          .prepare('UPDATE steps SET position = ?, updated_at = ? WHERE id = ? AND lesson_id = ?')
          .run(i, now, stepIds[i], lessonId);
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

  duplicateStep(userId: string, courseId: string, stepId: string): StepTreeSummary {
    this.verifyCourseOwner(userId, courseId);

    const step = this.getStepInCourse(stepId, courseId);

    // Limit check: 1 to 20 steps per lesson
    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM steps WHERE lesson_id = ?')
      .get(step.lesson_id) as any;
    if (countRow && countRow.cnt >= 20) {
      throw new ValidationError('A lesson cannot contain more than 20 steps.');
    }

    const newStepId = crypto.randomUUID();
    const newTitle = `${step.title} (Copy)`;
    const newPosition = step.position + 1;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newStepId,
        step.lesson_id,
        step.type,
        newTitle,
        newPosition,
        step.is_required,
        step.estimated_duration_minutes,
        now,
        now
      );

    // Duplicate content payload
    const content = this.db.prepare('SELECT content_payload FROM step_contents WHERE step_id = ?').get(stepId) as any;
    if (content) {
      this.db
        .prepare(
          `INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at)
           VALUES (?, ?, ?, 1, ?)`
        )
        .run(crypto.randomUUID(), newStepId, content.content_payload, now);
    }

    // Duplicate test cases if python step
    if (step.type === 'python') {
      const tests = this.db.prepare('SELECT * FROM test_cases WHERE step_id = ?').all(stepId) as any[];
      for (const t of tests) {
        this.db
          .prepare(
            `INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(crypto.randomUUID(), newStepId, t.stdin, t.expected_stdout, t.is_hidden, t.position, now);
      }
    }

    this.bumpCourseRevision(courseId);

    return {
      id: newStepId,
      lessonId: step.lesson_id,
      type: step.type as StepType,
      title: newTitle,
      position: newPosition,
      isRequired: Boolean(step.is_required),
      estimatedDurationMinutes: step.estimated_duration_minutes,
    };
  }

  deleteStep(userId: string, courseId: string, stepId: string): { success: boolean; deletedStepId: string } {
    this.verifyCourseOwner(userId, courseId);
    this.getStepInCourse(stepId, courseId);

    this.db.prepare('DELETE FROM steps WHERE id = ?').run(stepId);
    this.bumpCourseRevision(courseId);

    return { success: true, deletedStepId: stepId };
  }
}
