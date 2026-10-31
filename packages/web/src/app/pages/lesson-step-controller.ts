import { type LearningWorkspaceShellOptions, renderLearningWorkspaceShell } from '../../components/shells/index.ts';
import { renderLessonRail } from '../../components/common/index.ts';
import { renderSafeDenialPage } from '../../pages/status/SafeDenialPage.ts';
import { renderTheoryWorkspaceContent } from '../../pages/learning/TheoryStepPage.ts';
import { renderVideoWorkspaceContent } from '../../pages/learning/VideoStepPage.ts';
import {
  recordLastVisitedStep,
  parseLearningNavigation,
  getCurriculumSidebarCollapsed,
  updateMountedLearningWorkspace,
} from '../../pages/learning/learning-navigation.ts';
import { lessonMediaObjectUrls } from '../lesson-media.ts';
import { navigateTo } from '../navigation.ts';
import { attachLearningShellListeners } from './learning-shell-listeners.ts';
import { showRouteLoading, showRouteFailure } from '../route-loading.ts';
import { appEl, app, authClient } from '../state.ts';
import { initTheme } from '../theme.ts';

export async function loadLessonStep(enrollmentId: string, stepId: string, kind: 'theory' | 'video', requestedPath: string): Promise<void> {
  const isCurrent = () => window.location.pathname + window.location.search === requestedPath;
  const isShellMounted = Boolean(appEl.querySelector('.shell-learning') && document.getElementById('course-sidebar') && appEl.querySelector('.learning-workspace-main'));
  if (!isShellMounted) {
    showRouteLoading(kind === 'video' ? 'Video lesson' : 'Theory lesson');
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
      viewport.innerHTML = `<div class="flex items-center justify-center p-8" aria-live="polite"><span class="job-status-spinner"></span><span class="ml-2 text-secondary text-sm">Loading ${kind} lesson…</span></div>`;
    }
  }
  try {
    const data = await authClient.fetchApi(`/api/enrollments/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}`);
    if (!isCurrent()) return;
    if (data.step?.type !== kind) {
      appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
      return;
    }
    const progressSteps = data.progress?.steps || [];
    const user = authClient.getUser() || { id: 'user-guest', displayName: 'Guest' };
    const courseVersionId = data.courseVersionId || data.progress?.pinnedVersionId || data.progress?.courseVersionId || '';
    const currentLessonId = data.step?.lessonId || data.stepMeta?.lessonId || progressSteps.find((s: any) => s.id === stepId)?.lessonId || '';
    if (user?.id && currentLessonId && courseVersionId) {
      recordLastVisitedStep(user.id, enrollmentId, courseVersionId, currentLessonId, stepId);
    }
    const nav = parseLearningNavigation(data.progress, enrollmentId, stepId, user?.id, courseVersionId);
    const outlineContent = renderLessonRail({
      steps: progressSteps.map((step: any, index: number) => ({
        id: step.id, ordinal: index + 1, title: step.title, type: step.type,
        isCurrent: step.id === stepId, isCompleted: Boolean(step.isCompleted),
        isWaived: Boolean(step.isWaived), isRequired: Boolean(step.isRequired),
        href: `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(step.id)}`,
      })),
    });
    const common = {
      courseId: data.courseId || data.progress?.courseId,
      courseTitle: data.courseTitle || 'Course',
      courseOverviewUrl: `/learn/${encodeURIComponent(enrollmentId)}`,
      lessonTitle: data.stepMeta?.lessonTitle || progressSteps.find((s: any) => s.id === stepId)?.lessonTitle || 'Lesson',
      stepTitle: data.step.title,
      stepOrdinalText: progressSteps.length > 0 && progressSteps.findIndex((s: any) => s.id === stepId) >= 0
        ? `Step ${progressSteps.findIndex((s: any) => s.id === stepId) + 1} of ${data.progress?.totalSteps || progressSteps.length}`
        : `Step ${Number(data.step.position) + 1}`,
      isRequired: Boolean(data.step.isRequired),
      estimatedDurationMinutes: Number(data.step.estimatedDurationMinutes || 1),
      enrollmentId, stepId,
      courseProgressText: nav.courseProgressText,
      courseProgressPercentage: nav.courseProgressPercentage,
      modules: nav.modules,
      taskSquares: nav.taskSquares,
      isCompleted: Boolean(data.stepMeta?.isCompleted),
      outlineContent,
      previousStepUrl: data.previousStepId ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(data.previousStepId)}` : null,
      nextStepUrl: data.nextStepId ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(data.nextStepId)}` : null,
    };
    const content = data.step.content || {};
    document.title = `${common.stepTitle} · ${common.courseTitle} · ZUR`;
    const stepContent = kind === 'theory'
      ? renderTheoryWorkspaceContent({ ...common, markdownContent: String(content.markdown || content.markdownContent || content.body || content.content || '') })
      : renderVideoWorkspaceContent({ ...common, videoUrl: String(content.videoUrl || ''), transcript: content.transcript, captionVerified: Boolean(content.captionVerified) });

    const shellOptions: LearningWorkspaceShellOptions = {
      courseTitle: common.courseTitle,
      courseOverviewUrl: common.courseOverviewUrl,
      lessonTitle: common.lessonTitle,
      stepTitle: common.stepTitle,
      stepOrdinalText: common.stepOrdinalText,
      courseProgressText: nav.courseProgressText,
      courseProgressPercentage: nav.courseProgressPercentage,
      modules: nav.modules,
      taskSquares: nav.taskSquares,
      isSidebarCollapsed: user?.id ? getCurriculumSidebarCollapsed(user.id, enrollmentId, courseVersionId) : false,
      isPythonWorkspace: false,
      outlineDrawer: true,
      outlineContent,
      workspaceContent: stepContent.workspaceContent,
      previousStepUrl: common.previousStepUrl,
      nextStepUrl: common.nextStepUrl,
      taskActions: stepContent.taskActions,
      reportContext: {
        stepId,
        enrollmentId,
        courseId: common.courseId,
        courseVersionId,
        courseTitle: common.courseTitle,
        lessonTitle: common.lessonTitle,
        stepTitle: common.stepTitle,
      },
    };

    if (isShellMounted && updateMountedLearningWorkspace(shellOptions)) {
      // Retained shell, in-place update!
    } else {
      appEl.innerHTML = renderLearningWorkspaceShell(shellOptions);
      initTheme();
      attachLearningShellListeners();
    }
    const videoFrame = appEl.querySelector<HTMLIFrameElement>('.video-embed-iframe');
    const videoFailure = appEl.querySelector<HTMLElement>('[data-video-fallback]');
    let videoLoadTimer: number | undefined;
    if (videoFrame && videoFailure) {
      const provider = videoFrame.dataset.provider;
      const frameUrl = new URL(videoFrame.src);
      const frameOrigin = frameUrl.origin;
      if (provider === 'youtube' || provider === 'vimeo') frameUrl.searchParams.set('origin', window.location.origin);
      videoFrame.dataset.retrySrc = frameUrl.toString();
      const showVideoFailure = () => {
        if (videoLoadTimer) window.clearTimeout(videoLoadTimer);
        app.lessonVideoLoadTimer = undefined;
        videoFailure.hidden = false;
      };
      const clearVideoLoadTimer = () => {
        if (videoLoadTimer) window.clearTimeout(videoLoadTimer);
        app.lessonVideoLoadTimer = undefined;
      };
      const startVideoLoadTimer = () => {
        if (videoLoadTimer) window.clearTimeout(videoLoadTimer);
        videoLoadTimer = window.setTimeout(showVideoFailure, 10000);
        app.lessonVideoLoadTimer = videoLoadTimer;
      };
      videoFrame.addEventListener('error', showVideoFailure);
      videoFrame.addEventListener('load', () => {
        if (provider === 'youtube') {
          videoFrame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onReady'] }), frameOrigin);
        } else if (provider === 'vimeo') {
          videoFrame.contentWindow?.postMessage(JSON.stringify({ method: 'addEventListener', value: 'ready', player_id: 'zur-lesson-video' }), frameOrigin);
        } else {
          clearVideoLoadTimer();
        }
      });
      if (provider === 'youtube' || provider === 'vimeo') {
        const onPlayerMessage = (event: MessageEvent) => {
          if (event.source !== videoFrame.contentWindow || event.origin !== frameOrigin || !isCurrent()) return;
          let payload = event.data;
          if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch { return; }
          }
          const ready = provider === 'youtube' ? payload?.event === 'onReady' : payload?.event === 'ready';
          if (ready) {
            clearVideoLoadTimer();
            videoFailure.hidden = true;
          }
        };
        window.addEventListener('message', onPlayerMessage);
        app.lessonVideoReadyCleanup = () => window.removeEventListener('message', onPlayerMessage);
      }
      startVideoLoadTimer();
      if (provider === 'youtube' || provider === 'vimeo') videoFrame.src = frameUrl.toString();
      appEl.querySelector('[data-video-retry]')?.addEventListener('click', () => {
        videoFailure.hidden = true;
        const separator = videoFrame.dataset.retrySrc?.includes('?') ? '&' : '?';
        videoFrame.src = `${videoFrame.dataset.retrySrc || videoFrame.src}${separator}zur_retry=${Date.now()}`;
        startVideoLoadTimer();
      });
    }
    appEl.querySelectorAll<HTMLFormElement>('.complete-step-form').forEach((form) => form.addEventListener('submit', (event) => {
      event.preventDefault();
      const button = form.querySelector<HTMLButtonElement>('button');
      if (!button) return;
      button.disabled = true;
      void authClient.fetchApi(`/api/enrollments/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}/complete`, { method: 'POST', body: '{}' })
        .then(() => { if (!isCurrent()) return;
          const destination = common.nextStepUrl || common.courseOverviewUrl;
          if (destination.startsWith('/') && !destination.startsWith('//')) navigateTo(destination);
          else window.location.assign(destination); })
        .catch(() => { if (!isCurrent()) return; button.disabled = false; const alert = document.createElement('p'); alert.setAttribute('role','alert'); alert.className='text-danger'; alert.textContent='Could not save completion. Check your connection and try again.'; form.prepend(alert); });
    }));
    if (kind === 'theory') {
      void import('../../pages/learning/codemirror-editor.ts').then(({ highlightStaticPython }) => { if (isCurrent()) highlightStaticPython(appEl); }).catch(() => {});
      // Canonical media references are never loaded directly by the browser. Fetch with
      // the authenticated session, then replace with an object URL only after authorization.
      const mediaImages = [...appEl.querySelectorAll<HTMLImageElement>('img[src^="about:blank#zur-asset-"]')];
      for (const image of mediaImages) {
        const assetId = image.dataset.authorizedAsset || '';
        if (!/^[0-9a-f-]{36}$/i.test(assetId)) { if (isCurrent()) image.remove(); continue; }
        try {
          const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, { cache: 'no-store' });
          if (!response.ok) throw new Error('media unavailable');
          if (!isCurrent()) continue;
          const blob = await response.blob();
          if (!isCurrent()) continue;
          if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) throw new Error('unsupported media');
          const objectUrl = URL.createObjectURL(blob);
          lessonMediaObjectUrls.add(objectUrl);
          image.src = objectUrl;
          image.addEventListener('error', () => {
            URL.revokeObjectURL(objectUrl);
            lessonMediaObjectUrls.delete(objectUrl);
            image.replaceWith(document.createTextNode('Image unavailable. Retry loading the lesson to try again.'));
          }, { once: true });
        } catch {
          if (!isCurrent()) continue;
          const fallback = document.createElement('span');
          fallback.className = 'lesson-media-fallback';
          fallback.setAttribute('role', 'status');
          fallback.textContent = image.alt ? `Image unavailable: ${image.alt}. Retry loading the lesson to try again.` : 'Image unavailable. Retry loading the lesson to try again.';
          image.replaceWith(fallback);
        }
      }
    }
    appEl.querySelectorAll<HTMLAnchorElement>('.lesson-rail a').forEach((link) => link.addEventListener('click', (event) => {
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault(); navigateTo(link.getAttribute('href') || link.href);
      }
    }));
  } catch (error: any) {
    if (!isCurrent()) return;
    if (error.statusCode === 404 || error.statusCode === 403) appEl.innerHTML = renderSafeDenialPage({ type: 'not-found', user: authClient.getUser() });
    else showRouteFailure('We could not load this lesson. Retry when the service is available.', requestedPath);
  }
}
