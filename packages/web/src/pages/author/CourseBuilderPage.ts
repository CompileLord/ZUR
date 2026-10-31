import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';
import { renderAuthorTree } from './AuthorTreeComponent.ts';
import { renderIcon } from '../../components/common/icons.ts';
import { renderCourseOverviewPane } from './CourseBuilderOverviewPane.ts';
import { renderModulePane, renderLessonPane, renderStepPane } from './CourseBuilderEntityPanes.ts';
import { renderCourseBuilderInspector } from './CourseBuilderInspector.ts';
import type { CourseBuilderPageOptions } from './CourseBuilderTypes.ts';

export { initRowOverflowMenus } from './CourseBuilderOverflow.ts';
export type { StepSummary, LessonSummary, ModuleSummary, RemoteUpdateInfo, CourseBuilderPageOptions } from './CourseBuilderTypes.ts';

export function renderCourseBuilderPage(opts: CourseBuilderPageOptions): string {
  opts = safeTemplateData(opts);
  const selectedType = opts.selectedType || 'course';
  const selectedId = opts.selectedId || opts.courseId;

  const treeContent = renderAuthorTree({
    courseId: opts.courseId,
    courseTitle: opts.courseTitle,
    modules: opts.modules,
    selectedType,
    selectedId,
    title: 'Structure',
    invalidStepIds: opts.invalidStepIds,
  });
  const menuBtn = (label: string) =>
    `<button type="button" class="tree-row-menu-btn" data-reorder-menu aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${label}" title="Actions (Alt+Up / Alt+Down to move)">${renderIcon('more-horizontal', { size: 14 })}</button>`;
  const grip = `<span class="tree-grip" aria-hidden="true">${renderIcon('grip-vertical', { size: 14 })}</span>`;

  // Center editor pane based on selected entity
  let editorContent = '';

  if (selectedType === 'course') {
    editorContent = renderCourseOverviewPane(opts, grip, menuBtn);
  } else if (selectedType === 'module') {
    editorContent = renderModulePane(opts, selectedId, grip, menuBtn);
  } else if (selectedType === 'lesson') {
    editorContent = renderLessonPane(opts, selectedId, grip, menuBtn);
  } else if (selectedType === 'step') {
    editorContent = renderStepPane(opts, selectedId);
  }

  // Contextual inspector content (design.md §5, §12 P22)
  const inspectorContent = renderCourseBuilderInspector(opts, selectedType, selectedId);

  const feedbackMessageHtml = opts.feedbackMessage
    ? `<div class="alert alert-danger mb-4" role="alert">${opts.feedbackMessage}</div>`
    : '';

  const remoteUpdateHtml = opts.remoteUpdate
    ? `
      <aside class="remote-update-strip" role="status" aria-live="polite" aria-label="Remote update notice" style="margin-bottom: 1rem; padding: 0.75rem 1rem; background-color: var(--bg-surface); border: 1px solid var(--border-subtle); border-left: 4px solid var(--accent); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="status-badge ${opts.remoteUpdate.hasLocalEdits ? 'error' : 'info'}" aria-hidden="true">${opts.remoteUpdate.hasLocalEdits ? 'Conflict' : 'Remote'}</span>
          <span>
            Updated through <strong>${opts.remoteUpdate.agentName}</strong> · ${opts.remoteUpdate.timestampText || 'just now'}
            <span class="text-secondary" style="font-size: 0.8125rem;">(Revision ${opts.remoteUpdate.newRevision})</span>
            ${opts.remoteUpdate.hasLocalEdits ? '<span class="status-badge error mt-1" style="display: inline-block;">Version conflict: Unsaved local changes preserved. Review differences before replacing.</span>' : ''}
          </span>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <a href="/teach/${opts.courseId}/activity" class="btn btn-secondary btn-compact">View changes</a>
          ${!opts.remoteUpdate.hasLocalEdits
            ? '<button type="button" class="btn btn-primary btn-compact" id="load-update-btn">Load update</button>'
            : '<button type="button" class="btn btn-secondary btn-compact" id="resolve-conflict-btn">Compare changes</button>'}
        </div>
      </aside>
    `
    : '';

  return renderAuthorWorkspaceShell({
    courseId: opts.courseId,
    courseTitle: opts.courseTitle,
    publicationState: opts.publicationState,
    hasUnpublishedChanges: opts.hasUnpublishedChanges,
    saveStatusText: opts.saveStatusText,
    activeTab: 'content',
    treeContent,
    modules: opts.modules,
    selectedType: opts.selectedType,
    selectedId: opts.selectedId,
    editorContent: `${feedbackMessageHtml}${remoteUpdateHtml}${editorContent}`,
    inspectorContent,
  });
}
