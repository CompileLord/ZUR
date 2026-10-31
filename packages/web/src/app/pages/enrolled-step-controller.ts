import { type LearningWorkspaceShellOptions, renderLearningWorkspaceShell } from '../../components/shells/index.ts';
import { renderLessonRail } from '../../components/common/index.ts';
import { renderSafeDenialPage } from '../../pages/status/SafeDenialPage.ts';
import { type QuizStepPageOptions, passedQuizFeedback, renderQuizWorkspaceContent } from '../../pages/learning/QuizStepPage.ts';
import {
  recordLastVisitedStep,
  parseLearningNavigation,
  getCurriculumSidebarCollapsed,
  updateMountedLearningWorkspace,
} from '../../pages/learning/learning-navigation.ts';
import { attachLearningShellListeners } from './learning-shell-listeners.ts';
import { loadLessonStep } from './lesson-step-controller.ts';
import { loadPythonWorkspace } from './python-workspace-controller.ts';
import { showRouteLoading, showRouteFailure } from '../route-loading.ts';
import { appEl, app, authClient } from '../state.ts';
import { initTheme } from '../theme.ts';

export async function loadEnrolledStep(enrollmentId: string, stepId: string, requestedPath: string): Promise<void> {
  const isShellMounted = Boolean(appEl.querySelector('.shell-learning') && document.getElementById('course-sidebar') && appEl.querySelector('.learning-workspace-main'));
  if (!isShellMounted) {
    showRouteLoading('Learning step');
  } else {
    // Teardown previous editor cleanly to avoid memory leaks or stale listeners
    (window as any).__zur_active_cm_editor?.destroy?.();
    (window as any).__zur_active_cm_editor = null;
    app.workspaceResizeController?.abort();
    app.workspaceResizeController = null;
    if (app.lessonVideoLoadTimer) {
      window.clearTimeout(app.lessonVideoLoadTimer);
      app.lessonVideoLoadTimer = undefined;
    }

    const viewport = appEl.querySelector('.workspace-viewport');
    if (viewport) {
      viewport.setAttribute('aria-busy', 'true');
      viewport.innerHTML = `<div class="flex items-center justify-center p-8" aria-live="polite"><span class="job-status-spinner"></span><span class="ml-2 text-secondary text-sm">Loading step…</span></div>`;
    }
    const targetSquare = appEl.querySelector(`.learning-task-strip .task-square[href*="${encodeURIComponent(stepId)}"]`);
    if (targetSquare) {
      appEl.querySelectorAll('.learning-task-strip .task-square').forEach((sq) => {
        sq.classList.remove('selected', 'current');
        sq.removeAttribute('aria-current');
        sq.setAttribute('aria-selected', 'false');
      });
      targetSquare.classList.add('selected', 'current');
      targetSquare.setAttribute('aria-current', 'step');
      targetSquare.setAttribute('aria-selected', 'true');
    }
  }
  try {
    const data = await authClient.fetchApi(`/api/enrollments/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}`);
    if (window.location.pathname + window.location.search !== requestedPath) return;
    if (data.step?.type === 'theory' || data.step?.type === 'video') {
      void loadLessonStep(enrollmentId, stepId, data.step.type, requestedPath);
    } else if (data.step?.type === 'python') {
      void loadPythonWorkspace(enrollmentId, stepId, requestedPath);
    } else if (data.step?.type === 'quiz') {
      renderEnrolledQuiz(data, enrollmentId, stepId, requestedPath);
    } else {
      appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
    }
  } catch (error: any) {
    if (window.location.pathname + window.location.search !== requestedPath) return;
    if (error.statusCode === 404 || error.statusCode === 403) appEl.innerHTML = renderSafeDenialPage({ type: 'not-found', user: authClient.getUser() });
    else showRouteFailure('We could not load this lesson. Retry when the service is available.', requestedPath);
  }
}

function renderEnrolledQuiz(data: any, enrollmentId: string, stepId: string, requestedPath: string, selectedOptionIds: string[] = [], feedback: any = null): void {
  const isShellMounted = Boolean(appEl.querySelector('.shell-learning') && document.getElementById('course-sidebar') && appEl.querySelector('.learning-workspace-main'));
  const progressSteps = data.progress?.steps || [];
  const content = data.step.content || {};
  if (!feedback) {
    feedback = passedQuizFeedback(content, Boolean(data.stepMeta?.isCompleted));
    if (feedback) selectedOptionIds = feedback.correctOptionIds || [];
  }
  const user = authClient.getUser() || { id: 'user-guest', displayName: 'Guest' };
  const courseVersionId = data.courseVersionId || data.progress?.pinnedVersionId || data.progress?.courseVersionId || '';
  const currentLessonId = data.step?.lessonId || data.stepMeta?.lessonId || progressSteps.find((s: any) => s.id === stepId)?.lessonId || '';
  if (user?.id && currentLessonId && courseVersionId) {
    recordLastVisitedStep(user.id, enrollmentId, courseVersionId, currentLessonId, stepId);
  }
  const nav = parseLearningNavigation(data.progress, enrollmentId, stepId, user?.id, courseVersionId);
  const quizPageOptions: QuizStepPageOptions = {
    courseTitle: data.courseTitle || 'Course',
    courseOverviewUrl: `/learn/${encodeURIComponent(enrollmentId)}`,
    lessonTitle: data.stepMeta?.lessonTitle || 'Lesson',
    stepTitle: data.step.title,
    stepOrdinalText: progressSteps.length > 0 && progressSteps.findIndex((s: any) => s.id === stepId) >= 0
      ? `Step ${progressSteps.findIndex((s: any) => s.id === stepId) + 1} of ${data.progress?.totalSteps || progressSteps.length}`
      : `Step ${Number(data.step.position) + 1}`,
    isRequired: Boolean(data.step.isRequired),
    estimatedDurationMinutes: Number(data.step.estimatedDurationMinutes || 1),
    quizType: content.quizType,
    prompt: content.prompt || '',
    options: (content.options || []).map((option: any) => ({ id: option.id, text: option.text })),
    enrollmentId, stepId,
    courseProgressText: nav.courseProgressText,
    courseProgressPercentage: nav.courseProgressPercentage,
    modules: nav.modules,
    taskSquares: nav.taskSquares,
    isCompleted: Boolean(data.stepMeta?.isCompleted) || Boolean(feedback?.isPassed),
    selectedOptionIds, feedback,
    outlineContent: renderLessonRail({ steps: progressSteps.map((step: any, index: number) => ({
      id: step.id, ordinal: index + 1, title: step.title, type: step.type,
      isCurrent: step.id === stepId, isCompleted: Boolean(step.isCompleted), isWaived: Boolean(step.isWaived), isRequired: Boolean(step.isRequired),
      href: `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(step.id)}`,
    })) }),
    previousStepUrl: data.previousStepId ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(data.previousStepId)}` : null,
    nextStepUrl: data.nextStepId ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(data.nextStepId)}` : null,
  };
  const stepContent = renderQuizWorkspaceContent(quizPageOptions);
  const shellOptions: LearningWorkspaceShellOptions = {
    courseTitle: quizPageOptions.courseTitle,
    courseOverviewUrl: quizPageOptions.courseOverviewUrl,
    lessonTitle: quizPageOptions.lessonTitle,
    stepTitle: quizPageOptions.stepTitle,
    stepOrdinalText: quizPageOptions.stepOrdinalText,
    courseProgressText: nav.courseProgressText,
    courseProgressPercentage: nav.courseProgressPercentage,
    modules: nav.modules,
    taskSquares: nav.taskSquares,
    isSidebarCollapsed: user?.id ? getCurriculumSidebarCollapsed(user.id, enrollmentId, courseVersionId) : false,
    isPythonWorkspace: false,
    outlineDrawer: true,
    outlineContent: quizPageOptions.outlineContent,
    workspaceContent: stepContent.workspaceContent,
    previousStepUrl: quizPageOptions.previousStepUrl,
    nextStepUrl: quizPageOptions.isCompleted ? quizPageOptions.nextStepUrl : null,
    taskActions: stepContent.taskActions,
    reportContext: {
      enrollmentId,
      stepId,
      courseTitle: quizPageOptions.courseTitle,
      lessonTitle: quizPageOptions.lessonTitle,
      stepTitle: quizPageOptions.stepTitle,
    },
  };
  document.title = `${data.step?.title || 'Quiz'} · ${data.courseTitle || 'Course'} · ZUR`;
  if (isShellMounted && updateMountedLearningWorkspace(shellOptions)) {
    // Retained shell, updated in-place!
  } else {
    appEl.innerHTML = renderLearningWorkspaceShell(shellOptions);
    initTheme();
    attachLearningShellListeners();
  }
  const form = appEl.querySelector<HTMLFormElement>('.quiz-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const selected = [...form.querySelectorAll<HTMLInputElement>('input[name="selectedOptionIds"]:checked')].map((input) => input.value);
    if (!selected.length) return;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    void authClient.fetchApi(`/api/steps/${encodeURIComponent(stepId)}/quiz/submit`, { method: 'POST', body: JSON.stringify({ enrollmentId, selectedOptionIds: selected }) })
      .then(async (result) => {
        const progress = await authClient.fetchApi(`/api/enrollments/${encodeURIComponent(enrollmentId)}/progress`).catch(() => data.progress);
        if (window.location.pathname + window.location.search === requestedPath && form.isConnected) renderEnrolledQuiz({ ...data, progress }, enrollmentId, stepId, requestedPath, selected, result);
      })
      .catch(() => { if (button) button.disabled = false; const message = document.createElement('p'); message.setAttribute('role', 'alert'); message.textContent = 'Could not check your answer. Your selection is still here. Try again.'; form.prepend(message); });
  });
}
