import { escapeHtml } from '../escape-html.ts';
import { renderIcon } from '../common/icons.ts';

export interface CourseModuleLessonItem {
  id: string;
  title: string;
  completedCount: number;
  totalCount: number;
  isCurrent?: boolean;
  href: string;
}

export interface CourseModuleItem {
  id: string;
  title: string;
  lessons: CourseModuleLessonItem[];
}

export interface TaskSquareItem {
  id: string;
  ordinal: number;
  title: string;
  type: 'theory' | 'video' | 'quiz' | 'python';
  isCurrent: boolean;
  isCompleted: boolean;
  isWaived?: boolean;
  isRequired?: boolean;
  href: string;
}

export interface LearningWorkspaceShellOptions {
  courseTitle: string;
  courseOverviewUrl: string;
  lessonTitle: string;
  stepTitle: string;
  stepOrdinalText: string; // e.g. "Step 4 of 7" or course-wide position
  courseProgressText?: string; // e.g. "1 of 7 completed"
  courseProgressPercentage?: number;
  modules?: CourseModuleItem[];
  taskSquares?: TaskSquareItem[];
  isPythonWorkspace?: boolean;
  saveStatusText?: string; // e.g. "Saved", "Saving"
  outlineContent?: string;
  workspaceContent: string;
  previousStepUrl?: string | null;
  nextStepUrl?: string | null;
  taskActions?: string; // e.g. Run samples, Submit solution
  reportIssueUrl?: string | null;
  reportContext?: {
    courseId?: string;
    courseVersionId?: string;
    enrollmentId?: string;
    stepId?: string;
    courseTitle?: string;
    lessonTitle?: string;
    stepTitle?: string;
  };
  isSidebarCollapsed?: boolean;
  outlineDrawer?: boolean;
}

export const OUTLINE_DOCK_MIN_WIDTH = 1600;

export function isOutlineDocked(isPython: boolean): boolean {
  return isPython && typeof window !== 'undefined' && window.innerWidth >= OUTLINE_DOCK_MIN_WIDTH;
}

export function resolveOutlineCollapsed(opts: { outlineDrawer?: boolean; isPythonWorkspace?: boolean; isSidebarCollapsed?: boolean }): boolean {
  if (!opts.outlineDrawer) return Boolean(opts.isSidebarCollapsed);
  return isOutlineDocked(Boolean(opts.isPythonWorkspace)) ? Boolean(opts.isSidebarCollapsed) : true;
}

export function getOutlineToggleLabels(isCollapsed: boolean, drawer: boolean): { label: string; title: string } {
  if (!drawer) {
    const l = isCollapsed ? 'Show modules' : 'Hide modules';
    return { label: l, title: l };
  }
  return { label: isCollapsed ? 'Show outline' : 'Hide outline', title: 'Outline (Ctrl+B)' };
}

export function setLearningOutlineState(shellEl: HTMLElement, collapsed: boolean): void {
  const sidebar = shellEl.querySelector<HTMLElement>('#course-sidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed', collapsed);
  sidebar.classList.toggle('open', !collapsed);
  sidebar.inert = collapsed;
  const drawer = shellEl.classList.contains('outline-drawer-mode');
  const overlay = drawer && !isOutlineDocked(shellEl.classList.contains('paired-workspace'));
  const main = shellEl.querySelector<HTMLElement>('.learning-workspace-main');
  if (main) main.inert = overlay && !collapsed;
  const scrim = shellEl.querySelector<HTMLElement>('.outline-scrim');
  if (scrim) scrim.hidden = !(overlay && !collapsed);
  const btn = shellEl.querySelector<HTMLElement>('.sidebar-toggle-btn');
  if (btn) {
    const t = getOutlineToggleLabels(collapsed, drawer);
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.setAttribute('aria-label', t.label);
    btn.setAttribute('title', t.title);
  }
}

let outlinePersist: ((collapsed: boolean) => void) | null = null;
let outlineGlobalsInstalled = false;

function activeOutlineShell(): HTMLElement | null {
  const shell = document.querySelector<HTMLElement>('.shell-learning.outline-drawer-mode');
  return shell && shell.isConnected ? shell : null;
}

export function toggleLearningOutline(shellEl: HTMLElement, force?: boolean): void {
  const sidebar = shellEl.querySelector<HTMLElement>('#course-sidebar');
  if (!sidebar) return;
  const wasCollapsed = sidebar.classList.contains('collapsed');
  const collapsed = force === undefined ? !wasCollapsed : !force;
  setLearningOutlineState(shellEl, collapsed);
  const docked = isOutlineDocked(shellEl.classList.contains('paired-workspace'));
  if (docked) outlinePersist?.(collapsed);
  if (!docked && wasCollapsed && !collapsed) {
    (sidebar.querySelector<HTMLElement>('.sidebar-lesson-item.active') || sidebar.querySelector<HTMLElement>('a, button'))?.focus();
  } else if (!docked && !wasCollapsed && collapsed) {
    shellEl.querySelector<HTMLElement>('.sidebar-toggle-btn')?.focus();
  }
}

export function attachOutlineDrawer(shellEl: HTMLElement, persist: (collapsed: boolean) => void): void {
  outlinePersist = persist;
  shellEl.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('.sidebar-toggle-btn')) {
      event.stopPropagation();
      toggleLearningOutline(shellEl);
    } else if (target.closest('.outline-close-btn, .outline-scrim')) {
      toggleLearningOutline(shellEl, false);
    } else if (target.closest('#course-sidebar a') && !isOutlineDocked(shellEl.classList.contains('paired-workspace'))) {
      setLearningOutlineState(shellEl, true);
    }
  });
  if (outlineGlobalsInstalled) return;
  outlineGlobalsInstalled = true;
  document.addEventListener('keydown', (event) => {
    const shell = activeOutlineShell();
    if (!shell) return;
    const sidebar = shell.querySelector<HTMLElement>('#course-sidebar');
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      toggleLearningOutline(shell);
      return;
    }
    const overlayOpen = sidebar && !sidebar.classList.contains('collapsed') && !isOutlineDocked(shell.classList.contains('paired-workspace'));
    if (!overlayOpen || !sidebar) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      toggleLearningOutline(shell, false);
    } else if (event.key === 'Tab') {
      const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), summary'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!sidebar.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
}

export function renderTaskStripHtml(opts: {
  taskControls?: string;
  lessonTitle: string;
  taskSquares?: TaskSquareItem[];
  previousStepUrl?: string | null;
  nextStepUrl?: string | null;
  isSidebarCollapsed?: boolean;
  outlineDrawer?: boolean;
}): string {
  const isCollapsed = Boolean(opts.isSidebarCollapsed);
  const drawer = Boolean(opts.outlineDrawer);
  const toggle = getOutlineToggleLabels(isCollapsed, drawer);
  const toggleLabel = toggle.label;

  return `
    <nav class="learning-task-strip" role="navigation" aria-label="Lesson tasks">
      <div class="task-strip-left">
          <a href="/learn" class="btn btn-secondary btn-compact learning-home-link" aria-label="Back to main page" title="Back to main page">
            ${renderIcon('arrow-left', { size: 16 })}
          </a>
          <button type="button" class="btn btn-secondary btn-compact outline-toggle-btn sidebar-toggle-btn" aria-expanded="${!isCollapsed}" aria-controls="course-sidebar" title="${toggle.title}" aria-label="${toggleLabel}">
            ${renderIcon('book', { size: 14 })}
            <span>${drawer ? 'Outline' : 'Modules'}</span>
          </button>
        <span class="task-strip-lesson-title font-semibold text-sm" title="${escapeHtml(opts.lessonTitle)}">${escapeHtml(opts.lessonTitle)}</span>

      </div>
      <div class="task-strip-center" role="tablist" aria-label="Tasks in this lesson">
        ${(opts.taskSquares || []).map((sq) => {
          const isCompleted = sq.isCompleted;
          const isSelected = sq.isCurrent;
          const isWaived = sq.isWaived;
          const stateLabel = isCompleted ? (isSelected ? 'Completed, Current' : 'Completed') : isWaived ? (isSelected ? 'Waived, Current' : 'Waived') : isSelected ? 'Current' : 'Incomplete';
          const squareClasses = [
            'task-square',
            isCompleted ? 'completed' : '',
            isSelected ? 'selected current' : '',
            isWaived ? 'waived' : '',
          ].filter(Boolean).join(' ');

          return `
            <a
              href="${escapeHtml(sq.href)}"
              class="${squareClasses}"
              data-ordinal="${sq.ordinal}"
              ${isSelected ? 'aria-current="step"' : ''}
              role="tab"
              aria-selected="${isSelected}"
              aria-label="Task ${sq.ordinal}: ${escapeHtml(sq.title)} (${escapeHtml(sq.type)}, ${stateLabel})"
              title="Task ${sq.ordinal}: ${escapeHtml(sq.title)} (${stateLabel})"
            >
              ${renderTaskSquareInnerHtml(sq)}
            </a>
          `;
        }).join('')}
      </div>
      <div class="task-strip-right">
        ${opts.taskControls || ''}
        ${opts.previousStepUrl
          ? `<a href="${escapeHtml(opts.previousStepUrl)}" class="task-nav-arrow prev-task" aria-label="Previous task" title="Previous task">‹</a>`
          : `<span class="task-nav-arrow disabled" aria-disabled="true">‹</span>`}
        ${opts.nextStepUrl
          ? `<a href="${escapeHtml(opts.nextStepUrl)}" class="task-nav-arrow next-task" aria-label="Next task" title="Next task">›</a>`
          : `<span class="task-nav-arrow disabled" aria-disabled="true">›</span>`}
      </div>
    </nav>
  `;
}

export function renderTaskSquareInnerHtml(item: { ordinal: number; type?: TaskSquareItem['type']; isCompleted?: boolean; isWaived?: boolean }): string {
  const icons = { theory: 'file-text', video: 'video', quiz: 'list-checks', python: 'code' } as const;
  const icon = icons[item.type ?? 'theory'];
  return `<span class="task-type-icon" aria-hidden="true">${renderIcon(icon, { size: 18 })}</span>
    <span class="ordinal-number" aria-hidden="true">${item.ordinal}</span>
    ${item.isCompleted ? `<span class="check-icon task-state-badge" aria-hidden="true">${renderIcon('check', { size: 10, strokeWidth: 3 })}</span>` : item.isWaived ? '<span class="waived-letter task-state-badge" aria-hidden="true">W</span>' : ''}
    <span class="sr-only">Task ${item.ordinal}</span>`;
}

export function renderSidebarContentHtml(opts: {
  drawer?: boolean;
  modules?: CourseModuleItem[];
  outlineContent?: string;
  courseProgressText?: string;
  courseProgressPercentage?: number;
}): string {
  const hasModules = Boolean(opts.modules && opts.modules.length > 0);
  if (hasModules) {
    return `
      <div class="sidebar-header">
        <h2 class="sidebar-title">${opts.drawer ? 'Outline' : 'Modules &amp; lessons'}</h2>
        ${opts.drawer ? `<button type="button" class="btn-icon btn-compact outline-close-btn" aria-label="Close outline">${renderIcon('x', { size: 16 })}</button>` : ''}

      </div>
      <div class="sidebar-modules-list">
        ${opts.modules!.map((mod, modIdx) => `
          <details class="sidebar-module-group" data-module-id="${escapeHtml(mod.id)}" open>
            <summary class="sidebar-module-summary">
              <span class="module-title font-semibold text-xs text-muted">Module ${modIdx + 1}: ${escapeHtml(mod.title)}</span>
              <span class="module-chevron" aria-hidden="true">${renderIcon('chevron-down', { size: 12 })}</span>
            </summary>
            <ul class="sidebar-lessons-list" role="list">
              ${mod.lessons.map(les => `
                <li>
                  <a href="${escapeHtml(les.href)}" class="sidebar-lesson-item ${les.isCurrent ? 'active' : ''}" data-lesson-id="${escapeHtml(les.id)}" ${les.isCurrent ? 'aria-current="location"' : ''}>
                    <span class="lesson-item-title text-sm">${escapeHtml(les.title)}</span>
                    <span class="lesson-item-count text-xs font-mono text-muted">${les.completedCount}/${les.totalCount}</span>
                  </a>
                </li>
              `).join('')}
            </ul>
          </details>
        `).join('')}
      </div>
      <div class="sidebar-footer">
        <div class="sidebar-progress-box">
          <div class="progress-bar-track" aria-hidden="true">
            <div class="progress-bar-fill" style="width: ${opts.courseProgressPercentage ?? 0}%;"></div>
          </div>
          <span class="progress-text text-xs text-secondary mt-1 block">${escapeHtml(opts.courseProgressText || 'Course progress')}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="outline-drawer-header sidebar-header">
      <h2>Course outline</h2>
    </div>
    <div class="outline-drawer-content sidebar-modules-list">
      ${opts.outlineContent || ''}
    </div>
    ${opts.courseProgressText ? `
      <div class="sidebar-footer">
        <div class="sidebar-progress-box">
          <div class="progress-bar-track" aria-hidden="true">
            <div class="progress-bar-fill" style="width: ${opts.courseProgressPercentage ?? 0}%;"></div>
          </div>
          <span class="progress-text text-xs text-secondary mt-1 block">${escapeHtml(opts.courseProgressText)}</span>
        </div>
      </div>
    ` : ''}
  `;
}

export function renderLearningWorkspaceShell(opts: LearningWorkspaceShellOptions): string {
  const isPython = Boolean(opts.isPythonWorkspace);
  const drawer = Boolean(opts.outlineDrawer);
  const isSidebarCollapsed = resolveOutlineCollapsed(opts);
  const taskStripHtml = renderTaskStripHtml({
    taskControls: isPython ? opts.taskActions : undefined,
    lessonTitle: opts.lessonTitle,
    taskSquares: opts.taskSquares,
    previousStepUrl: opts.previousStepUrl,
    nextStepUrl: opts.nextStepUrl,
    isSidebarCollapsed,
    outlineDrawer: drawer,
  });

  const sidebarContentHtml = renderSidebarContentHtml({
    drawer,
    modules: opts.modules,
    outlineContent: opts.outlineContent,
    courseProgressText: opts.courseProgressText,
    courseProgressPercentage: opts.courseProgressPercentage,
  });

  return `
    <div class="shell-learning ${isPython ? 'paired-workspace' : 'reading-workspace'} learning-workspace-layout${drawer ? ' outline-drawer-mode' : ''}">


      ${taskStripHtml}
      <div class="learning-body">
        ${drawer ? '<div class="outline-scrim" hidden></div>' : ''}
        <aside id="course-sidebar" class="learning-course-sidebar ${isSidebarCollapsed ? 'collapsed' : 'open'}" role="navigation" aria-label="${drawer ? 'Course outline' : 'Course Syllabus'}"${isSidebarCollapsed ? ' inert' : ''}>
          ${sidebarContentHtml}
        </aside>

        <main id="main-content" class="learning-workspace-main" role="main">
          <div class="workspace-viewport">
            ${opts.workspaceContent}
            ${!isPython && opts.taskActions ? `<div class="inline-task-actions">${opts.taskActions}</div>` : ''}
          </div>


        </main>
      </div>

      <!-- In-Workspace Report Issue Dialog -->
      <dialog id="exercise-report-dialog" class="dialog-overlay modal-dialog" hidden role="dialog" aria-modal="true" aria-labelledby="exercise-report-title">
        <div class="dialog" style="max-width: 480px; width: 100%;">
          <div class="dialog-header">
            <h3 id="exercise-report-title" class="dialog-title">Report issue</h3>
            <button type="button" class="btn-icon btn-compact dialog-close-btn" id="close-report-dialog-btn" aria-label="Close dialog">
              ${renderIcon('x', { size: 16 })}
            </button>
          </div>
          <form id="exercise-report-form" class="dialog-body">
            <input type="hidden" name="courseId" id="report-course-id" value="${escapeHtml(opts.reportContext?.courseId || '')}" />
            <input type="hidden" name="courseVersionId" id="report-version-id" value="${escapeHtml(opts.reportContext?.courseVersionId || '')}" />
            <input type="hidden" name="stepId" id="report-step-id" value="${escapeHtml(opts.reportContext?.stepId || '')}" />
            <input type="hidden" name="enrollmentId" id="report-enrollment-id" value="${escapeHtml(opts.reportContext?.enrollmentId || '')}" />

            <div class="report-context-summary text-sm text-secondary mb-4 p-3 bg-canvas border border-subtle rounded">
              <strong class="block text-foreground">${escapeHtml(opts.reportContext?.stepTitle || opts.stepTitle)}</strong>
              <div class="text-xs text-muted mt-1">Course: ${escapeHtml(opts.courseTitle)} · Lesson: ${escapeHtml(opts.reportContext?.lessonTitle || opts.lessonTitle)}</div>
            </div>

            <div class="form-group mb-3">
              <label for="report-issue-type" class="form-label text-sm mb-1">Issue type</label>
              <select id="report-issue-type" name="type" class="form-select w-full">
                <option value="broken_exercise">Broken exercise or test issue</option>
                <option value="inappropriate_content">Content error or typo</option>
                <option value="other">Other issue</option>
              </select>
            </div>

            <div class="form-group mb-3">
              <label for="report-issue-details" class="form-label text-sm mb-1">Details</label>
              <textarea id="report-issue-details" name="details" class="form-textarea w-full" rows="4" placeholder="Describe the problem you encountered..." required></textarea>
            </div>

            <div class="form-group mb-4">
              <label class="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                <input type="checkbox" id="report-include-code" name="includeCode" value="true" />
                <span>Include current code draft with report</span>
              </label>
            </div>

            <div id="report-form-feedback" class="text-sm mb-3" hidden></div>

            <div class="dialog-footer">
              <button type="button" class="btn btn-secondary btn-compact" id="cancel-report-btn">Cancel</button>
              <button type="submit" class="btn btn-primary btn-compact" id="submit-report-btn">Send report</button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  `;
}
