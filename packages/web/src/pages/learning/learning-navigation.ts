import { escapeHtml } from '../../components/escape-html.ts';
import {
  renderTaskStripHtml,
  renderTaskSquareInnerHtml,
  type LearningWorkspaceShellOptions,
} from '../../components/shells/LearningWorkspaceShell.ts';

export function getScopedLastVisitedStepKey(
  userId: string,
  enrollmentId: string,
  courseVersionId: string,
  lessonId: string
): string {
  return `zur_last_visited_step:${userId}:${enrollmentId}:${courseVersionId}:${lessonId}`;
}

export function recordLastVisitedStep(
  userId: string,
  enrollmentId: string,
  courseVersionId: string,
  lessonId: string,
  stepId: string,
  storage?: { setItem: (k: string, v: string) => void }
): void {
  if (!userId || !enrollmentId || !courseVersionId || !lessonId || !stepId) return;
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    s?.setItem(getScopedLastVisitedStepKey(userId, enrollmentId, courseVersionId, lessonId), stepId);
  } catch {}
}

export function getLastVisitedStep(
  userId: string,
  enrollmentId: string,
  courseVersionId: string,
  lessonId: string,
  storage?: { getItem: (k: string) => string | null }
): string | null {
  if (!userId || !enrollmentId || !courseVersionId || !lessonId) return null;
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    return s?.getItem(getScopedLastVisitedStepKey(userId, enrollmentId, courseVersionId, lessonId)) || null;
  } catch {
    return null;
  }
}

export function parseLearningNavigation(
  progress: any,
  enrollmentId: string,
  currentStepId: string,
  userId?: string,
  courseVersionId?: string,
  storage?: { getItem: (k: string) => string | null }
) {
  const steps: any[] = progress?.steps || [];
  const moduleMap = new Map<string, { id: string; title: string; lessons: Map<string, { id: string; title: string; steps: any[] }> }>();

  for (const step of steps) {
    const modId = step.moduleId || 'mod-1';
    const modTitle = String(step.moduleTitle || 'Module').replace(/^Module\s+\d+\s*:\s*/i, '');
    let mod = moduleMap.get(modId);
    if (!mod) {
      mod = { id: modId, title: modTitle, lessons: new Map() };
      moduleMap.set(modId, mod);
    }

    const lesId = step.lessonId || 'les-1';
    const lesTitle = String(step.lessonTitle || 'Lesson').replace(/^Lesson\s+\d+\s*:\s*/i, '');
    let les = mod.lessons.get(lesId);
    if (!les) {
      les = { id: lesId, title: lesTitle, steps: [] };
      mod.lessons.set(lesId, les);
    }
    les.steps.push(step);
  }

  const modules: any[] = [];
  let currentLessonSteps: any[] = [];

  for (const mod of moduleMap.values()) {
    const lessons: any[] = [];
    for (const les of mod.lessons.values()) {
      const isCurrent = les.steps.some((s: any) => s.id === currentStepId);
      if (isCurrent) currentLessonSteps = les.steps;

      const completedCount = les.steps.filter((s: any) => s.isCompleted || s.isWaived).length;
      const totalCount = les.steps.length;

      // Policy: sidebar lesson targets:
      // 1) lastVisitedStep (if valid and in this lesson)
      // 2) firstIncompleteStep (not completed and not waived)
      // 3) first step in lesson
      let targetStep: any = null;
      if (userId && courseVersionId) {
        const lastVisitedStepId = getLastVisitedStep(userId, enrollmentId, courseVersionId, les.id, storage);
        if (lastVisitedStepId) {
          targetStep = les.steps.find((s: any) => s.id === lastVisitedStepId);
        }
      }
      if (!targetStep) {
        targetStep = les.steps.find((s: any) => !s.isCompleted && !s.isWaived);
      }
      if (!targetStep) {
        targetStep = les.steps[0];
      }

      const href = targetStep
        ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(targetStep.id)}`
        : `/learn/${encodeURIComponent(enrollmentId)}`;

      lessons.push({
        id: les.id,
        title: les.title,
        completedCount,
        totalCount,
        isCurrent,
        href,
      });
    }
    modules.push({
      id: mod.id,
      title: mod.title,
      lessons,
    });
  }

  const taskSquares = (currentLessonSteps.length > 0 ? currentLessonSteps : steps).map((s: any, idx: number) => ({
    id: s.id,
    ordinal: idx + 1,
    title: s.title,
    type: s.type,
    isCurrent: s.id === currentStepId,
    isCompleted: Boolean(s.isCompleted),
    isWaived: Boolean(s.isWaived),
    isRequired: Boolean(s.isRequired),
    href: `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(s.id)}`,
  }));

  const totalCourseSteps = progress?.totalSteps || steps.length;
  const completedCourseSteps = progress?.completedSteps || steps.filter((s: any) => s.isCompleted || s.isWaived).length;
  const courseProgressText = `${completedCourseSteps} of ${totalCourseSteps} completed`;
  const courseProgressPercentage = totalCourseSteps > 0 ? Math.round((completedCourseSteps / totalCourseSteps) * 100) : 0;

  return {
    modules,
    taskSquares,
    courseProgressText,
    courseProgressPercentage,
  };
}

export function updateMountedLearningWorkspace(opts: LearningWorkspaceShellOptions, appContainer?: any): boolean {
  const root = appContainer || (typeof document !== 'undefined' ? document.getElementById('app') : null);
  if (!root) return false;
  const shellEl = root.querySelector?.('.shell-learning');
  const sidebarEl = root.querySelector?.('#course-sidebar') || (typeof document !== 'undefined' ? document.getElementById('course-sidebar') : null);
  const mainEl = root.querySelector?.('.learning-workspace-main');
  if (!shellEl || !sidebarEl || !mainEl) return false;

  // 1. Toggle paired-workspace vs reading-workspace
  const isPython = Boolean(opts.isPythonWorkspace);
  shellEl.classList.toggle('paired-workspace', isPython);
  shellEl.classList.toggle('reading-workspace', !isPython);

  // 2. Update Header
  const backLink = shellEl.querySelector?.('.learning-header-left .back-link');
  if (backLink) {
    backLink.href = opts.courseOverviewUrl;
    const titleSpan = backLink.querySelector?.('.back-link-title');
    if (titleSpan) titleSpan.textContent = opts.courseTitle;
  }
  const lessonContext = shellEl.querySelector?.('.header-lesson-context');
  if (lessonContext) lessonContext.textContent = opts.lessonTitle;

  // 3. Update Task Strip
  const taskStrip = shellEl.querySelector?.('.learning-task-strip');
  if (opts.taskSquares && opts.taskSquares.length > 0) {
    if (taskStrip) {
      const existingSquares = taskStrip.querySelectorAll?.('.task-square') || [];
      const sameLesson = existingSquares.length === opts.taskSquares.length &&
        [...existingSquares].every((el: any, idx: number) => {
          const sq = opts.taskSquares![idx];
          return el.getAttribute?.('href')?.includes(sq.id);
        });

      if (sameLesson) {
        // Fast path: update active/completed states, glyphs, and aria in-place
        existingSquares.forEach((sq: any, idx: number) => {
          const item = opts.taskSquares![idx];
          const isSelected = item.isCurrent;
          const isCompleted = item.isCompleted;
          const isWaived = item.isWaived;
          const stateLabel = isCompleted ? (isSelected ? 'Completed, Current' : 'Completed') : isWaived ? (isSelected ? 'Waived, Current' : 'Waived') : isSelected ? 'Current' : 'Incomplete';
          sq.className = [
            'task-square',
            isCompleted ? 'completed' : '',
            isSelected ? 'selected current' : '',
            isWaived ? 'waived' : '',
          ].filter(Boolean).join(' ');
          sq.setAttribute('aria-selected', String(isSelected));
          sq.setAttribute('aria-label', `Task ${item.ordinal}: ${item.title} (${item.type}, ${stateLabel})`);
          sq.setAttribute('title', `Task ${item.ordinal}: ${item.title} (${stateLabel})`);
          if (isSelected) {
            sq.setAttribute('aria-current', 'step');
            sq.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
          } else {
            sq.removeAttribute('aria-current');
          }
          sq.innerHTML = renderTaskSquareInnerHtml(item);
        });
        const arrowRegion = taskStrip.querySelector?.('.task-strip-right');
        if (arrowRegion) {
          const strip = renderTaskStripHtml({ ...opts, taskControls: isPython ? opts.taskActions : undefined });
          const template = root.ownerDocument.createElement('template');
          template.innerHTML = strip;
          arrowRegion.innerHTML = template.content.querySelector('.task-strip-right')?.innerHTML ?? '';
        }
      } else {
        const newStripHtml = renderTaskStripHtml({
        taskControls: isPython ? opts.taskActions : undefined,
          lessonTitle: opts.lessonTitle,
          taskSquares: opts.taskSquares,
          previousStepUrl: opts.previousStepUrl,
          nextStepUrl: opts.nextStepUrl,
        });
        taskStrip.outerHTML = newStripHtml;
      }
    } else {
      const newStripHtml = renderTaskStripHtml({
        taskControls: isPython ? opts.taskActions : undefined,
        lessonTitle: opts.lessonTitle,
        taskSquares: opts.taskSquares,
        previousStepUrl: opts.previousStepUrl,
        nextStepUrl: opts.nextStepUrl,
      });
      shellEl.insertAdjacentHTML?.('afterbegin', newStripHtml);
    }
  }

  // 4. Update Sidebar active item, links, and progress by stable lesson ID
  if (opts.modules && opts.modules.length > 0) {
    const lessonDataMap = new Map<string, { href: string; isCurrent: boolean; completedCount: number; totalCount: number }>();
    for (const mod of opts.modules) {
      for (const les of mod.lessons || []) {
        lessonDataMap.set(les.id, les);
      }
    }
    const sidebarLinks = sidebarEl.querySelectorAll?.('.sidebar-lesson-item') || [];
    sidebarLinks.forEach((link: any) => {
      const lessonId = link.dataset?.lessonId || link.getAttribute?.('data-lesson-id');
      const lessonData = lessonId ? lessonDataMap.get(lessonId) : null;
      if (lessonData) {
        link.classList.toggle('active', Boolean(lessonData.isCurrent));
        if (lessonData.isCurrent) {
          link.setAttribute('aria-current', 'location');
        } else {
          link.removeAttribute('aria-current');
        }
        if (lessonData.href) {
          link.href = lessonData.href;
        }
        const countEl = link.querySelector?.('.lesson-item-count');
        if (countEl) {
          countEl.textContent = `${lessonData.completedCount}/${lessonData.totalCount}`;
        }
      }
    });
  }
  const progressFill = sidebarEl.querySelector?.('.sidebar-progress-box .progress-bar-fill');
  if (progressFill && opts.courseProgressPercentage !== undefined) {
    progressFill.style.width = `${opts.courseProgressPercentage}%`;
  }
  const progressText = sidebarEl.querySelector?.('.sidebar-progress-box .progress-text');
  if (progressText && opts.courseProgressText) {
    progressText.textContent = opts.courseProgressText;
  }

  // 5. Replace Workspace Viewport
  let viewport = mainEl.querySelector?.('.workspace-viewport');
  if (!viewport && typeof document !== 'undefined') {
    viewport = document.createElement('div');
    viewport.className = 'workspace-viewport';
    mainEl.appendChild(viewport);
  }
  if (viewport) {
    viewport.removeAttribute('aria-busy');
    viewport.innerHTML = opts.workspaceContent + (!isPython && opts.taskActions ? `<div class="inline-task-actions">${opts.taskActions}</div>` : '');
  }

  // 6. Update Task Footer
  const footer = mainEl.querySelector?.('.learning-task-footer');
  if (footer) {
    const leftEl = footer.querySelector?.('.task-footer-left');
    if (leftEl) {
      leftEl.innerHTML = opts.previousStepUrl ? `<a href="${escapeHtml(opts.previousStepUrl)}" class="btn btn-secondary btn-compact">Previous</a>` : '';
    }
    const rightEl = footer.querySelector?.('.task-footer-right');
    if (rightEl) {
      rightEl.innerHTML = isPython
        ? `<div class="python-execution-actions">${opts.taskActions || ''}</div>`
        : (opts.taskActions ? opts.taskActions : (opts.nextStepUrl ? `<a href="${opts.nextStepUrl}" class="btn btn-primary btn-compact">Next</a>` : ''));
    }
  }

  // 7. Update in-workspace report dialog metadata
  const reportDialog = root.querySelector?.('#exercise-report-dialog') || (typeof document !== 'undefined' ? document.getElementById('exercise-report-dialog') : null);
  if (reportDialog && opts.reportContext) {
    const cId = reportDialog.querySelector?.('#report-course-id');
    const vId = reportDialog.querySelector?.('#report-version-id');
    const sId = reportDialog.querySelector?.('#report-step-id');
    const eId = reportDialog.querySelector?.('#report-enrollment-id');
    if (cId) cId.value = opts.reportContext.courseId || '';
    if (vId) vId.value = opts.reportContext.courseVersionId || '';
    if (sId) sId.value = opts.reportContext.stepId || '';
    if (eId) eId.value = opts.reportContext.enrollmentId || '';

    const summaryBlock = reportDialog.querySelector?.('.report-context-summary');
    if (summaryBlock) {
      summaryBlock.innerHTML = `
        <strong class="block text-foreground">${escapeHtml(opts.reportContext.stepTitle || opts.stepTitle)}</strong>
        <div class="text-xs text-muted mt-1">Course: ${escapeHtml(opts.courseTitle)} · Lesson: ${escapeHtml(opts.reportContext.lessonTitle || opts.lessonTitle)}</div>
      `;
    }
  }

  return true;
}
