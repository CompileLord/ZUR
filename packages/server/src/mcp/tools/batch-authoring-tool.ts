import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { ValidationError, NotFoundError, ConflictError, StaleRevisionError } from 'zur-shared';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { CourseStructureService } from '../../services/course-structure-service.ts';
import type { McpTool, McpToolResult, BatchOperation } from '../types.ts';
import { DraftRecoveryService } from '../../services/draft-recovery-service.ts';
import { executeBatchOperationsCore } from './batch-operations-core.ts';
import { validateBatchOperationsAndHierarchy } from './batch-validation.ts';

export { validateBatchOperationsAndHierarchy };

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
        title: { type: 'string', maxLength: 200 },
        description: { type: 'string' },
        position: { type: 'integer', minimum: 0 },
        type: { type: 'string', description: 'Step type for create_step (theory, video, quiz, python). Legacy: may also carry the operation name when op is omitted.' },
        step_type: { type: 'string', description: 'Legacy alias of type' },
        parent_temp_id: { type: 'string', description: 'temp_id of the parent module/lesson created earlier in the same batch' },
        is_required: { type: 'boolean' },
        estimated_duration_minutes: { type: 'integer', minimum: 0 },
        content: { type: 'object' },
        test_cases: {
          type: 'array',
          items: {
            type: 'object',
            required: ['stdin', 'expected_stdout'],
            properties: {
              stdin: { type: 'string' },
              expected_stdout: { type: 'string' },
              is_hidden: { type: 'boolean' },
            },
          },
        },
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
          expected_revision: { type: 'integer', minimum: 0, description: 'Expected draft_revision before batch application' },
          base_revision: { type: 'integer', minimum: 0, description: 'Deprecated alias of expected_revision' },
          operations: operationsProperty,
        },
        required: ['course_id', 'operations'],
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
          expected_revision: { type: 'integer', minimum: 0, description: 'Expected draft_revision before batch application' },
          base_revision: { type: 'integer', minimum: 0, description: 'Deprecated alias of expected_revision' },
          idempotency_key: { type: 'string', description: 'Unique idempotency key for this batch application' },
        },
        required: ['course_id', 'plan_id', 'idempotency_key'],
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
          expected_revision: { type: 'integer', minimum: 0, description: 'Expected draft_revision before batch application' },
          base_revision: { type: 'integer', minimum: 0, description: 'Deprecated alias of expected_revision' },
          idempotency_key: { type: 'string', description: 'Unique idempotency key for this batch' },
          operations: operationsProperty,
        },
        required: ['course_id', 'idempotency_key', 'operations'],
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
