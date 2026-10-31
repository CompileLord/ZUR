import type { AgentActivityPageOptions } from './AgentActivityTypes.ts';
import { escapeHtml } from './AgentActivityFormat.ts';

export function renderActivityFilterToolbar(opts: AgentActivityPageOptions): string {
  // Filter toolbar
  return `
    <section class="activity-filters-card mb-4" aria-label="Activity Filters">
      <form method="GET" action="/teach/${opts.courseId}/activity" style="display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end;">
        <div class="form-group" style="min-width: 140px; flex: 1;">
          <label for="filter-connection" class="field-label" style="font-size: 0.75rem; font-weight: 500; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Connection</label>
          <select id="filter-connection" name="tokenId" class="select-input" style="width: 100%; height: 32px; padding: 0 0.5rem; border: 1px solid var(--border-control); border-radius: var(--radius-sm); background: var(--bg-surface); color: var(--text-primary); font-size: 0.8125rem;">
            <option value="">All connections</option>
            ${(opts.connections || []).map((c) => `<option value="${escapeHtml(c.id)}" ${opts.filterConnection === c.id ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}
          </select>
        </div>

        <div class="form-group" style="min-width: 130px;">
          <label for="filter-date" class="field-label" style="font-size: 0.75rem; font-weight: 500; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Date</label>
          <input type="date" id="filter-date" name="date" class="date-input" value="${escapeHtml(opts.filterDate || '')}" style="width: 100%; height: 32px; padding: 0 0.5rem; border: 1px solid var(--border-control); border-radius: var(--radius-sm); background: var(--bg-surface); color: var(--text-primary); font-size: 0.8125rem;" />
        </div>

        <div class="form-group" style="min-width: 150px; flex: 1;">
          <label for="filter-tool" class="field-label" style="font-size: 0.75rem; font-weight: 500; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Operation</label>
          <select id="filter-tool" name="toolName" class="select-input" style="width: 100%; height: 32px; padding: 0 0.5rem; border: 1px solid var(--border-control); border-radius: var(--radius-sm); background: var(--bg-surface); color: var(--text-primary); font-size: 0.8125rem;">
            <option value="">All operations</option>
            <option value="batch_author" ${opts.filterTool === 'batch_author' ? 'selected' : ''}>Batch authoring</option>
            <option value="apply_course_changes" ${opts.filterTool === 'apply_course_changes' ? 'selected' : ''}>Batch authoring (apply changes)</option>
            <option value="update_course_metadata" ${opts.filterTool === 'update_course_metadata' ? 'selected' : ''}>Update metadata</option>
            <option value="create_module" ${opts.filterTool === 'create_module' ? 'selected' : ''}>Create module</option>
            <option value="update_module" ${opts.filterTool === 'update_module' ? 'selected' : ''}>Update module</option>
            <option value="delete_module" ${opts.filterTool === 'delete_module' ? 'selected' : ''}>Delete module</option>
            <option value="create_lesson" ${opts.filterTool === 'create_lesson' ? 'selected' : ''}>Create lesson</option>
            <option value="update_lesson" ${opts.filterTool === 'update_lesson' ? 'selected' : ''}>Update lesson</option>
            <option value="delete_lesson" ${opts.filterTool === 'delete_lesson' ? 'selected' : ''}>Delete lesson</option>
            <option value="create_step" ${opts.filterTool === 'create_step' ? 'selected' : ''}>Create step</option>
            <option value="update_step" ${opts.filterTool === 'update_step' ? 'selected' : ''}>Update step</option>
            <option value="delete_step" ${opts.filterTool === 'delete_step' ? 'selected' : ''}>Delete step</option>
            <option value="duplicate_step" ${opts.filterTool === 'duplicate_step' ? 'selected' : ''}>Duplicate step</option>
            <option value="restore_draft_revision" ${opts.filterTool === 'restore_draft_revision' ? 'selected' : ''}>Restore draft revision</option>
          </select>
        </div>

        <div class="form-group" style="min-width: 120px;">
          <label for="filter-outcome" class="field-label" style="font-size: 0.75rem; font-weight: 500; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Outcome</label>
          <select id="filter-outcome" name="outcome" class="select-input" style="width: 100%; height: 32px; padding: 0 0.5rem; border: 1px solid var(--border-control); border-radius: var(--radius-sm); background: var(--bg-surface); color: var(--text-primary); font-size: 0.8125rem;">
            <option value="">All outcomes</option>
            <option value="success" ${opts.filterOutcome === 'success' ? 'selected' : ''}>Success</option>
            <option value="failure" ${opts.filterOutcome === 'failure' ? 'selected' : ''}>Failure</option>
          </select>
        </div>

        <div style="display: flex; gap: 0.5rem; height: 32px; align-items: center;">
          <button type="submit" id="apply-filters-btn" class="btn btn-secondary btn-compact" style="height: 32px;">Apply filters</button>
          <a href="/teach/${opts.courseId}/activity" id="reset-filters-btn" class="btn btn-ghost btn-compact text-secondary" style="height: 32px; line-height: 30px;">Reset</a>
        </div>
      </form>
    </section>
  `;

}
