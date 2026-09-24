import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError,
  StaleRevisionError,
} from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { CourseStructureService } from '../../services/course-structure-service.ts';
import type { McpTool, McpToolResult, BatchOperation, BatchReceipt } from '../types.ts';

export function createBatchAuthoringTools(): McpTool[] {
  return [
    {
      name: 'batch_author',
      description: 'Executes an atomic batch of up to 100 course structure operations with temporary ID resolution, revision conflict check, and idempotency deduplication.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Target course ID' },
          expected_revision: { type: 'integer', description: 'Expected draft_revision before batch application' },
          idempotency_key: { type: 'string', description: 'Unique idempotency key for this batch' },
          operations: {
            type: 'array',
            description: 'List of up to 100 authoring operations',
            items: {
              type: 'object',
              required: ['op'],
              properties: {
                op: {
                  type: 'string',
                  enum: [
                    'create_module',
                    'update_module',
                    'delete_module',
                    'create_lesson',
                    'update_lesson',
                    'delete_lesson',
                    'create_step',
                    'update_step',
                    'delete_step',
                  ],
                },
                temp_id: { type: 'string' },
                module_id: { type: 'string' },
                lesson_id: { type: 'string' },
                step_id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                position: { type: 'integer' },
                type: { type: 'string', enum: ['theory', 'video', 'quiz', 'python'] },
                is_required: { type: 'boolean' },
                estimated_duration_minutes: { type: 'integer' },
                content: { type: 'object' },
                test_cases: { type: 'array' },
              },
            },
          },
        },
        required: ['course_id', 'expected_revision', 'idempotency_key', 'operations'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
  ];
}

export async function executeBatchAuthorTool(
  name: string,
  args: any,
  token: ValidatedMcpToken,
  db: DatabaseSync,
  authService: McpAuthService,
  structureService: CourseStructureService
): Promise<McpToolResult> {
  if (name !== 'batch_author') {
    throw new ValidationError(`Unknown batch tool: ${name}`);
  }

  const courseId = args?.course_id?.trim();
  const idempotencyKey = args?.idempotency_key?.trim();
  const expectedRevision = Number(args?.expected_revision);
  const operations = args?.operations as BatchOperation[];

  if (!courseId) throw new ValidationError('course_id is required');
  if (!idempotencyKey) throw new ValidationError('idempotency_key is required');
  if (!Number.isInteger(expectedRevision)) {
    throw new ValidationError('expected_revision integer is required');
  }
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new ValidationError('operations array with at least 1 operation is required');
  }
  if (operations.length > 100) {
    throw new ValidationError('A maximum of 100 operations per batch is allowed');
  }

  authService.verifyMcpPermission(token, 'content:write', courseId);

  const hasDeleteOps = operations.some((o) => o.op.startsWith('delete_'));
  if (hasDeleteOps) {
    authService.verifyMcpPermission(token, 'content:delete', courseId);
  }

  // Idempotency check: see if already executed
  const existingMutation = db
    .prepare('SELECT * FROM agent_mutations WHERE token_id = ? AND idempotency_key = ?')
    .get(token.id, idempotencyKey) as any;

  if (existingMutation) {
    let receipt: any;
    try {
      receipt = JSON.parse(existingMutation.affected_entities);
      if (receipt && receipt.status === 'applied') {
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

  // Fetch course & check expected revision
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as any;
  if (!course) {
    throw new NotFoundError("This page isn't available.");
  }
  if (course.owner_id !== token.authorId) {
    throw new NotFoundError("This page isn't available.");
  }

  if (course.draft_revision !== expectedRevision) {
    throw new StaleRevisionError(
      'The course draft has been modified since the batch was prepared.',
      course.draft_revision,
      { courseId, currentRevision: course.draft_revision }
    );
  }

  // Capture pre-batch snapshot for 30-day draft recovery
  const preSnapshotTree = structureService.getCourseTree(token.authorId, courseId);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO recovery_revisions (id, course_id, revision_number, content_snapshot, created_by, reason, created_at)
     VALUES (?, ?, ?, ?, ?, 'Pre-batch authoring backup', ?)`
  ).run(
    crypto.randomUUID(),
    courseId,
    expectedRevision,
    JSON.stringify(preSnapshotTree),
    token.authorId,
    now
  );

  const tempIdMap = new Map<string, string>();
  const affectedEntities: string[] = [];

  function resolveId(id?: string): string {
    if (!id) return '';
    if (id.startsWith('$')) {
      const resolved = tempIdMap.get(id);
      if (!resolved) {
        throw new ValidationError(`Unresolved temporary ID: ${id}`);
      }
      return resolved;
    }
    return id;
  }

  db.exec('BEGIN TRANSACTION;');

  try {
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];

      switch (op.op) {
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
            pos = maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0;
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
          const moduleId = resolveId(op.module_id);
          const title = (op.title || '').trim();
          if (!moduleId) throw new ValidationError(`Operation #${i + 1} (create_lesson): module_id is required`);
          if (!title) throw new ValidationError(`Operation #${i + 1} (create_lesson): title is required`);

          const lessonId = crypto.randomUUID();
          if (op.temp_id) tempIdMap.set(op.temp_id, lessonId);

          let pos = op.position;
          if (pos === undefined) {
            const maxPos = (
              db.prepare('SELECT MAX(position) as mp FROM lessons WHERE module_id = ?').get(moduleId) as any
            )?.mp;
            pos = maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0;
          }

          db.prepare(
            'INSERT INTO lessons (id, module_id, title, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(lessonId, moduleId, title, op.description || '', pos, now, now);

          affectedEntities.push(lessonId);
          break;
        }

        case 'update_lesson': {
          const lessonId = resolveId(op.lesson_id);
          const title = (op.title || '').trim();
          if (!lessonId) throw new ValidationError(`Operation #${i + 1} (update_lesson): lesson_id is required`);
          if (!title) throw new ValidationError(`Operation #${i + 1} (update_lesson): title is required`);

          db.prepare('UPDATE lessons SET title = ?, description = ?, updated_at = ? WHERE id = ?').run(
            title,
            op.description || '',
            now,
            lessonId
          );

          affectedEntities.push(lessonId);
          break;
        }

        case 'delete_lesson': {
          const lessonId = resolveId(op.lesson_id);
          if (!lessonId) throw new ValidationError(`Operation #${i + 1} (delete_lesson): lesson_id is required`);
          db.prepare('DELETE FROM lessons WHERE id = ?').run(lessonId);
          affectedEntities.push(lessonId);
          break;
        }

        case 'create_step': {
          const lessonId = resolveId(op.lesson_id);
          const title = (op.title || '').trim();
          const type = op.type;
          if (!lessonId) throw new ValidationError(`Operation #${i + 1} (create_step): lesson_id is required`);
          if (!title) throw new ValidationError(`Operation #${i + 1} (create_step): title is required`);
          if (!type) throw new ValidationError(`Operation #${i + 1} (create_step): type is required`);

          const stepCount = (
            db.prepare('SELECT COUNT(*) as cnt FROM steps WHERE lesson_id = ?').get(lessonId) as any
          )?.cnt || 0;
          if (stepCount >= 20) {
            throw new ValidationError('A lesson cannot contain more than 20 steps.');
          }

          const stepId = crypto.randomUUID();
          if (op.temp_id) tempIdMap.set(op.temp_id, stepId);

          let pos = op.position;
          if (pos === undefined) {
            const maxPos = (
              db.prepare('SELECT MAX(position) as mp FROM steps WHERE lesson_id = ?').get(lessonId) as any
            )?.mp;
            pos = maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0;
          }

          const isRequired = op.is_required !== undefined ? (op.is_required ? 1 : 0) : 1;
          const duration = op.estimated_duration_minutes || 5;

          db.prepare(
            `INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(stepId, lessonId, type, title, pos, isRequired, duration, now, now);

          let contentJson = JSON.stringify(op.content || { kind: type, title });
          db.prepare(
            'INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, ?)'
          ).run(crypto.randomUUID(), stepId, contentJson, now);

          if (type === 'python' && Array.isArray(op.test_cases)) {
            for (let t = 0; t < op.test_cases.length; t++) {
              const tc = op.test_cases[t];
              db.prepare(
                `INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
              ).run(
                crypto.randomUUID(),
                stepId,
                tc.stdin ?? '',
                tc.expected_stdout ?? '',
                tc.is_hidden ? 1 : 0,
                t,
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

          const step = db.prepare('SELECT * FROM steps WHERE id = ?').get(stepId) as any;
          if (!step) throw new NotFoundError('Step not found');

          const title = op.title !== undefined ? op.title.trim() : step.title;
          const isRequired = op.is_required !== undefined ? (op.is_required ? 1 : 0) : step.is_required;
          const duration = op.estimated_duration_minutes || step.estimated_duration_minutes;

          db.prepare(
            'UPDATE steps SET title = ?, is_required = ?, estimated_duration_minutes = ?, updated_at = ? WHERE id = ?'
          ).run(title, isRequired, duration, now, stepId);

          if (op.content) {
            db.prepare(
              'UPDATE step_contents SET content_payload = ?, revision = revision + 1, updated_at = ? WHERE step_id = ?'
            ).run(JSON.stringify(op.content), now, stepId);
          }

          if (Array.isArray(op.test_cases)) {
            db.prepare('DELETE FROM test_cases WHERE step_id = ?').run(stepId);
            for (let t = 0; t < op.test_cases.length; t++) {
              const tc = op.test_cases[t];
              db.prepare(
                `INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
              ).run(
                crypto.randomUUID(),
                stepId,
                tc.stdin ?? '',
                tc.expected_stdout ?? '',
                tc.is_hidden ? 1 : 0,
                t,
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
          db.prepare('DELETE FROM steps WHERE id = ?').run(stepId);
          affectedEntities.push(stepId);
          break;
        }

        default:
          throw new ValidationError(`Unknown operation type: ${(op as any).op}`);
      }
    }

    const newRevision = expectedRevision + 1;
    db.prepare('UPDATE courses SET draft_revision = ?, updated_at = ? WHERE id = ?').run(
      newRevision,
      now,
      courseId
    );

    const receipt: BatchReceipt = {
      course_id: courseId,
      idempotency_key: idempotencyKey,
      prior_revision: expectedRevision,
      new_revision: newRevision,
      operations_applied: operations.length,
      created_ids: Object.fromEntries(tempIdMap),
      affected_entities: Array.from(new Set(affectedEntities)),
      status: 'applied',
      created_at: now,
    };

    const postSnapshotTree = structureService.getCourseTree(token.authorId, courseId);

    db.prepare(
      `INSERT INTO agent_mutations (
        id, token_id, author_id, course_id, tool_name, idempotency_key,
        base_revision, new_revision, affected_entities, prior_content, new_content, outcome, created_at
      ) VALUES (?, ?, ?, ?, 'batch_author', ?, ?, ?, ?, ?, ?, 'success', ?)`
    ).run(
      crypto.randomUUID(),
      token.id,
      token.authorId,
      courseId,
      idempotencyKey,
      expectedRevision,
      newRevision,
      JSON.stringify(receipt),
      JSON.stringify(preSnapshotTree),
      JSON.stringify(postSnapshotTree),
      now
    );

    db.exec('COMMIT;');

    return {
      content: [{ type: 'text', text: JSON.stringify(receipt, null, 2) }],
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}
