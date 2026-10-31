import { DatabaseSync } from 'node:sqlite';
import { defaultStepContent } from '../../services/step-defaults.ts';
import crypto from 'node:crypto';
import { ValidationError, NotFoundError, ConflictError, StaleRevisionError } from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { CourseStructureService } from '../../services/course-structure-service.ts';
import type { DraftRecoveryService } from '../../services/draft-recovery-service.ts';
import type { McpToolResult, BatchOperation, BatchReceipt } from '../types.ts';
import { assertModuleInCourse, assertLessonInCourse, assertStepInCourse } from './batch-validation.ts';

export async function executeBatchOperationsCore(params: {
  courseId: string;
  expectedRevision: number;
  idempotencyKey: string;
  operations: BatchOperation[];
  requestDigest: string;
  toolName: string;
  token: ValidatedMcpToken;
  db: DatabaseSync;
  authService: McpAuthService;
  structureService: CourseStructureService;
  recoveryService: DraftRecoveryService;
}): Promise<McpToolResult> {
  const {
    courseId,
    expectedRevision,
    idempotencyKey,
    operations,
    requestDigest,
    toolName,
    token,
    db,
    authService,
    structureService,
    recoveryService,
  } = params;

  // 1. Idempotency check with request digest comparison (PRD §23.6, Finding 8)
  const existingMutation = db
    .prepare('SELECT * FROM agent_mutations WHERE token_id = ? AND idempotency_key = ?')
    .get(token.id, idempotencyKey) as any;

  if (existingMutation) {
    if (existingMutation.request_digest && existingMutation.request_digest !== requestDigest) {
      throw new ConflictError(
        'Idempotency key has already been used with different request parameters.'
      );
    }

    let receipt: any;
    try {
      receipt = JSON.parse(existingMutation.affected_entities);
      if (receipt && (receipt.status === 'applied' || receipt.course_id)) {
        return {
          content: [{ type: 'text', text: JSON.stringify(receipt, null, 2) }],
        };
      }
    } catch {
      // fallback
    }

    const cachedReceipt: BatchReceipt = {
      course_id: existingMutation.course_id,
      idempotency_key: existingMutation.idempotency_key,
      prior_revision: existingMutation.base_revision,
      new_revision: existingMutation.new_revision,
      operations_applied: operations.length,
      created_ids: {},
      affected_entities: [],
      status: 'applied',
      created_at: existingMutation.created_at,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(cachedReceipt, null, 2) }],
    };
  }

  // 2. Fetch course & check expected revision
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as any;
  if (!course || course.owner_id !== token.authorId) {
    throw new NotFoundError("This page isn't available.");
  }

  if (course.draft_revision !== expectedRevision) {
    throw new StaleRevisionError(
      'The course draft has been modified since the batch was prepared.',
      course.draft_revision,
      { courseId, currentRevision: course.draft_revision }
    );
  }

  // 3. Preserve recoverable draft revision before destructive edits or batch updates (PRD §23.6)
  recoveryService.createSnapshot(
    token.authorId,
    courseId,
    `Auto-backup before executing batch ${idempotencyKey}`
  );

  const preSnapshotTree = structureService.getCourseTree(token.authorId, courseId);
  const tempIdMap = new Map<string, string>();
  const affectedEntities: string[] = [];
  const now = new Date().toISOString();

  function resolveId(id?: string): string {
    if (!id) return '';
    if (id.startsWith('$') || tempIdMap.has(id)) {
      const resolved = tempIdMap.get(id);
      if (!resolved && id.startsWith('$')) {
        throw new ValidationError(`Unresolved temporary ID: ${id}`);
      }
      if (resolved) return resolved;
    }
    return id;
  }

  db.exec('BEGIN TRANSACTION;');

  try {
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const opType = op.op || (op as any).type;

      switch (opType) {
        case 'create_module': {
          const title = (op.title || '').trim();
          if (!title) throw new ValidationError(`Operation #${i + 1} (create_module): title is required`);
          const moduleId = crypto.randomUUID();
          if (op.temp_id) tempIdMap.set(op.temp_id, moduleId);

          let pos = op.position;
          if (pos === undefined) {
            const maxPos = (
              db.prepare('SELECT MAX(position) as mp FROM modules WHERE course_id = ?').get(courseId) as any
            )?.mp;
            pos = (maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0) as number;
          }

          db.prepare(
            'INSERT INTO modules (id, course_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(moduleId, courseId, title, pos, now, now);

          affectedEntities.push(moduleId);
          break;
        }

        case 'update_module': {
          const moduleId = resolveId(op.module_id);
          const title = (op.title || '').trim();
          if (!moduleId) throw new ValidationError(`Operation #${i + 1} (update_module): module_id is required`);
          if (!title) throw new ValidationError(`Operation #${i + 1} (update_module): title is required`);

          db.prepare('UPDATE modules SET title = ?, updated_at = ? WHERE id = ? AND course_id = ?').run(
            title,
            now,
            moduleId,
            courseId
          );

          affectedEntities.push(moduleId);
          break;
        }

        case 'delete_module': {
          const moduleId = resolveId(op.module_id);
          if (!moduleId) throw new ValidationError(`Operation #${i + 1} (delete_module): module_id is required`);
          db.prepare('DELETE FROM modules WHERE id = ? AND course_id = ?').run(moduleId, courseId);
          affectedEntities.push(moduleId);
          break;
        }

        case 'create_lesson': {
          const moduleId = resolveId(op.module_id || (op as any).parent_temp_id);
          const title = (op.title || '').trim();
          if (!moduleId) throw new ValidationError(`Operation #${i + 1} (create_lesson): module_id is required`);
          if (!title) throw new ValidationError(`Operation #${i + 1} (create_lesson): title is required`);
          assertModuleInCourse(db, moduleId, courseId);

          const lessonId = crypto.randomUUID();
          if (op.temp_id) tempIdMap.set(op.temp_id, lessonId);

          let pos = op.position;
          if (pos === undefined) {
            const maxPos = (
              db.prepare('SELECT MAX(position) as mp FROM lessons WHERE module_id = ?').get(moduleId) as any
            )?.mp;
            pos = (maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0) as number;
          }

          db.prepare(
            'INSERT INTO lessons (id, module_id, title, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(lessonId, moduleId, title, op.description || null, pos, now, now);

          affectedEntities.push(lessonId);
          break;
        }

        case 'update_lesson': {
          const lessonId = resolveId(op.lesson_id);
          const title = (op.title || '').trim();
          if (!lessonId) throw new ValidationError(`Operation #${i + 1} (update_lesson): lesson_id is required`);
          if (!title) throw new ValidationError(`Operation #${i + 1} (update_lesson): title is required`);
          assertLessonInCourse(db, lessonId, courseId);

          db.prepare(
            'UPDATE lessons SET title = ?, description = ?, updated_at = ? WHERE id = ?'
          ).run(title, op.description || null, now, lessonId);

          affectedEntities.push(lessonId);
          break;
        }

        case 'delete_lesson': {
          const lessonId = resolveId(op.lesson_id);
          if (!lessonId) throw new ValidationError(`Operation #${i + 1} (delete_lesson): lesson_id is required`);
          assertLessonInCourse(db, lessonId, courseId);
          db.prepare('DELETE FROM lessons WHERE id = ?').run(lessonId);
          affectedEntities.push(lessonId);
          break;
        }

        case 'create_step': {
          const lessonId = resolveId(op.lesson_id || (op as any).parent_temp_id);
          const title = (op.title || '').trim();
          const stepType = (op as any).step_type || (op.op ? op.type : undefined) || ((op.type as string) !== 'create_step' ? op.type : 'theory');

          if (!lessonId) throw new ValidationError(`Operation #${i + 1} (create_step): lesson_id is required`);
          if (!title) throw new ValidationError(`Operation #${i + 1} (create_step): title is required`);
          assertLessonInCourse(db, lessonId, courseId);
          if (!stepType) throw new ValidationError(`Operation #${i + 1} (create_step): type is required`);

          // Lesson step count limit check (1-20 steps)
          const countRow = db.prepare('SELECT COUNT(*) as cnt FROM steps WHERE lesson_id = ?').get(lessonId) as any;
          if (countRow && countRow.cnt >= 20) {
            throw new ValidationError(`Operation #${i + 1} (create_step): Lesson already contains 20 steps (maximum allowed).`);
          }

          const stepId = crypto.randomUUID();
          if (op.temp_id) tempIdMap.set(op.temp_id, stepId);

          let pos = op.position;
          if (pos === undefined) {
            const maxPos = (
              db.prepare('SELECT MAX(position) as mp FROM steps WHERE lesson_id = ?').get(lessonId) as any
            )?.mp;
            pos = (maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0) as number;
          }

          const isRequired = op.is_required !== undefined ? (op.is_required ? 1 : 0) : 1;
          const duration = op.estimated_duration_minutes || 5;

          db.prepare(
            `INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(stepId, lessonId, stepType, title, pos, isRequired, duration, now, now);

          let payload = '';
          if (op.content) {
            payload = JSON.stringify(op.content);
          } else {
            payload = JSON.stringify(defaultStepContent(stepType));
          }

          db.prepare(
            `INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at)
             VALUES (?, ?, ?, 1, ?)`
          ).run(crypto.randomUUID(), stepId, payload, now);

          if (stepType === 'python' && Array.isArray(op.test_cases)) {
            for (let tIdx = 0; tIdx < op.test_cases.length; tIdx++) {
              const tc = op.test_cases[tIdx];
              db.prepare(
                `INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
              ).run(
                crypto.randomUUID(),
                stepId,
                tc.stdin || '',
                tc.expected_stdout || '',
                tc.is_hidden ? 1 : 0,
                tIdx,
                now
              );
            }
          }

          affectedEntities.push(stepId);
          break;
        }

        case 'update_step': {
          const stepId = resolveId(op.step_id);
          if (!stepId) throw new ValidationError(`Operation #${i + 1} (update_step): step_id is required`);

          const existingStep = db.prepare('SELECT * FROM steps WHERE id = ?').get(stepId) as any;
          if (!existingStep) throw new NotFoundError(`Step not found: ${stepId}`);
          assertStepInCourse(db, stepId, courseId);

          const title = op.title !== undefined ? op.title.trim() : existingStep.title;
          const isRequired = op.is_required !== undefined ? (op.is_required ? 1 : 0) : existingStep.is_required;
          const duration = op.estimated_duration_minutes !== undefined ? op.estimated_duration_minutes : existingStep.estimated_duration_minutes;

          db.prepare(
            'UPDATE steps SET title = ?, is_required = ?, estimated_duration_minutes = ?, updated_at = ? WHERE id = ?'
          ).run(title, isRequired, duration, now, stepId);

          if (op.content) {
            db.prepare(
              'UPDATE step_contents SET content_payload = ?, revision = revision + 1, updated_at = ? WHERE step_id = ?'
            ).run(JSON.stringify(op.content), now, stepId);
          }

          if (existingStep.type === 'python' && Array.isArray(op.test_cases)) {
            db.prepare('DELETE FROM test_cases WHERE step_id = ?').run(stepId);
            for (let tIdx = 0; tIdx < op.test_cases.length; tIdx++) {
              const tc = op.test_cases[tIdx];
              db.prepare(
                `INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
              ).run(
                crypto.randomUUID(),
                stepId,
                tc.stdin || '',
                tc.expected_stdout || '',
                tc.is_hidden ? 1 : 0,
                tIdx,
                now
              );
            }
          }

          affectedEntities.push(stepId);
          break;
        }

        case 'delete_step': {
          const stepId = resolveId(op.step_id);
          if (!stepId) throw new ValidationError(`Operation #${i + 1} (delete_step): step_id is required`);
          assertStepInCourse(db, stepId, courseId);
          db.prepare('DELETE FROM steps WHERE id = ?').run(stepId);
          affectedEntities.push(stepId);
          break;
        }

        default:
          throw new ValidationError(`Unsupported batch operation: ${(op as any).op}`);
      }
    }

    const newRevision = expectedRevision + 1;
    db.prepare('UPDATE courses SET draft_revision = ?, updated_at = ? WHERE id = ?').run(
      newRevision,
      now,
      courseId
    );

    const receipt: any = {
      course_id: courseId,
      idempotency_key: idempotencyKey,
      prior_revision: expectedRevision,
      new_revision: newRevision,
      draft_revision: newRevision,
      operations_applied: operations.length,
      created_ids: Object.fromEntries(tempIdMap),
      created_nodes: Object.fromEntries(tempIdMap),
      affected_entities: Array.from(new Set(affectedEntities)),
      status: 'applied',
      created_at: now,
    };

    const postSnapshotTree = structureService.getCourseTree(token.authorId, courseId);

    db.prepare(
      `INSERT INTO agent_mutations (
        id, token_id, author_id, course_id, tool_name, idempotency_key,
        base_revision, new_revision, affected_entities, prior_content, new_content, outcome,
        request_digest, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', ?, ?)`
    ).run(
      crypto.randomUUID(),
      token.id,
      token.authorId,
      courseId,
      toolName,
      idempotencyKey,
      expectedRevision,
      newRevision,
      JSON.stringify(receipt),
      JSON.stringify(preSnapshotTree),
      JSON.stringify(postSnapshotTree),
      requestDigest,
      now
    );

    // 4. Pre-commit authorization and revocation check immediately before COMMIT (PRD §23.3, §23.7, Finding 4)
    authService.verifyMcpPermission(token, 'content:write', courseId);
    if (operations.some((o) => (o.op || (o as any).type)?.startsWith('delete_'))) {
      authService.verifyMcpPermission(token, 'content:delete', courseId);
    }

    db.exec('COMMIT;');

    return {
      content: [{ type: 'text', text: JSON.stringify(receipt, null, 2) }],
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}
