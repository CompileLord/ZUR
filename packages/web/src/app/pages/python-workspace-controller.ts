import { type LearningWorkspaceShellOptions, renderLearningWorkspaceShell } from '../../components/shells/index.ts';
import { renderLessonRail } from '../../components/common/index.ts';
import { renderSafeDenialPage } from '../../pages/status/SafeDenialPage.ts';
import { type PythonWorkspacePageOptions, renderPythonWorkspaceContent } from '../../pages/learning/PythonWorkspacePage.ts';
import { DraftManager } from '../../services/draft-manager.ts';
import {
  recordLastVisitedStep,
  parseLearningNavigation,
  getCurriculumSidebarCollapsed,
  updateMountedLearningWorkspace,
} from '../../pages/learning/learning-navigation.ts';
import { attachLearningShellListeners } from './learning-shell-listeners.ts';
import { attachPythonWorkspaceListeners, savePythonDraft } from './python-workspace-wiring.ts';
import { showRouteLoading, showRouteFailure } from '../route-loading.ts';
import { appEl, app, authClient } from '../state.ts';
import { initTheme } from '../theme.ts';

export async function loadPythonWorkspace(enrollmentId: string, stepId: string, requestedPath: string): Promise<void> {
  const isCurrent = () => window.location.pathname + window.location.search === requestedPath;
  const isShellMounted = Boolean(appEl.querySelector('.shell-learning') && document.getElementById('course-sidebar') && appEl.querySelector('.learning-workspace-main'));
  if (!isShellMounted) {
    showRouteLoading('Python workspace');
  } else {
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
      viewport.innerHTML = `<div class="flex items-center justify-center p-8" aria-live="polite"><span class="job-status-spinner"></span><span class="ml-2 text-secondary text-sm">Loading workspace…</span></div>`;
    }
  }
  try {
    const [stepData, contentData, accountData] = await Promise.all([
      authClient.fetchApi(`/api/enrollments/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}`),
      authClient.fetchApi(`/api/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}/content`),
      authClient.fetchApi('/api/auth/me'),
    ]);
    if (!isCurrent()) return;
    const content = contentData.content;
    if (stepData.step?.type !== 'python' || content?.kind !== 'python') {
      appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
      return;
    }
    const draft = await authClient.fetchApi(`/api/drafts?enrollmentId=${encodeURIComponent(enrollmentId)}&stepId=${encodeURIComponent(stepId)}`);
    if (!isCurrent()) return;
    const user = authClient.getUser();
    if (!user) { appEl.innerHTML = renderSafeDenialPage({ type: 'access-denied' }); return; }
    const localDraft = DraftManager.loadLocalDraft(user.id, enrollmentId, stepId);
    const hasRecoveredLocal = Boolean(localDraft && localDraft.code !== draft.code && localDraft.revision === draft.revision);
    const hasRevisionConflict = Boolean(localDraft && localDraft.code !== draft.code && localDraft.revision !== draft.revision);
    const initialCode = hasRecoveredLocal || hasRevisionConflict ? localDraft!.code : draft.code;
    const courseVersionId = stepData.courseVersionId || stepData.progress?.pinnedVersionId || stepData.progress?.courseVersionId || '';
    const currentLessonId = stepData.step?.lessonId || stepData.stepMeta?.lessonId || (stepData.progress?.steps || []).find((s: any) => s.id === stepId)?.lessonId || '';
    if (user.id && currentLessonId && courseVersionId) {
      recordLastVisitedStep(user.id, enrollmentId, courseVersionId, currentLessonId, stepId);
    }
    const nav = parseLearningNavigation(stepData.progress, enrollmentId, stepId, user.id, courseVersionId);
    const pageOptions: PythonWorkspacePageOptions = {
      modules: nav.modules,
      taskSquares: nav.taskSquares,
      courseProgressText: nav.courseProgressText,
      courseProgressPercentage: nav.courseProgressPercentage,
      outlineContent: renderLessonRail({ steps: (stepData.progress?.steps || []).map((step: any, index: number) => ({
        id: step.id, ordinal: index + 1, title: step.title, type: step.type,
        isCurrent: step.id === stepId, isCompleted: Boolean(step.isCompleted), isWaived: Boolean(step.isWaived), isRequired: Boolean(step.isRequired),
        href: `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(step.id)}`,
      })) }),
      courseTitle: stepData.courseTitle,
      courseOverviewUrl: `/learn/${encodeURIComponent(enrollmentId)}`,
      lessonTitle: stepData.stepMeta?.lessonTitle || 'Lesson',
      stepTitle: stepData.step.title,
      stepOrdinalText: (stepData.progress?.steps?.length || 0) > 0 && (stepData.progress?.steps || []).findIndex((s: any) => s.id === stepId) >= 0
        ? `Step ${(stepData.progress.steps || []).findIndex((s: any) => s.id === stepId) + 1} of ${stepData.progress.totalSteps || stepData.progress.steps.length}`
        : `Step ${Number(stepData.step.position) + 1}`,
      courseId: stepData.courseId || stepData.progress?.courseId,
      courseVersionId: stepData.courseVersionId || stepData.progress?.pinnedVersionId,
      enrollmentId,
      stepId,
      problemStatement: content.problemStatement,
      inputFormat: content.inputFormat,
      outputFormat: content.outputFormat,
      constraints: content.constraints,
      starterCode: content.starterCode,
      currentCode: initialCode,
      editorFontSize: accountData.preferences?.editorFontSize,
      indentationSpaces: accountData.preferences?.indentationSpaces,
      isCompact: window.innerWidth < 1024,
      hints: content.hints || [],
      solutionExplanation: content.solutionExplanation,
      isCompleted: Boolean(stepData.stepMeta?.isCompleted),
      currentResult: null,
      saveStatus: hasRevisionConflict ? 'conflict' : hasRecoveredLocal ? 'unsaved' : 'saved',
      previousStepUrl: stepData.previousStepId ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepData.previousStepId)}` : null,
      nextStepUrl: stepData.nextStepId ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepData.nextStepId)}` : `/learn/${encodeURIComponent(enrollmentId)}`,
      isLastStep: !stepData.nextStepId,
    };
    if (hasRevisionConflict) {
      pageOptions.saveNotice = 'A newer server draft exists. Your local copy is preserved on this device; reload the saved version before editing further.';
    } else if (hasRecoveredLocal) {
      pageOptions.saveNotice = 'Recovered unsynchronized code from this device. Syncing it now.';
    }
    const render = (overrides: Partial<PythonWorkspacePageOptions> = {}) => {
      const merged = { ...pageOptions, ...overrides };
      document.title = `${merged.stepTitle} · ${merged.courseTitle} · ZUR`;
      const stepContent = renderPythonWorkspaceContent(merged);
      const shellOptions: LearningWorkspaceShellOptions = {
        courseTitle: merged.courseTitle,
        courseOverviewUrl: merged.courseOverviewUrl,
        lessonTitle: merged.lessonTitle,
        stepTitle: merged.stepTitle,
        stepOrdinalText: merged.stepOrdinalText,
        courseProgressText: merged.courseProgressText,
        courseProgressPercentage: merged.courseProgressPercentage,
        modules: merged.modules,
        taskSquares: merged.taskSquares,
        isSidebarCollapsed: user ? getCurriculumSidebarCollapsed(user.id, enrollmentId, courseVersionId) : false,
        isPythonWorkspace: true,
        outlineDrawer: true,
        saveStatusText: stepContent.saveLabel,
        outlineContent: merged.outlineContent,
        workspaceContent: stepContent.workspaceContent,
        previousStepUrl: merged.previousStepUrl,
        nextStepUrl: null,
        taskActions: stepContent.taskActions,
        reportContext: {
          courseId: merged.courseId,
          courseVersionId: merged.courseVersionId,
          enrollmentId: merged.enrollmentId,
          stepId: merged.stepId,
          courseTitle: merged.courseTitle,
          lessonTitle: merged.lessonTitle,
          stepTitle: merged.stepTitle,
        },
      };

      if (isShellMounted && updateMountedLearningWorkspace(shellOptions)) {
        // Retained shell, in-place viewport update!
      } else {
        appEl.innerHTML = renderLearningWorkspaceShell(shellOptions);
        initTheme();
        attachLearningShellListeners();
      }
    };
    render();
    attachPythonWorkspaceListeners(pageOptions, draft.revision, user.id, hasRevisionConflict, requestedPath);
    if (hasRecoveredLocal) {
      void savePythonDraft(pageOptions.currentCode || '', draft.revision, enrollmentId, stepId).then((saved) => {
        if (!isCurrent()) return;
        pageOptions.currentCode = saved.code;
        DraftManager.saveLocalDraft(user.id, enrollmentId, stepId, saved.code, saved.revision);
        const indicator = document.getElementById('python-save-indicator');
        if (indicator) { indicator.className = 'save-indicator saved'; indicator.textContent = 'Saved'; }
        const notice = document.getElementById('python-save-notice'); notice?.remove();
      }).catch(() => {
        const indicator = document.getElementById('python-save-indicator');
        if (indicator) { indicator.className = 'save-indicator unsaved'; indicator.textContent = 'Unsaved edits (offline)'; }
      });
    }
  } catch (error: any) {
    if (!isCurrent()) return;
    if (error.statusCode === 404 || error.statusCode === 403) appEl.innerHTML = renderSafeDenialPage({ type: 'not-found', user: authClient.getUser() });
    else showRouteFailure('We could not load the enrolled exercise. Retry when the service is available.', requestedPath);
  }
}
