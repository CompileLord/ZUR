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
import { DraftRecoveryService } from '../../services/draft-recovery-service.ts';
import type { McpTool, McpToolResult, BatchOperation, BatchReceipt } from '../types.ts';

const MAX_BATCH_OPERATIONS = 100;
const MAX_BATCH_TEXT_BYTES = 1024 * 1024; // 1 MiB per PRD §23.6
const PLAN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function computeCanonicalBatchDigest(courseId: string, expectedRevision: number, operations: BatchOperation[]): string {
  const normalizedOps = operations.map((rawOp) => {
    const op = { ...rawOp };
    if (!op.op && (op as any).type) {
      op.op = (op as any).type;
    }
    const keys = Object.keys(op).sort();
    const obj: any = {};
    for (const k of keys) {
      obj[k] = (op as any)[k];
    }
    return obj;
  });

  const canonical = JSON.stringify({
    course_id: courseId,
    expected_revision: expectedRevision,
    operations: normalizedOps,
  });

  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function createBatchAuthoringTools(): McpTool[] {
  const operationsProperty = {
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
  };

  return [
    {
      name: 'prepare_course_changes',
      description: 'Validates and prepares an atomic batch of course changes, returning an effect preview and a short-lived plan ID bound to credential, digest, course, and revision.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Target course ID' },
          expected_revision: { type: 'integer', description: 'Expected draft_revision before batch application' },
          operations: operationsProperty,
        },
        required: ['course_id', 'expected_revision', 'operations'],
      },
      annotations: {
        readOnly: true,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'apply_course_changes',
      description: 'Applies a previously prepared batch course change plan atomically after rechecking authorization and revision.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Target course ID' },
          plan_id: { type: 'string', description: 'Short-lived plan ID returned by prepare_course_changes' },
          expected_revision: { type: 'integer', description: 'Expected draft_revision before batch application' },
          idempotency_key: { type: 'string', description: 'Unique idempotency key for this batch application' },
        },
        required: ['course_id', 'plan_id', 'expected_revision', 'idempotency_key'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'batch_author',
      description: 'Executes an atomic batch of up to 100 course structure operations with temporary ID resolution, revision conflict check, and idempotency deduplication.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Target course ID' },
          expected_revision: { type: 'integer', description: 'Expected draft_revision before batch application' },
          idempotency_key: { type: 'string', description: 'Unique idempotency key for this batch' },
          operations: operationsProperty,
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
  const recoveryService = new DraftRecoveryService(db);

  if (name === 'prepare_course_changes') {
    const courseId = args?.course_id?.trim();
    const expectedRevision = Number(args?.expected_revision ?? args?.base_revision);
    const operations = args?.operations as BatchOperation[];

    if (!courseId) throw new ValidationError('course_id is required');
    if (!Number.isInteger(expectedRevision)) throw new ValidationError('expected_revision integer is required');
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new ValidationError('operations array with at least 1 operation is required');
    }
    if (operations.length > MAX_BATCH_OPERATIONS) {
      throw new ValidationError(`Maximum ${MAX_BATCH_OPERATIONS} operations per batch is allowed`);
    }

    const payloadText = JSON.stringify(operations);
    if (Buffer.byteLength(payloadText, 'utf8') > MAX_BATCH_TEXT_BYTES) {
      throw new ValidationError(`Batch operations text exceeds 1 MiB limit.`);
    }

    authService.verifyMcpPermission(token, 'content:write', courseId);
    if (operations.some((o) => (o.op || (o as any).type)?.startsWith('delete_'))) {
      authService.verifyMcpPermission(token, 'content:delete', courseId);
    }

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

    // Validate operations and compute preview summary
    const summary = {
      modules_created: 0,
      modules_updated: 0,
      modules_deleted: 0,
      lessons_created: 0,
      lessons_updated: 0,
      lessons_deleted: 0,
      steps_created: 0,
      steps_updated: 0,
      steps_deleted: 0,
      total_operations: operations.length,
    };

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const opType = op?.op || (op as any)?.type;
      if (!op || !opType) throw new ValidationError(`Operation #${i + 1} is missing "op" field.`);
      if (opType === 'create_module') summary.modules_created++;
      else if (opType === 'update_module') summary.modules_updated++;
      else if (opType === 'delete_module') summary.modules_deleted++;
      else if (opType === 'create_lesson') summary.lessons_created++;
      else if (opType === 'update_lesson') summary.lessons_updated++;
      else if (opType === 'delete_lesson') summary.lessons_deleted++;
      else if (opType === 'create_step') summary.steps_created++;
      else if (opType === 'update_step') summary.steps_updated++;
      else if (opType === 'delete_step') summary.steps_deleted++;
      else throw new ValidationError(`Unsupported op "${opType}" at index ${i}`);
    }

    // Validate resulting hierarchy, scoped IDs, and content schemas
    validateBatchOperationsAndHierarchy(db, courseId, operations);

    const requestDigest = computeCanonicalBatchDigest(courseId, expectedRevision, operations);
    const planId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + PLAN_TTL_MS).toISOString();

    db.prepare(`
      INSERT INTO course_change_plans (
        id, token_id, author_id, course_id, base_revision, request_digest, plan_payload, summary, status, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'prepared', ?)
    `).run(
      planId,
      token.id,
      token.authorId,
      courseId,
      expectedRevision,
      requestDigest,
      payloadText,
      JSON.stringify(summary),
      expiresAt
    );

    const result = {
      plan_id: planId,
      course_id: courseId,
      base_revision: expectedRevision,
      request_digest: requestDigest,
      canonical_digest: requestDigest,
      operation_count: operations.length,
      summary,
      status: 'prepared',
      expires_at: expiresAt,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  if (name === 'apply_course_changes') {
    const courseId = args?.course_id?.trim();
    const planId = args?.plan_id?.trim();
    const idempotencyKey = args?.idempotency_key?.trim();
    const rawExpectedRev = args?.expected_revision ?? args?.base_revision;

    if (!courseId) throw new ValidationError('course_id is required');
    if (!planId) throw new ValidationError('plan_id is required');
    if (!idempotencyKey) throw new ValidationError('idempotency_key is required');

    authService.verifyMcpPermission(token, 'content:write', courseId);

    const planRow = db.prepare(`
      SELECT * FROM course_change_plans
      WHERE id = ? AND course_id = ? AND token_id = ?
    `).get(planId, courseId, token.id) as any;

    if (!planRow) {
      throw new NotFoundError('Course change plan not found or does not belong to this token.');
    }

    const applyDigest = crypto.createHash('sha256')
      .update(JSON.stringify({
        course_id: courseId,
        plan_id: planId,
        expected_revision: rawExpectedRev !== undefined ? Number(rawExpectedRev) : null,
        request_digest: planRow.request_digest,
      }))
      .digest('hex');

    const prior = db.prepare('SELECT request_digest, affected_entities FROM agent_mutations WHERE token_id = ? AND idempotency_key = ?')
      .get(token.id, idempotencyKey) as { request_digest: string; affected_entities: string } | undefined;

    if (prior) {
      if (prior.request_digest !== applyDigest) {
        throw new ConflictError('Idempotency key has already been used with different request parameters.');
      }
      const receipt = JSON.parse(prior.affected_entities);
      return { content: [{ type: 'text', text: JSON.stringify(receipt, null, 2) }] };
    }

    if (planRow.status === 'applied') {
      throw new ConflictError('Course change plan is already applied.');
    }

    if (new Date(planRow.expires_at) <= new Date()) {
      throw new ValidationError('Course change plan has expired. Please run prepare_course_changes again.');
    }

    const expectedRevision = rawExpectedRev !== undefined ? Number(rawExpectedRev) : planRow.base_revision;
    if (!Number.isInteger(expectedRevision)) throw new ValidationError('expected_revision integer is required');

    if (planRow.base_revision !== expectedRevision) {
      throw new StaleRevisionError(
        'The expected_revision does not match the prepared plan base revision.',
        planRow.base_revision,
        { courseId, currentRevision: expectedRevision, planBaseRevision: planRow.base_revision }
      );
    }

    const operations: BatchOperation[] = JSON.parse(planRow.plan_payload);
    if (operations.some((o) => (o.op || (o as any).type)?.startsWith('delete_'))) {
      authService.verifyMcpPermission(token, 'content:delete', courseId);
    }

    const result = await executeBatchOperationsCore({
      courseId,
      expectedRevision,
      idempotencyKey,
      operations,
      requestDigest: applyDigest,
      toolName: 'apply_course_changes',
      token,
      db,
      authService,
      structureService,
      recoveryService,
    });

    db.prepare("UPDATE course_change_plans SET status = 'applied' WHERE id = ?").run(planId);
    return result;
  }

  if (name === 'batch_author') {
    const courseId = args?.course_id?.trim();
    const idempotencyKey = args?.idempotency_key?.trim();
    const expectedRevision = Number(args?.expected_revision ?? args?.base_revision);
    const operations = args?.operations as BatchOperation[];

    if (!courseId) throw new ValidationError('course_id is required');
    if (!idempotencyKey) throw new ValidationError('idempotency_key is required');
    if (!Number.isInteger(expectedRevision)) throw new ValidationError('expected_revision integer is required');
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new ValidationError('operations array with at least 1 operation is required');
    }
    if (operations.length > MAX_BATCH_OPERATIONS) {
      throw new ValidationError(`Maximum ${MAX_BATCH_OPERATIONS} operations per batch is allowed`);
    }

    const payloadText = JSON.stringify(operations);
    if (Buffer.byteLength(payloadText, 'utf8') > MAX_BATCH_TEXT_BYTES) {
      throw new ValidationError(`Batch operations text exceeds 1 MiB limit.`);
    }

    authService.verifyMcpPermission(token, 'content:write', courseId);
    if (operations.some((o) => (o.op || (o as any).type)?.startsWith('delete_'))) {
      authService.verifyMcpPermission(token, 'content:delete', courseId);
    }

    // Validate resulting hierarchy, scoped IDs, and content schemas
    validateBatchOperationsAndHierarchy(db, courseId, operations);

    const requestDigest = computeCanonicalBatchDigest(courseId, expectedRevision, operations);

    return await executeBatchOperationsCore({
      courseId,
      expectedRevision,
      idempotencyKey,
      operations,
      requestDigest,
      toolName: 'batch_author',
      token,
      db,
      authService,
      structureService,
      recoveryService,
    });
  }

  throw new ValidationError(`Unknown batch tool: ${name}`);
}

async function executeBatchOperationsCore(params: {
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
            pos = maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0;
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
          const stepType = (op as any).step_type || (op.op ? op.type : undefined) || (op.type !== 'create_step' ? op.type : 'theory');

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
            pos = maxPos !== null && maxPos !== undefined ? maxPos + 1 : 0;
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
          } else if (stepType === 'theory') {
            payload = JSON.stringify({ kind: 'theory', markdown: `# ${title}\n` });
          } else if (stepType === 'video') {
            payload = JSON.stringify({ kind: 'video', videoUrl: '', provider: 'youtube', transcript: '', captionVerified: false });
          } else if (stepType === 'quiz') {
            payload = JSON.stringify({
              kind: 'quiz',
              quizType: 'single_choice',
              prompt: title,
              options: [
                { id: crypto.randomUUID(), text: 'Option 1', isCorrect: true },
                { id: crypto.randomUUID(), text: 'Option 2', isCorrect: false },
              ],
              explanation: '',
            });
          } else if (stepType === 'python') {
            payload = JSON.stringify({
              kind: 'python',
              problemStatement: title,
              starterCode: '# Starter code\n',
              referenceSolution: '# Reference\n',
              hints: [],
            });
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

function assertModuleInCourse(db: DatabaseSync, moduleId: string, courseId: string): void {
  if (!db.prepare('SELECT 1 FROM modules WHERE id = ? AND course_id = ?').get(moduleId, courseId)) {
    throw new NotFoundError('Module not found in authorized course.');
  }
}
function assertLessonInCourse(db: DatabaseSync, lessonId: string, courseId: string): void {
  if (!db.prepare('SELECT 1 FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ? AND m.course_id = ?').get(lessonId, courseId)) {
    throw new NotFoundError('Lesson not found in authorized course.');
  }
}
function assertStepInCourse(db: DatabaseSync, stepId: string, courseId: string): void {
  if (!db.prepare('SELECT 1 FROM steps s JOIN lessons l ON l.id = s.lesson_id JOIN modules m ON m.id = l.module_id WHERE s.id = ? AND m.course_id = ?').get(stepId, courseId)) {
    throw new NotFoundError('Step not found in authorized course.');
  }
}

export function validateBatchOperationsAndHierarchy(
  db: DatabaseSync,
  courseId: string,
  operations: BatchOperation[]
): void {
  const plannedIds = new Map<string, 'module' | 'lesson' | 'step'>();
  const deletedEntities = new Set<string>();
  const lessonStepCounts = new Map<string, number>();

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const type = op.op || (op as any).type;
    const parent = (op as any).parent_temp_id;
    const moduleId = op.module_id || (type === 'create_lesson' ? parent : undefined);
    const lessonId = op.lesson_id || (type === 'create_step' ? parent : undefined);
    const stepId = op.step_id;

    if (!type) {
      throw new ValidationError(`Operation #${i + 1} is missing "op" field.`);
    }

    switch (type) {
      case 'create_module': {
        const title = (op.title || '').trim();
        if (!title) throw new ValidationError(`Operation #${i + 1} (create_module): title is required`);
        if (op.temp_id) {
          if (plannedIds.has(op.temp_id)) {
            throw new ValidationError(`Duplicate temporary ID: ${op.temp_id}`);
          }
          plannedIds.set(op.temp_id, 'module');
        }
        break;
      }

      case 'update_module': {
        if (!moduleId) throw new ValidationError(`Operation #${i + 1} (update_module): module_id is required`);
        if (deletedEntities.has(moduleId)) {
          throw new ValidationError(`Operation #${i + 1} (update_module): cannot update deleted module ${moduleId}`);
        }
        if (plannedIds.get(moduleId) !== 'module') {
          assertModuleInCourse(db, moduleId, courseId);
        }
        if (op.title !== undefined && !(op.title || '').trim()) {
          throw new ValidationError(`Operation #${i + 1} (update_module): title cannot be empty`);
        }
        break;
      }

      case 'delete_module': {
        if (!moduleId) throw new ValidationError(`Operation #${i + 1} (delete_module): module_id is required`);
        if (deletedEntities.has(moduleId)) {
          throw new ValidationError(`Operation #${i + 1} (delete_module): module ${moduleId} already deleted`);
        }
        if (plannedIds.get(moduleId) !== 'module') {
          assertModuleInCourse(db, moduleId, courseId);
        }
        deletedEntities.add(moduleId);
        break;
      }

      case 'create_lesson': {
        if (!moduleId) throw new ValidationError(`Operation #${i + 1} (create_lesson): module_id is required`);
        if (deletedEntities.has(moduleId)) {
          throw new ValidationError(`Operation #${i + 1} (create_lesson): cannot add lesson to deleted module ${moduleId}`);
        }
        if (plannedIds.get(moduleId) !== 'module') {
          assertModuleInCourse(db, moduleId, courseId);
        }
        const title = (op.title || '').trim();
        if (!title) throw new ValidationError(`Operation #${i + 1} (create_lesson): title is required`);
        if (op.temp_id) {
          if (plannedIds.has(op.temp_id)) {
            throw new ValidationError(`Duplicate temporary ID: ${op.temp_id}`);
          }
          plannedIds.set(op.temp_id, 'lesson');
          lessonStepCounts.set(op.temp_id, 0);
        }
        break;
      }

      case 'update_lesson': {
        if (!lessonId) throw new ValidationError(`Operation #${i + 1} (update_lesson): lesson_id is required`);
        if (deletedEntities.has(lessonId)) {
          throw new ValidationError(`Operation #${i + 1} (update_lesson): cannot update deleted lesson ${lessonId}`);
        }
        if (plannedIds.get(lessonId) !== 'lesson') {
          assertLessonInCourse(db, lessonId, courseId);
        }
        if (op.title !== undefined && !(op.title || '').trim()) {
          throw new ValidationError(`Operation #${i + 1} (update_lesson): title cannot be empty`);
        }
        break;
      }

      case 'delete_lesson': {
        if (!lessonId) throw new ValidationError(`Operation #${i + 1} (delete_lesson): lesson_id is required`);
        if (deletedEntities.has(lessonId)) {
          throw new ValidationError(`Operation #${i + 1} (delete_lesson): lesson ${lessonId} already deleted`);
        }
        if (plannedIds.get(lessonId) !== 'lesson') {
          assertLessonInCourse(db, lessonId, courseId);
        }
        deletedEntities.add(lessonId);
        break;
      }

      case 'create_step': {
        if (!lessonId) throw new ValidationError(`Operation #${i + 1} (create_step): lesson_id is required`);
        if (deletedEntities.has(lessonId)) {
          throw new ValidationError(`Operation #${i + 1} (create_step): cannot add step to deleted lesson ${lessonId}`);
        }
        if (plannedIds.get(lessonId) !== 'lesson') {
          assertLessonInCourse(db, lessonId, courseId);
        }

        const title = (op.title || '').trim();
        if (!title) throw new ValidationError(`Operation #${i + 1} (create_step): title is required`);

        const stepType = (op as any).step_type || (op.op ? op.type : undefined) || (op.type !== 'create_step' ? op.type : 'theory');
        if (!['theory', 'quiz', 'python', 'video'].includes(stepType)) {
          throw new ValidationError(`Operation #${i + 1} (create_step): unsupported step type "${stepType}"`);
        }

        // Validate step count in resulting hierarchy
        let currentCount = lessonStepCounts.get(lessonId);
        if (currentCount === undefined) {
          const row = db.prepare('SELECT COUNT(*) as cnt FROM steps WHERE lesson_id = ?').get(lessonId) as any;
          currentCount = row ? row.cnt : 0;
        }
        currentCount++;
        if (currentCount > 20) {
          throw new ValidationError(`Operation #${i + 1} (create_step): Lesson already contains or will exceed 20 steps (maximum allowed).`);
        }
        lessonStepCounts.set(lessonId, currentCount);

        // Validate content schema
        if (op.content) {
          validateStepContentSchema(op.content, stepType, i + 1);
        }
        if (op.test_cases) {
          validateStepContentSchema({ test_cases: op.test_cases }, 'python', i + 1);
        }

        if (op.temp_id) {
          if (plannedIds.has(op.temp_id)) {
            throw new ValidationError(`Duplicate temporary ID: ${op.temp_id}`);
          }
          plannedIds.set(op.temp_id, 'step');
        }
        break;
      }

      case 'update_step': {
        if (!stepId) throw new ValidationError(`Operation #${i + 1} (update_step): step_id is required`);
        if (deletedEntities.has(stepId)) {
          throw new ValidationError(`Operation #${i + 1} (update_step): cannot update deleted step ${stepId}`);
        }
        let existingType = 'theory';
        if (plannedIds.get(stepId) !== 'step') {
          assertStepInCourse(db, stepId, courseId);
          const stepRow = db.prepare('SELECT type FROM steps WHERE id = ?').get(stepId) as any;
          if (stepRow?.type) existingType = stepRow.type;
        }
        if (op.title !== undefined && !(op.title || '').trim()) {
          throw new ValidationError(`Operation #${i + 1} (update_step): title cannot be empty`);
        }
        if (op.content) {
          const stepType = (op as any).step_type || existingType;
          validateStepContentSchema(op.content, stepType, i + 1);
        }
        if (op.test_cases) {
          validateStepContentSchema({ test_cases: op.test_cases }, 'python', i + 1);
        }
        break;
      }

      case 'delete_step': {
        if (!stepId) throw new ValidationError(`Operation #${i + 1} (delete_step): step_id is required`);
        if (deletedEntities.has(stepId)) {
          throw new ValidationError(`Operation #${i + 1} (delete_step): step ${stepId} already deleted`);
        }
        if (plannedIds.get(stepId) !== 'step') {
          assertStepInCourse(db, stepId, courseId);
          const stepRow = db.prepare('SELECT lesson_id FROM steps WHERE id = ?').get(stepId) as any;
          if (stepRow?.lesson_id) {
            const lid = stepRow.lesson_id;
            let currentCount = lessonStepCounts.get(lid);
            if (currentCount === undefined) {
              const row = db.prepare('SELECT COUNT(*) as cnt FROM steps WHERE lesson_id = ?').get(lid) as any;
              currentCount = row ? row.cnt : 0;
            }
            lessonStepCounts.set(lid, Math.max(0, currentCount - 1));
          }
        }
        deletedEntities.add(stepId);
        break;
      }

      default:
        throw new ValidationError(`Unsupported op "${type}" at index ${i}`);
    }
  }
}

function validateStepContentSchema(content: any, stepType: string, opIndex: number): void {
  if (typeof content !== 'object' || content === null) {
    throw new ValidationError(`Operation #${opIndex}: content must be an object`);
  }
  if (stepType === 'theory') {
    if (content.markdown !== undefined && typeof content.markdown !== 'string') {
      throw new ValidationError(`Operation #${opIndex} (theory): content.markdown must be a string`);
    }
  } else if (stepType === 'quiz') {
    if (content.options !== undefined) {
      if (!Array.isArray(content.options) || content.options.length < 2 || content.options.length > 6) {
        throw new ValidationError(`Operation #${opIndex} (quiz): content.options must contain between 2 and 6 options`);
      }
      let hasCorrect = false;
      for (const opt of content.options) {
        if (!opt || typeof opt !== 'object' || typeof opt.text !== 'string' || !opt.text.trim()) {
          throw new ValidationError(`Operation #${opIndex} (quiz): each option must have non-empty text`);
        }
        if (opt.isCorrect) hasCorrect = true;
      }
      if (!hasCorrect) {
        throw new ValidationError(`Operation #${opIndex} (quiz): at least one option must have isCorrect set to true`);
      }
    }
  } else if (stepType === 'python') {
    if (content.test_cases !== undefined) {
      if (!Array.isArray(content.test_cases)) {
        throw new ValidationError(`Operation #${opIndex} (python): test_cases must be an array`);
      }
      for (const tc of content.test_cases) {
        if (!tc || typeof tc !== 'object' || typeof tc.stdin !== 'string' || typeof tc.expected_stdout !== 'string') {
          throw new ValidationError(`Operation #${opIndex} (python): each test case must have string stdin and expected_stdout`);
        }
      }
    }
  } else if (stepType === 'video') {
    if (content.videoUrl !== undefined && typeof content.videoUrl !== 'string') {
      throw new ValidationError(`Operation #${opIndex} (video): content.videoUrl must be a string`);
    }
  }
}
