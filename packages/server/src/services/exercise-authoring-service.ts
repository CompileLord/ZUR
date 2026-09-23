import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  StaleRevisionError,
} from 'zur-shared';
import type {
  PythonExerciseContent,
  TestCase,
} from 'zur-shared';

export interface AuthorExerciseInput {
  title?: string;
  problemStatement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: string;
  referenceSolution: string;
  hints?: string[];
  solutionExplanation?: string;
  runtimeLimits?: {
    cpuTimeoutSeconds?: number;
    wallTimeoutSeconds?: number;
    memoryLimitMib?: number;
  };
  publicTests?: Array<{ id?: string; stdin: string; expectedStdout: string }>;
  hiddenTests?: Array<{ id?: string; stdin: string; expectedStdout: string }>;
}

export interface AuthorExercisePayload {
  stepId: string;
  title: string;
  problemStatement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: string;
  referenceSolution: string;
  hints: string[];
  solutionExplanation: string;
  runtimeLimits: {
    cpuTimeoutSeconds: number;
    wallTimeoutSeconds: number;
    memoryLimitMib: number;
  };
  publicTests: Array<{ id: string; stdin: string; expectedStdout: string; isHidden: boolean; position: number }>;
  hiddenTests: Array<{ id: string; stdin: string; expectedStdout: string; isHidden: boolean; position: number }>;
  revision: number;
}

export class ExerciseAuthoringService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private verifyStepOwner(userId: string, stepId: string): { courseId: string } {
    const row = this.db
      .prepare(
        `SELECT c.id as course_id, c.owner_id
         FROM steps s
         JOIN lessons l ON s.lesson_id = l.id
         JOIN modules m ON l.module_id = m.id
         JOIN courses c ON m.course_id = c.id
         WHERE s.id = ?`
      )
      .get(stepId) as any;

    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    if (row.owner_id !== userId) {
      const user = this.db.prepare('SELECT capabilities FROM users WHERE id = ?').get(userId) as any;
      const caps = user ? JSON.parse(user.capabilities || '[]') : [];
      if (!caps.includes('admin')) {
        throw new AuthorizationError('You do not have permission to edit this exercise');
      }
    }

    return { courseId: row.course_id };
  }

  getAuthorExercise(userId: string, stepId: string): AuthorExercisePayload {
    this.verifyStepOwner(userId, stepId);

    const step = this.db.prepare('SELECT title FROM steps WHERE id = ?').get(stepId) as any;
    if (!step) {
      throw new NotFoundError('Step not found');
    }

    const contentRow = this.db
      .prepare('SELECT content_payload, revision FROM step_contents WHERE step_id = ?')
      .get(stepId) as any;

    if (!contentRow) {
      throw new NotFoundError('Exercise content not found');
    }

    const payload = JSON.parse(contentRow.content_payload) as PythonExerciseContent;

    const testRows = this.db
      .prepare('SELECT * FROM test_cases WHERE step_id = ? ORDER BY is_hidden ASC, position ASC')
      .all(stepId) as any[];

    const publicTests: any[] = [];
    const hiddenTests: any[] = [];

    for (const t of testRows) {
      const item = {
        id: t.id,
        stdin: t.stdin || '',
        expectedStdout: t.expected_stdout || '',
        isHidden: Boolean(t.is_hidden),
        position: t.position,
      };
      if (t.is_hidden) {
        hiddenTests.push(item);
      } else {
        publicTests.push(item);
      }
    }

    return {
      stepId,
      title: step.title,
      problemStatement: payload.problemStatement || '',
      inputFormat: payload.inputFormat || '',
      outputFormat: payload.outputFormat || '',
      constraints: payload.constraints || '',
      starterCode: payload.starterCode || '',
      referenceSolution: payload.referenceSolution || '',
      hints: payload.hints || [],
      solutionExplanation: payload.solutionExplanation || '',
      runtimeLimits: {
        cpuTimeoutSeconds: payload.runtimeLimits?.cpuTimeoutSeconds || 5,
        wallTimeoutSeconds: payload.runtimeLimits?.wallTimeoutSeconds || 10,
        memoryLimitMib: payload.runtimeLimits?.memoryLimitMib || 128,
      },
      publicTests,
      hiddenTests,
      revision: contentRow.revision,
    };
  }

  getStudentExercise(stepId: string): {
    stepId: string;
    title: string;
    problemStatement: string;
    inputFormat: string;
    outputFormat: string;
    constraints: string;
    starterCode: string;
    hints: string[];
    runtimeLimits: { cpuTimeoutSeconds: number; wallTimeoutSeconds: number; memoryLimitMib: number };
    publicTests: Array<{ stdin: string; expectedStdout: string; position: number }>;
  } {
    const step = this.db.prepare('SELECT title FROM steps WHERE id = ?').get(stepId) as any;
    if (!step) {
      throw new NotFoundError("This page isn't available.");
    }

    const contentRow = this.db
      .prepare('SELECT content_payload FROM step_contents WHERE step_id = ?')
      .get(stepId) as any;

    if (!contentRow) {
      throw new NotFoundError("This page isn't available.");
    }

    const payload = JSON.parse(contentRow.content_payload) as PythonExerciseContent;

    const publicTestRows = this.db
      .prepare('SELECT stdin, expected_stdout, position FROM test_cases WHERE step_id = ? AND is_hidden = 0 ORDER BY position ASC')
      .all(stepId) as any[];

    return {
      stepId,
      title: step.title,
      problemStatement: payload.problemStatement || '',
      inputFormat: payload.inputFormat || '',
      outputFormat: payload.outputFormat || '',
      constraints: payload.constraints || '',
      starterCode: payload.starterCode || '',
      hints: payload.hints || [],
      runtimeLimits: {
        cpuTimeoutSeconds: payload.runtimeLimits?.cpuTimeoutSeconds || 5,
        wallTimeoutSeconds: payload.runtimeLimits?.wallTimeoutSeconds || 10,
        memoryLimitMib: payload.runtimeLimits?.memoryLimitMib || 128,
      },
      publicTests: publicTestRows.map((t) => ({
        stdin: t.stdin || '',
        expectedStdout: t.expected_stdout || '',
        position: t.position,
      })),
    };
  }

  updateExercise(
    userId: string,
    stepId: string,
    expectedRevision: number,
    input: AuthorExerciseInput
  ): AuthorExercisePayload {
    const { courseId } = this.verifyStepOwner(userId, stepId);

    const contentRow = this.db
      .prepare('SELECT revision FROM step_contents WHERE step_id = ?')
      .get(stepId) as any;

    if (!contentRow) {
      throw new NotFoundError('Exercise content not found');
    }

    if (contentRow.revision !== expectedRevision) {
      throw new StaleRevisionError(
        'Exercise was modified elsewhere.',
        contentRow.revision,
        { stepId }
      );
    }

    if (!input.problemStatement || !input.problemStatement.trim()) {
      throw new ValidationError('Problem statement cannot be empty');
    }

    const hints = (input.hints || []).map((h) => h.trim()).filter((h) => h.length > 0);
    if (hints.length > 3) {
      throw new ValidationError('A maximum of 3 hints is allowed (PRD §12.1)');
    }

    const cpuTimeout = Math.min(10, Math.max(1, input.runtimeLimits?.cpuTimeoutSeconds || 5));
    const wallTimeout = Math.min(20, Math.max(1, input.runtimeLimits?.wallTimeoutSeconds || 10));
    const memoryLimit = Math.min(512, Math.max(16, input.runtimeLimits?.memoryLimitMib || 128));

    const newRevision = contentRow.revision + 1;
    const now = new Date().toISOString();

    if (input.title) {
      this.db
        .prepare('UPDATE steps SET title = ?, updated_at = ? WHERE id = ?')
        .run(input.title.trim(), now, stepId);
    }

    const contentPayload: PythonExerciseContent = {
      kind: 'python',
      problemStatement: input.problemStatement.trim(),
      inputFormat: (input.inputFormat || '').trim(),
      outputFormat: (input.outputFormat || '').trim(),
      constraints: (input.constraints || '').trim(),
      starterCode: input.starterCode || '',
      referenceSolution: input.referenceSolution || '',
      hints,
      solutionExplanation: (input.solutionExplanation || '').trim(),
      runtimeLimits: {
        cpuTimeoutSeconds: cpuTimeout,
        wallTimeoutSeconds: wallTimeout,
        memoryLimitMib: memoryLimit,
      },
    };

    this.db
      .prepare('UPDATE step_contents SET content_payload = ?, revision = ?, updated_at = ? WHERE step_id = ?')
      .run(JSON.stringify(contentPayload), newRevision, now, stepId);

    // Sync test cases if supplied
    if (input.publicTests !== undefined || input.hiddenTests !== undefined) {
      this.db.prepare('DELETE FROM test_cases WHERE step_id = ?').run(stepId);

      const pub = input.publicTests || [];
      for (let i = 0; i < pub.length; i++) {
        this.db
          .prepare(
            `INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
             VALUES (?, ?, ?, ?, 0, ?, ?)`
          )
          .run(pub[i].id || crypto.randomUUID(), stepId, pub[i].stdin ?? '', pub[i].expectedStdout ?? '', i, now);
      }

      const hid = input.hiddenTests || [];
      for (let i = 0; i < hid.length; i++) {
        this.db
          .prepare(
            `INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)`
          )
          .run(hid[i].id || crypto.randomUUID(), stepId, hid[i].stdin ?? '', hid[i].expectedStdout ?? '', i, now);
      }
    }

    // Touch course revision
    this.db
      .prepare(
        "UPDATE courses SET draft_revision = draft_revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .run(courseId);

    return this.getAuthorExercise(userId, stepId);
  }
}
