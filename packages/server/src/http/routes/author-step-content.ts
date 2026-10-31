import { AuthenticationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Author step content autosave, quiz and Python exercise editing.
export async function handleAuthorStepContentRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, url, pathname, method, token, db, identityService, quizService, exerciseAuthoringService, courseAutosaveService, learningProgressService, parseJsonBody, sendJson, recordProductEvent } = rc;

  // 43. Author: Step Content Autosave & Recovery (T038)
  const authorStepContentMatch = pathname.match(/^\/api\/author\/steps\/([a-zA-Z0-9_-]+)\/content$/);
  if (method === 'GET' && authorStepContentMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const stepId = authorStepContentMatch[1];
    const content = courseAutosaveService.getStepContent(user.id, stepId);
    sendJson(res, 200, content);
    return true;
  }
  if (method === 'PUT' && authorStepContentMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const stepId = authorStepContentMatch[1];
    const body = await parseJsonBody(req);
    const updated = courseAutosaveService.saveStepContent(
      user.id,
      stepId,
      Number(body.expectedRevision),
      body.payload,
      body.stepMeta
    );
    sendJson(res, 200, updated);
    return true;
  }

  // 47. Quiz Student View & Grading (T036)
  const studentQuizMatch = pathname.match(/^\/api\/steps\/([a-zA-Z0-9_-]+)\/quiz$/);
  if (method === 'GET' && studentQuizMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const stepId = studentQuizMatch[1];
    const enrollmentId = url.searchParams.get('enrollmentId');
    const quiz = quizService.getStudentQuiz(user.id, enrollmentId, stepId);
    sendJson(res, 200, quiz);
    return true;
  }

  const studentQuizSubmitMatch = pathname.match(/^\/api\/steps\/([a-zA-Z0-9_-]+)\/quiz\/submit$/);
  if (method === 'POST' && studentQuizSubmitMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const stepId = studentQuizSubmitMatch[1];
    const body = await parseJsonBody(req);
    const enrollmentId = body.enrollmentId || null;
    const isPreview = Boolean(body.isPreview);
    const wasCourseComplete = !isPreview && enrollmentId ? learningProgressService.getCourseProgress(user.id, enrollmentId).isCompleted : false;
    const priorProgress = !isPreview && enrollmentId ? db.prepare('SELECT is_completed FROM step_progress WHERE enrollment_id = ? AND step_id = ?').get(enrollmentId, stepId) as { is_completed: number } | undefined : undefined;
    const result = quizService.gradeQuiz(user.id, enrollmentId, stepId, body.selectedOptionIds || [], isPreview);
    if (!isPreview && enrollmentId) {
      recordProductEvent({ eventName: 'exercise.submitted', userId: user.id, enrollmentId, stepId, metadata: { verdict: result.verdict } });
      if (result.isPassed && !priorProgress?.is_completed) recordProductEvent({ eventName: 'step.completed', userId: user.id, enrollmentId, stepId });
      if (!wasCourseComplete && learningProgressService.getCourseProgress(user.id, enrollmentId).isCompleted) recordProductEvent({ eventName: 'course.completed', userId: user.id, enrollmentId });
    }
    sendJson(res, 200, result);
    return true;
  }

  // 48. Quiz Author View & Update (T036)
  const authorQuizMatch = pathname.match(/^\/api\/author\/steps\/([a-zA-Z0-9_-]+)\/quiz$/);
  if (method === 'GET' && authorQuizMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const stepId = authorQuizMatch[1];
    const quiz = quizService.getAuthorQuiz(user.id, stepId);
    sendJson(res, 200, quiz);
    return true;
  }
  if (method === 'PUT' && authorQuizMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const stepId = authorQuizMatch[1];
    const body = await parseJsonBody(req);
    const updated = quizService.updateQuiz(user.id, stepId, Number(body.expectedRevision), body.quiz || body);
    sendJson(res, 200, updated);
    return true;
  }

  // 49. Python Exercise Author View & Update (T037)
  const authorPythonMatch = pathname.match(/^\/api\/author\/steps\/([a-zA-Z0-9_-]+)\/python$/);
  if (method === 'GET' && authorPythonMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const stepId = authorPythonMatch[1];
    const ex = exerciseAuthoringService.getAuthorExercise(user.id, stepId);
    sendJson(res, 200, ex);
    return true;
  }
  if (method === 'PUT' && authorPythonMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const stepId = authorPythonMatch[1];
    const body = await parseJsonBody(req);
    const updated = exerciseAuthoringService.updateExercise(
      user.id,
      stepId,
      Number(body.expectedRevision),
      body.exercise || body
    );
    sendJson(res, 200, updated);
    return true;
  }

  return false;
}
