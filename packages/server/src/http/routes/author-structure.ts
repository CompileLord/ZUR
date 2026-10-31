import { AuthenticationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Author course tree: modules, lessons and steps.
export async function handleAuthorStructureRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, pathname, method, token, identityService, courseStructureService, parseJsonBody, sendJson } = rc;

  // 35. Author: Get Course Tree Structure (T031)
  const authorCourseStructureMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/structure$/);
  if (method === 'GET' && authorCourseStructureMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseStructureMatch[1];
    const tree = courseStructureService.getCourseTree(user.id, courseId);
    sendJson(res, 200, tree);
    return true;
  }

  // 36. Author: Add Module (T031)
  const authorCourseModulesMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/modules$/);
  if (method === 'POST' && authorCourseModulesMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseModulesMatch[1];
    const body = await parseJsonBody(req);
    const mod = courseStructureService.addModule(user.id, courseId, body.title, body.position);
    sendJson(res, 201, mod);
    return true;
  }

  // Author: Reorder Modules
  const authorCourseModulesReorderMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/modules\/reorder$/
  );
  if ((method === 'POST' || method === 'PUT') && authorCourseModulesReorderMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseModulesReorderMatch[1];
    const body = await parseJsonBody(req);
    const moduleIds = body.moduleIds || body.ids;
    const result = courseStructureService.reorderModules(user.id, courseId, moduleIds);
    sendJson(res, 200, result);
    return true;
  }

  // 37. Author: Update / Delete Module (T031)
  const authorCourseModuleItemMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/modules\/([a-zA-Z0-9_-]+)$/
  );
  if (method === 'PUT' && authorCourseModuleItemMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseModuleItemMatch[1];
    const moduleId = authorCourseModuleItemMatch[2];
    const body = await parseJsonBody(req);
    const mod = courseStructureService.updateModule(user.id, courseId, moduleId, body.title);
    sendJson(res, 200, mod);
    return true;
  }
  if (method === 'DELETE' && authorCourseModuleItemMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseModuleItemMatch[1];
    const moduleId = authorCourseModuleItemMatch[2];
    const result = courseStructureService.deleteModule(user.id, courseId, moduleId);
    sendJson(res, 200, result);
    return true;
  }

  // 38. Author: Add Lesson (T031)
  const authorCourseLessonsMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/modules\/([a-zA-Z0-9_-]+)\/lessons$/
  );
  if (method === 'POST' && authorCourseLessonsMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseLessonsMatch[1];
    const moduleId = authorCourseLessonsMatch[2];
    const body = await parseJsonBody(req);
    const lesson = courseStructureService.addLesson(
      user.id,
      courseId,
      moduleId,
      body.title,
      body.description,
      body.position
    );
    sendJson(res, 201, lesson);
    return true;
  }

  // Author: Reorder Lessons
  const authorCourseLessonsReorderMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/modules\/([a-zA-Z0-9_-]+)\/lessons\/reorder$/
  );
  if ((method === 'POST' || method === 'PUT') && authorCourseLessonsReorderMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseLessonsReorderMatch[1];
    const moduleId = authorCourseLessonsReorderMatch[2];
    const body = await parseJsonBody(req);
    const lessonIds = body.lessonIds || body.ids;
    const result = courseStructureService.reorderLessons(user.id, courseId, moduleId, lessonIds);
    sendJson(res, 200, result);
    return true;
  }

  // 39. Author: Update / Delete Lesson (T031)
  const authorCourseLessonItemMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/lessons\/([a-zA-Z0-9_-]+)$/
  );
  if (method === 'PUT' && authorCourseLessonItemMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseLessonItemMatch[1];
    const lessonId = authorCourseLessonItemMatch[2];
    const body = await parseJsonBody(req);
    const lesson = courseStructureService.updateLesson(user.id, courseId, lessonId, body.title, body.description);
    sendJson(res, 200, lesson);
    return true;
  }
  if (method === 'DELETE' && authorCourseLessonItemMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseLessonItemMatch[1];
    const lessonId = authorCourseLessonItemMatch[2];
    const result = courseStructureService.deleteLesson(user.id, courseId, lessonId);
    sendJson(res, 200, result);
    return true;
  }

  // 40. Author: Add Step (T031)
  const authorCourseStepsMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/lessons\/([a-zA-Z0-9_-]+)\/steps$/
  );
  if (method === 'POST' && authorCourseStepsMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseStepsMatch[1];
    const lessonId = authorCourseStepsMatch[2];
    const body = await parseJsonBody(req);
    const step = courseStructureService.addStep(user.id, courseId, lessonId, body);
    sendJson(res, 201, step);
    return true;
  }

  // Author: Reorder Steps
  const authorCourseStepsReorderMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/lessons\/([a-zA-Z0-9_-]+)\/steps\/reorder$/
  );
  if ((method === 'POST' || method === 'PUT') && authorCourseStepsReorderMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseStepsReorderMatch[1];
    const lessonId = authorCourseStepsReorderMatch[2];
    const body = await parseJsonBody(req);
    const stepIds = body.stepIds || body.ids;
    const result = courseStructureService.reorderSteps(user.id, courseId, lessonId, stepIds);
    sendJson(res, 200, result);
    return true;
  }

  // 41. Author: Update / Delete Step (T031)
  const authorCourseStepItemMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/steps\/([a-zA-Z0-9_-]+)$/
  );
  if (method === 'PUT' && authorCourseStepItemMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseStepItemMatch[1];
    const stepId = authorCourseStepItemMatch[2];
    const body = await parseJsonBody(req);
    const step = courseStructureService.updateStep(user.id, courseId, stepId, body);
    sendJson(res, 200, step);
    return true;
  }
  if (method === 'DELETE' && authorCourseStepItemMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseStepItemMatch[1];
    const stepId = authorCourseStepItemMatch[2];
    const result = courseStructureService.deleteStep(user.id, courseId, stepId);
    sendJson(res, 200, result);
    return true;
  }

  // 42. Author: Duplicate Step (T031)
  const authorCourseStepDupMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/steps\/([a-zA-Z0-9_-]+)\/duplicate$/
  );
  if (method === 'POST' && authorCourseStepDupMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseStepDupMatch[1];
    const stepId = authorCourseStepDupMatch[2];
    const duplicated = courseStructureService.duplicateStep(user.id, courseId, stepId);
    sendJson(res, 201, duplicated);
    return true;
  }

  return false;
}
