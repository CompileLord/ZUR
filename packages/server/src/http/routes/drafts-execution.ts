import { AuthenticationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Code drafts and learner Python execution (run samples, custom input, submit, job status).
export async function handleDraftAndExecutionRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, pathname, method, token, identityService, executionService, draftService, parseJsonBody, sendJson, recordProductEvent } = rc;

  // 17. Save Code Draft (T025)
  if (method === 'PUT' && pathname === '/api/drafts') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const body = await parseJsonBody(req);
    const result = draftService.saveDraft(
      user.id,
      body.enrollmentId,
      body.stepId,
      body.code,
      body.baseRevision
    );
    sendJson(res, 200, result);
    return true;
  }

  // 18. Reset Code Draft to Starter Code (T025)
  if (method === 'POST' && pathname === '/api/drafts/reset') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const body = await parseJsonBody(req);
    const result = draftService.resetDraft(user.id, body.enrollmentId, body.stepId, body.expectedRevision);
    sendJson(res, 200, result);
    return true;
  }

  // 19. Run Samples (T022)
  if (method === 'POST' && pathname === '/api/execution/run-samples') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const body = await parseJsonBody(req);
    const result = executionService.enqueueJob({
      userId: user.id,
      enrollmentId: body.enrollmentId,
      stepId: body.stepId,
      jobType: 'run_samples',
      code: body.code,
      idempotencyKey: body.idempotencyKey,
    });
    recordProductEvent({ eventName: 'exercise.run', userId: user.id, enrollmentId: body.enrollmentId, stepId: body.stepId, metadata: { mode: 'samples' } });
    sendJson(res, 202, result);
    return true;
  }

  // 20. Run Custom Input (T022)
  if (method === 'POST' && pathname === '/api/execution/run-custom') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const body = await parseJsonBody(req);
    const result = executionService.enqueueJob({
      userId: user.id,
      enrollmentId: body.enrollmentId,
      stepId: body.stepId,
      jobType: 'run_custom',
      code: body.code,
      stdin: body.stdin || '',
      idempotencyKey: body.idempotencyKey,
    });
    recordProductEvent({ eventName: 'exercise.run', userId: user.id, enrollmentId: body.enrollmentId, stepId: body.stepId, metadata: { mode: 'custom' } });
    sendJson(res, 202, result);
    return true;
  }

  // 21. Submit Solution (T023)
  if (method === 'POST' && pathname === '/api/execution/submit') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const body = await parseJsonBody(req);
    const result = executionService.enqueueJob({
      userId: user.id,
      enrollmentId: body.enrollmentId,
      stepId: body.stepId,
      jobType: 'submit',
      code: body.code,
      idempotencyKey: body.idempotencyKey,
    });
    recordProductEvent({ eventName: 'exercise.submitted', userId: user.id, enrollmentId: body.enrollmentId, stepId: body.stepId, metadata: { status: 'queued' } });
    sendJson(res, 202, result);
    return true;
  }

  // 22. Get Execution Job Status by ID (T021)
  const jobMatch = pathname.match(/^\/api\/execution\/jobs\/([^/]+)$/);
  if (method === 'GET' && jobMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const jobId = jobMatch[1];
    const status = executionService.getJob(jobId, user.id);
    sendJson(res, 200, status);
    return true;
  }

  return false;
}
