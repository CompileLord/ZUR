import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';

export interface ActivityItem {
  id: string;
  tokenId: string;
  tokenLabel: string;
  toolName: string;
  baseRevision: number;
  newRevision: number;
  affectedEntities: string[] | Record<string, unknown> | any;
  outcome: 'success' | 'failure' | string;
  correlationId?: string | null;
  createdAt: string;
}

export interface MutationDetail extends ActivityItem {
  courseId: string;
  idempotencyKey?: string;
  priorContent?: any | null;
  newContent?: any | null;
}

export interface RecoveryRevisionSummary {
  id: string;
  courseId: string;
  revisionNumber: number;
  createdBy: string;
  reason: string;
  createdAt: string;
}

export interface AgentActivityPageOptions {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  activities: ActivityItem[];
  totalActivities?: number;
  currentPage?: number;
  totalPages?: number;
  selectedMutation?: MutationDetail | null;
  recoveryRevisions?: RecoveryRevisionSummary[];
  selectedRecoveryRevision?: RecoveryRevisionSummary | null;
  showRestoreConfirmModal?: boolean;
  currentDraftRevision?: number;
  connections?: { id: string; label: string }[];
  filterConnection?: string;
  filterDate?: string;
  filterTool?: string;
  filterOutcome?: string;
  recoveryError?: string;
  restoreConflict?: {
    message: string;
    currentRevision?: number;
  };
  feedbackMessage?: string;
  errorMessage?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatActivityDate(isoString: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    });
  } catch {
    return isoString;
  }
}

function formatToolName(toolName: string): string {
  switch (toolName) {
    case 'apply_course_changes':
    case 'batch_author':
      return 'Batch authoring';
    case 'create_course':
      return 'Create course draft';
    case 'update_course_metadata':
      return 'Update metadata';
    case 'create_module':
      return 'Create module';
    case 'update_module':
      return 'Update module';
    case 'delete_module':
      return 'Delete module';
    case 'create_lesson':
      return 'Create lesson';
    case 'update_lesson':
      return 'Update lesson';
    case 'delete_lesson':
      return 'Delete lesson';
    case 'create_step':
      return 'Create step';
    case 'update_step':
      return 'Update step content';
    case 'delete_step':
      return 'Delete step';
    case 'duplicate_step':
      return 'Duplicate step';
    case 'restore_draft_revision':
      return 'Restore draft revision';
    default:
      return toolName;
  }
}

function formatEntityString(str: string, toolName?: string): string {
  const prefixMatch = str.match(/^(?:mod|module|lesson|step)[-_0-9]+[-_](.+)$/i);
  if (prefixMatch) {
    const rawName = prefixMatch[1].replace(/[-_]+/g, ' ');
    const humanName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    return `<span title="${escapeHtml(str)}" class="entity-name">${escapeHtml(humanName)}</span>`;
  }
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  if (isUuid) {
    if (toolName === 'update_course_metadata' || toolName === 'create_course') return 'Course metadata';
    if (toolName?.includes('step')) return 'Step content';
    if (toolName?.includes('lesson')) return 'Lesson';
    if (toolName?.includes('module')) return 'Module';
    return 'Course content';
  }
  return escapeHtml(str);
}

function formatAffectedEntities(entities: any, toolName?: string): string {
  if (!entities) {
    if (toolName === 'update_course_metadata') return 'Course metadata';
    if (toolName === 'create_course') return 'Course draft';
    return 'None';
  }

  if (typeof entities === 'object' && !Array.isArray(entities)) {
    if (entities.operations_applied) {
      const nodeCount = Array.isArray(entities.affected_entities) ? entities.affected_entities.length : 0;
      return `${entities.operations_applied} batch operations (${nodeCount} node${nodeCount === 1 ? '' : 's'})`;
    }
    if (entities.title) return escapeHtml(String(entities.title));
    if (entities.name) return escapeHtml(String(entities.name));
    const propCount = Object.keys(entities).length;
    return `${propCount} propert${propCount === 1 ? 'y' : 'ies'}`;
  }

  if (Array.isArray(entities)) {
    if (entities.length === 0) {
      if (toolName === 'update_course_metadata') return 'Course metadata';
      return 'None';
    }

    if (entities.length === 1) {
      const item = entities[0];
      if (typeof item === 'object' && item !== null) {
        if (item.title) return escapeHtml(String(item.title));
        if (item.name) return escapeHtml(String(item.name));
      }
      return formatEntityString(String(item), toolName);
    }

    return `${entities.length} items`;
  }

  const str = String(entities);
  return formatEntityString(str, toolName);
}

function sanitizeDiffValue(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  const copy = JSON.parse(JSON.stringify(val));
  const redact = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('password') ||
        lower.includes('authorization') ||
        lower.includes('signedurl') ||
        lower.includes('signed_url')
      ) {
        obj[key] = '[REDACTED]';
      } else if (key === 'testCases' || key === 'test_cases') {
        if (Array.isArray(obj[key])) {
          obj[key] = obj[key].map((tc: any) => {
            if (tc && (tc.isHidden || tc.is_hidden)) {
              return { ...tc, stdin: '[HIDDEN TEST]', expectedStdout: '[HIDDEN TEST]' };
            }
            return tc;
          });
        }
      } else if (typeof obj[key] === 'object') {
        redact(obj[key]);
      }
    }
  };
  redact(copy);
  return copy;
}

function formatFieldName(key: string): string {
  switch (key) {
    case 'title': return 'Title';
    case 'description': return 'Description';
    case 'categoryId':
    case 'category_id': return 'Category';
    case 'difficulty': return 'Difficulty';
    case 'language': return 'Language';
    case 'prerequisites': return 'Prerequisites';
    case 'learningOutcomes':
    case 'learning_outcomes': return 'Learning Outcomes';
    case 'tags': return 'Tags';
    case 'estimatedDurationMinutes':
    case 'estimated_duration_minutes': return 'Estimated Duration';
    case 'markdown': return 'Markdown Content';
    case 'code':
    case 'starterCode':
    case 'starter_code': return 'Starter Code';
    case 'referenceSolution':
    case 'reference_solution': return 'Reference Solution';
    case 'videoUrl':
    case 'video_url': return 'Video URL';
    case 'transcript': return 'Video Transcript';
    case 'question': return 'Quiz Question';
    case 'options': return 'Quiz Options';
    case 'alt_text':
    case 'altText': return 'Image Alt Text';
    case 'caption': return 'Image Caption';
    case 'testCases':
    case 'test_cases': return 'Test Cases';
    default:
      return key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase());
  }
}

const INTERNAL_DIFF_KEYS = new Set([
  'id', 'owner_id', 'ownerId', 'course_id', 'courseId', 'module_id', 'moduleId',
  'lesson_id', 'lessonId', 'step_id', 'stepId', 'created_at', 'createdAt',
  'updated_at', 'updatedAt', 'draft_revision', 'draftRevision',
  'current_version_id', 'currentVersionId', 'is_suspended', 'isSuspended',
  'publication_status', 'publicationStatus', 'position'
]);

function formatSimpleValue(val: any): string {
  if (val === undefined || val === null) return 'None';
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    return val.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function renderLineDiff(priorStr: string, updatedStr: string): string {
  const priorLines = priorStr ? priorStr.split('\n') : [];
  const updatedLines = updatedStr ? updatedStr.split('\n') : [];
  const maxLines = Math.max(priorLines.length, updatedLines.length);
  const diffRows: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const pLine = priorLines[i];
    const uLine = updatedLines[i];

    if (pLine === uLine) {
      diffRows.push(`
        <div class="diff-line diff-unchanged" style="display: flex; font-family: var(--font-mono); font-size: 0.8125rem; line-height: 1.4; padding: 0.125rem 0.5rem;">
          <span class="diff-marker" style="width: 1.5rem; user-select: none; color: var(--fg-muted);" aria-hidden="true">&nbsp;</span>
          <span class="diff-code" style="white-space: pre-wrap; word-break: break-word; color: var(--fg-default);">${escapeHtml(pLine || '')}</span>
        </div>
      `);
    } else {
      if (pLine !== undefined) {
        diffRows.push(`
          <div class="diff-line diff-deletion" style="display: flex; font-family: var(--font-mono); font-size: 0.8125rem; line-height: 1.4; padding: 0.125rem 0.5rem; background-color: rgba(216, 59, 1, 0.12); border-left: 3px solid var(--danger);">
            <span class="diff-marker" style="width: 1.5rem; user-select: none; font-weight: 700; color: var(--danger);">-</span>
            <span class="diff-code" style="white-space: pre-wrap; word-break: break-word; color: var(--fg-default);">${escapeHtml(pLine)}</span>
          </div>
        `);
      }
      if (uLine !== undefined) {
        diffRows.push(`
          <div class="diff-line diff-addition" style="display: flex; font-family: var(--font-mono); font-size: 0.8125rem; line-height: 1.4; padding: 0.125rem 0.5rem; background-color: rgba(16, 124, 65, 0.12); border-left: 3px solid var(--success);">
            <span class="diff-marker" style="width: 1.5rem; user-select: none; font-weight: 700; color: var(--success);">+</span>
            <span class="diff-code" style="white-space: pre-wrap; word-break: break-word; color: var(--fg-default);">${escapeHtml(uLine)}</span>
          </div>
        `);
      }
    }
  }

  return `
    <div class="diff-viewer" role="region" aria-label="Content diff comparison" style="border: 1px solid var(--border-default); border-radius: var(--radius-sm); overflow-x: auto; background-color: var(--bg-canvas); max-height: 400px; overflow-y: auto;">
      <div class="diff-header" style="display: flex; justify-content: space-between; padding: 0.5rem 0.75rem; background-color: var(--bg-surface); border-bottom: 1px solid var(--border-default); font-size: 0.75rem; color: var(--fg-muted);">
        <span>Legend: <strong style="color: var(--danger);">- Deletions</strong> &nbsp;|&nbsp; <strong style="color: var(--success);">+ Additions</strong></span>
        <span>${maxLines} lines inspected</span>
      </div>
      <div class="diff-content" style="padding: 0.5rem 0;">
        ${diffRows.join('')}
      </div>
    </div>
  `;
}

function renderVisualDiff(prior: any, updated: any): string {
  if (!prior && !updated) {
    return '<p class="text-secondary">No content recorded for visual diffing.</p>';
  }

  const safePrior = sanitizeDiffValue(prior);
  const safeUpdated = sanitizeDiffValue(updated);

  const priorStr = safePrior ? JSON.stringify(safePrior, null, 2) : '';
  const updatedStr = safeUpdated ? JSON.stringify(safeUpdated, null, 2) : '';

  const isObjectDiff = safePrior && safeUpdated && typeof safePrior === 'object' && typeof safeUpdated === 'object' && !Array.isArray(safePrior) && !Array.isArray(safeUpdated);

  let fieldCardsHtml = '';
  if (isObjectDiff) {
    const flattenObj = (obj: any): Record<string, any> => {
      const res: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (INTERNAL_DIFF_KEYS.has(k)) continue;
        if (k === 'content' && v && typeof v === 'object' && !Array.isArray(v)) {
          for (const [ck, cv] of Object.entries(v)) {
            if (!INTERNAL_DIFF_KEYS.has(ck)) res[ck] = cv;
          }
        } else {
          res[k] = v;
        }
      }
      return res;
    };

    const flatPrior = flattenObj(safePrior);
    const flatUpdated = flattenObj(safeUpdated);
    const allKeys = Array.from(new Set([...Object.keys(flatPrior), ...Object.keys(flatUpdated)]));
    const changedKeys = allKeys.filter((k) => JSON.stringify(flatPrior[k]) !== JSON.stringify(flatUpdated[k]));

    if (changedKeys.length > 0) {
      fieldCardsHtml = changedKeys
        .map((k) => {
          const pVal = flatPrior[k];
          const uVal = flatUpdated[k];
          const label = formatFieldName(k);

          const isMultiline = (typeof pVal === 'string' && pVal.includes('\n')) || (typeof uVal === 'string' && uVal.includes('\n'));
          if (isMultiline) {
            return `
              <div class="field-diff-card mb-3" style="border: 1px solid var(--border-default); border-radius: var(--radius-sm); overflow: hidden;">
                <div class="field-diff-header" style="padding: 0.5rem 0.75rem; background: var(--bg-surface); border-bottom: 1px solid var(--border-default); font-size: 0.8125rem; font-weight: 600;">
                  ${escapeHtml(label)}
                </div>
                ${renderLineDiff(typeof pVal === 'string' ? pVal : JSON.stringify(pVal, null, 2) || '', typeof uVal === 'string' ? uVal : JSON.stringify(uVal, null, 2) || '')}
              </div>
            `;
          }

          if (k === 'image' || (pVal && typeof pVal === 'object' && pVal.alt_text !== undefined) || (uVal && typeof uVal === 'object' && uVal.alt_text !== undefined)) {
            const pAlt = pVal?.alt_text || pVal?.altText || 'None';
            const uAlt = uVal?.alt_text || uVal?.altText || 'None';
            const pCap = pVal?.caption || 'None';
            const uCap = uVal?.caption || 'None';
            return `
              <div class="field-diff-card card p-3 mb-3" style="background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-sm);">
                <div style="font-weight: 600; font-size: 0.8125rem; margin-bottom: 0.5rem;">${escapeHtml(label)}</div>
                <div style="display: flex; flex-direction: column; gap: 0.375rem; font-size: 0.8125rem;">
                  <div>
                    <span class="text-secondary">Alt text:</span>
                    <span class="diff-line diff-deletion" style="padding: 0.125rem 0.375rem; margin: 0 0.25rem;"><span class="diff-marker">-</span> ${escapeHtml(pAlt)}</span>
                    <span style="color: var(--fg-muted);">→</span>
                    <span class="diff-line diff-addition" style="padding: 0.125rem 0.375rem; margin: 0 0.25rem;"><span class="diff-marker">+</span> ${escapeHtml(uAlt)}</span>
                  </div>
                  <div>
                    <span class="text-secondary">Caption:</span>
                    <span class="diff-line diff-deletion" style="padding: 0.125rem 0.375rem; margin: 0 0.25rem;"><span class="diff-marker">-</span> ${escapeHtml(pCap)}</span>
                    <span style="color: var(--fg-muted);">→</span>
                    <span class="diff-line diff-addition" style="padding: 0.125rem 0.375rem; margin: 0 0.25rem;"><span class="diff-marker">+</span> ${escapeHtml(uCap)}</span>
                  </div>
                </div>
              </div>
            `;
          }

          if (k === 'testCases' || k === 'test_cases') {
            const pCases = Array.isArray(pVal) ? pVal : [];
            const uCases = Array.isArray(uVal) ? uVal : [];
            return `
              <div class="field-diff-card card p-3 mb-3" style="background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-sm);">
                <div style="font-weight: 600; font-size: 0.8125rem; margin-bottom: 0.5rem;">${escapeHtml(label)} (${uCases.length} cases)</div>
                <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8125rem;">
                  <div>
                    <span class="text-secondary">Prior:</span>
                    <span class="diff-line diff-deletion" style="padding: 0.125rem 0.375rem;"><span class="diff-marker">-</span> ${escapeHtml(JSON.stringify(pCases))}</span>
                  </div>
                  <div>
                    <span class="text-secondary">Updated:</span>
                    <span class="diff-line diff-addition" style="padding: 0.125rem 0.375rem;"><span class="diff-marker">+</span> ${escapeHtml(JSON.stringify(uCases))}</span>
                  </div>
                </div>
              </div>
            `;
          }

          return `
            <div class="field-diff-card card p-3 mb-3" style="background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-sm);">
              <div style="font-weight: 600; font-size: 0.8125rem; margin-bottom: 0.375rem;">${escapeHtml(label)}</div>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; font-size: 0.8125rem;">
                <span class="diff-line diff-deletion" style="padding: 0.125rem 0.5rem; border-radius: var(--radius-sm);"><span class="diff-marker">-</span> ${escapeHtml(formatSimpleValue(pVal))}</span>
                <span style="color: var(--fg-muted);">→</span>
                <span class="diff-line diff-addition" style="padding: 0.125rem 0.5rem; border-radius: var(--radius-sm);"><span class="diff-marker">+</span> ${escapeHtml(formatSimpleValue(uVal))}</span>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }

  const rawLineDiffHtml = renderLineDiff(priorStr, updatedStr);

  return `
    <div class="field-level-diff" role="region" aria-label="Field-level changes">
      ${fieldCardsHtml || rawLineDiffHtml}
      ${
        fieldCardsHtml
          ? `
            <details class="raw-diff-details mt-3 text-secondary" style="font-size: 0.75rem;">
              <summary style="cursor: pointer; padding: 0.25rem 0;">View raw line-by-line comparison</summary>
              <div style="margin-top: 0.5rem;">
                ${rawLineDiffHtml}
              </div>
            </details>
          `
          : ''
      }
    </div>
  `;
}

export function renderAgentActivityPage(opts: AgentActivityPageOptions): string {
  const activities = opts.activities || [];
  const total = opts.totalActivities ?? activities.length;
  const page = opts.currentPage || 1;
  const totalPages = opts.totalPages || Math.ceil(total / 20) || 1;

  let feedbackHtml = '';
  if (opts.feedbackMessage) {
    feedbackHtml = `
      <div class="alert alert-success mb-4" role="status" style="padding: 0.75rem 1rem; background-color: rgba(16, 124, 65, 0.1); border: 1px solid var(--success); border-radius: var(--radius-sm); color: var(--fg-default);">
        ✓ ${escapeHtml(opts.feedbackMessage)}
      </div>
    `;
  }
  if (opts.errorMessage) {
    feedbackHtml = `
      <div class="alert alert-danger mb-4" role="alert" style="padding: 0.75rem 1rem; background-color: rgba(216, 59, 1, 0.1); border: 1px solid var(--danger); border-radius: var(--radius-sm); color: var(--fg-default);">
        ✕ ${escapeHtml(opts.errorMessage)}
      </div>
    `;
  }

  // Filter toolbar
  const filterToolbarHtml = `
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

  // Activity list or empty state
  let tableContent = '';
  if (activities.length === 0) {
    tableContent = `
      <section class="card p-8 text-center empty-state bg-surface border border-subtle rounded-md" aria-label="No activity" style="text-align: center; padding: 3rem 1rem;">
        <h2 class="section-title mb-2 text-lg font-semibold">No recent changes recorded<span class="sr-only"> (No agent activity recorded)</span></h2>
        <p class="text-secondary mb-4 text-sm" style="max-width: 480px; margin-left: auto; margin-right: auto;">
          Changes made by connected tools will appear here with before/after diffs and draft recovery options.
        </p>
        <a href="/teach/${opts.courseId}/content" class="btn btn-primary">Return to editor<span class="sr-only"> (Return to Course Builder)</span></a>
      </section>
    `;
  } else {
    const rowsHtml = activities
      .map((item) => {
        const outcomeBadge = item.outcome === 'success'
          ? '<span class="status-badge success" style="font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 999px; background: rgba(16, 124, 65, 0.15); color: var(--success); font-weight: 600;">Success</span>'
          : '<span class="status-badge danger" style="font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 999px; background: rgba(216, 59, 1, 0.15); color: var(--danger); font-weight: 600;">Failed</span>';

        return `
          <tr class="activity-row" style="border-bottom: 1px solid var(--border-default);">
            <td style="padding: 0.75rem 1rem; font-size: 0.8125rem; color: var(--fg-muted); white-space: nowrap;">
              <time datetime="${escapeHtml(item.createdAt)}" title="${escapeHtml(item.createdAt)}">${escapeHtml(formatActivityDate(item.createdAt))}</time>
            </td>
            <td style="padding: 0.75rem 1rem; font-weight: 500;">
              ${escapeHtml(item.tokenLabel)}
            </td>
            <td style="padding: 0.75rem 1rem;">
              <span class="tool-badge" style="font-family: var(--font-mono); font-size: 0.8125rem;">
                ${escapeHtml(formatToolName(item.toolName))}
              </span>
            </td>
            <td style="padding: 0.75rem 1rem; font-size: 0.875rem; color: var(--fg-default);">
              ${formatAffectedEntities(item.affectedEntities, item.toolName)}
            </td>
            <td style="padding: 0.75rem 1rem; font-family: var(--font-mono); font-size: 0.8125rem; white-space: nowrap;">
              <span class="revision-badge inline-flex items-center font-mono text-xs px-2 py-0.5 rounded bg-raised border border-subtle">
                r${item.baseRevision} → r${item.newRevision}
              </span>
            </td>
            <td style="padding: 0.75rem 1rem;">
              ${outcomeBadge}
            </td>
            <td style="padding: 0.75rem 1rem; text-align: right; white-space: nowrap;">
              <a href="/teach/${opts.courseId}/activity?mutationId=${item.id}" class="btn btn-secondary btn-compact" aria-label="View diff for mutation ${item.id}">View diff</a>
            </td>
          </tr>
        `;
      })
      .join('');

    const cardsHtml = activities
      .map((item) => {
        const outcomeBadge = item.outcome === 'success'
          ? '<span class="status-badge success" style="font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 999px; background: rgba(16, 124, 65, 0.15); color: var(--success); font-weight: 600;">Success</span>'
          : '<span class="status-badge danger" style="font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 999px; background: rgba(216, 59, 1, 0.15); color: var(--danger); font-weight: 600;">Failed</span>';

        return `
          <article class="activity-mobile-card activity-row card p-3" role="listitem" style="background-color: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
              <div style="min-width: 0;">
                <strong style="font-size: 0.9375rem; color: var(--fg-default); display: block; word-break: break-word;">${escapeHtml(item.tokenLabel)}</strong>
                <span class="tool-badge" style="font-family: var(--font-mono); font-size: 0.8125rem; color: var(--accent); font-weight: 600;">
                  ${escapeHtml(formatToolName(item.toolName))}
                </span>
              </div>
              <div style="flex-shrink: 0;">
                ${outcomeBadge}
              </div>
            </div>

            <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.375rem; font-size: 0.8125rem; color: var(--fg-muted); border-top: 1px solid var(--border-subtle); padding-top: 0.375rem;">
              <div>
                <span style="font-family: var(--font-mono); font-weight: 500; color: var(--fg-default);">r${item.baseRevision} → r${item.newRevision}</span>
                <span style="margin: 0 0.25rem;">·</span>
                <time datetime="${escapeHtml(item.createdAt)}" title="${escapeHtml(item.createdAt)}">${escapeHtml(formatActivityDate(item.createdAt))}</time>
              </div>
              <div style="font-size: 0.75rem; color: var(--fg-muted);">
                ${formatAffectedEntities(item.affectedEntities, item.toolName)}
              </div>
            </div>

            <div style="display: flex; justify-content: flex-end; border-top: 1px solid var(--border-subtle); padding-top: 0.375rem;">
              <a href="/teach/${opts.courseId}/activity?mutationId=${item.id}" class="btn btn-secondary btn-compact" aria-label="View diff for mutation ${item.id}">View diff</a>
            </div>
          </article>
        `;
      })
      .join('');

    const paginationHtml = totalPages > 1
      ? `
        <div class="pagination-bar" style="padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-default);">
          <span class="text-secondary text-sm">Showing page ${page} of ${totalPages} (${total} total)</span>
          <div style="display: flex; gap: 0.5rem;">
            ${page > 1 ? `<a href="/teach/${opts.courseId}/activity?page=${page - 1}" class="btn btn-secondary btn-compact">Previous</a>` : ''}
            ${page < totalPages ? `<a href="/teach/${opts.courseId}/activity?page=${page + 1}" class="btn btn-secondary btn-compact">Next</a>` : ''}
          </div>
        </div>
      `
      : '';

    tableContent = `
      <section class="card data-table-card activity-desktop-table" aria-label="Mutation Timeline" style="background-color: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-sm); overflow-x: auto;">
        <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead style="background-color: var(--bg-canvas); border-bottom: 2px solid var(--border-default);">
            <tr>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Time</th>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Connection</th>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Operation</th>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Affected Content</th>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Revision</th>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600;">Outcome</th>
              <th scope="col" style="padding: 0.75rem 1rem; font-size: 0.8125rem; font-weight: 600; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        ${paginationHtml}
      </section>

      <div class="activity-mobile-list" role="list" aria-label="Mutation Timeline Mobile">
        ${cardsHtml}
        ${paginationHtml}
      </div>
    `;
  }

  // Diff Drawer Modal (when selectedMutation is open)
  let diffDrawerHtml = '';
  if (opts.selectedMutation) {
    const sel = opts.selectedMutation;
    const diffContentHtml = renderVisualDiff(sel.priorContent, sel.newContent);

    diffDrawerHtml = `
      <div class="modal-backdrop" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: flex; justify-content: flex-end; z-index: 1000;" role="presentation">
        <aside class="diff-drawer card" role="dialog" aria-modal="true" aria-labelledby="diff-drawer-title" style="width: 100%; max-width: 720px; height: 100vh; overflow-y: auto; background-color: var(--bg-surface); border-left: 1px solid var(--border-default); padding: 1.5rem; display: flex; flex-direction: column;">
          <header class="drawer-header mb-3" style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border-default); padding-bottom: 1rem;">
            <div>
              <h2 id="diff-drawer-title" class="section-title" style="font-size: 1.25rem; margin: 0 0 0.25rem 0;">
                Mutation Diff — ${escapeHtml(formatToolName(sel.toolName))}
              </h2>
              <p class="text-secondary" style="font-size: 0.8125rem; margin: 0;">
                Applied by <strong>${escapeHtml(sel.tokenLabel)}</strong> · <time datetime="${escapeHtml(sel.createdAt)}" title="${escapeHtml(sel.createdAt)}">${escapeHtml(formatActivityDate(sel.createdAt))}</time>
              </p>
            </div>
            <a href="/teach/${opts.courseId}/activity" class="btn btn-ghost btn-compact" aria-label="Close diff drawer">✕</a>
          </header>

          <div class="drawer-meta mb-3" style="display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.8125rem; background: var(--bg-canvas); padding: 0.75rem; border-radius: var(--radius-sm);">
            <div><strong>Revision bump:</strong> <code>r${sel.baseRevision} → r${sel.newRevision}</code></div>
            <div><strong>Status:</strong> ${sel.outcome}</div>
          </div>

          <details class="drawer-technical-details mb-3 text-secondary" style="font-size: 0.75rem; background: var(--bg-canvas); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm);">
            <summary style="cursor: pointer; font-weight: 500;">Technical identifiers</summary>
            <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem;">
              <div><strong>Correlation ID:</strong> <code>${escapeHtml(sel.correlationId || 'N/A')}</code></div>
              <div><strong>Idempotency key:</strong> <code>${escapeHtml(sel.idempotencyKey || 'N/A')}</code></div>
              <div><strong>Mutation ID:</strong> <code>${escapeHtml(sel.id)}</code></div>
            </div>
          </details>

          <section class="affected-entities-section mb-3" aria-label="Affected Entities">
            <h3 style="font-size: 0.9375rem; margin-bottom: 0.5rem;">Affected Content</h3>
            <p class="text-secondary" style="font-size: 0.875rem;">${formatAffectedEntities(sel.affectedEntities, sel.toolName)}</p>
          </section>

          <section class="visual-diff-section mb-4" aria-label="Visual Diff" style="flex: 1;">
            <h3 style="font-size: 0.9375rem; margin-bottom: 0.5rem;">Before / After Comparison</h3>
            ${diffContentHtml}
          </section>

          <footer class="drawer-footer" style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-default); padding-top: 1rem; flex-wrap: wrap; gap: 0.75rem;">
            <a href="/teach/${opts.courseId}/activity" class="btn btn-secondary">Close drawer</a>
            ${
              opts.recoveryError
                ? `
                  <span class="recovery-retention-notice text-danger" id="recovery-fetch-error-msg" style="font-size: 0.8125rem;">
                    Unable to check recovery snapshots: ${escapeHtml(opts.recoveryError)}
                  </span>
                `
                : opts.recoveryRevisions === undefined || (opts.recoveryRevisions || []).some((r) => r.revisionNumber === sel.baseRevision)
                ? `
                  <a href="/teach/${opts.courseId}/activity?mutationId=${sel.id}&restore=true" class="btn btn-danger" id="restore-prior-btn">
                    Restore prior version (r${sel.baseRevision})
                  </a>
                `
                : `
                  <span class="recovery-retention-notice text-secondary" id="recovery-unavailable-msg" style="font-size: 0.8125rem;">
                    Recovery snapshot not retained for Revision ${sel.baseRevision}. Snapshots are preserved before batch operations and structural changes (retained for 30 days).
                  </span>
                `
            }
          </footer>
        </aside>
      </div>
    `;
  }

  // Restore Confirmation Modal
  let restoreModalHtml = '';
  if (opts.showRestoreConfirmModal && opts.selectedMutation) {
    const sel = opts.selectedMutation;
    const matchingRecovery = opts.recoveryRevisions === undefined
      ? { id: sel.id, revisionNumber: sel.baseRevision }
      : (opts.recoveryRevisions || []).find((r) => r.revisionNumber === sel.baseRevision);

    if (opts.recoveryError) {
      restoreModalHtml = `
        <div class="modal-backdrop" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1100;" role="presentation">
          <div class="modal-card card p-4" role="alertdialog" aria-modal="true" aria-labelledby="restore-modal-title" style="max-width: 540px; width: 90%; background-color: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-md);">
            <header class="mb-3">
              <h2 id="restore-modal-title" class="modal-title text-danger" style="font-size: 1.25rem; margin: 0 0 0.5rem 0;">
                Recovery Service Unavailable
              </h2>
              <p class="text-secondary" style="font-size: 0.875rem;">
                Could not verify draft recovery snapshots: ${escapeHtml(opts.recoveryError)}.
              </p>
            </header>
            <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
              <a href="/teach/${opts.courseId}/activity?mutationId=${sel.id}" class="btn btn-secondary" id="close-unavailable-restore-btn">Close</a>
            </div>
          </div>
        </div>
      `;
    } else if (matchingRecovery) {
      const currentRev = opts.currentDraftRevision ?? sel.newRevision;
      const nextRev = currentRev + 1;
      restoreModalHtml = `
        <div class="modal-backdrop" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1100;" role="presentation">
          <div class="modal-card card p-4" role="alertdialog" aria-modal="true" aria-labelledby="restore-modal-title" style="max-width: 540px; width: 90%; background-color: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-md);">
            <header class="mb-3">
              <h2 id="restore-modal-title" class="modal-title text-danger" style="font-size: 1.25rem; margin: 0 0 0.5rem 0;">
                Restore Previous Draft Revision?
              </h2>
              <p class="text-secondary" style="font-size: 0.875rem;">
                You are about to restore this course draft to <strong>Revision ${sel.baseRevision}</strong>.
              </p>
            </header>

            ${
              opts.restoreConflict
                ? `
                  <div id="restore-conflict-msg" class="restore-conflict-alert mb-3" role="alert" aria-live="assertive" style="background: rgba(216, 59, 1, 0.1); border: 1px solid var(--danger); border-radius: var(--radius-sm); padding: 0.75rem 1rem;">
                    <strong style="color: var(--danger); display: block; margin-bottom: 0.25rem;">Revision Conflict (Concurrent modification detected)</strong>
                    <p style="margin: 0 0 0.5rem 0; font-size: 0.875rem; color: var(--fg-default);">
                      ${escapeHtml(opts.restoreConflict.message || 'The course draft has been modified since it was loaded. Please review changes before restoring.')}
                    </p>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                      <a href="/teach/${escapeHtml(opts.courseId)}/activity" id="btn-reload-current-revision" class="btn btn-secondary btn-compact">Reload latest draft state</a>
                    </div>
                  </div>
                `
                : ''
            }

            <div class="restore-explanation mb-4" style="background: var(--bg-canvas); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.875rem; line-height: 1.5;">
              <p style="margin: 0 0 0.75rem 0;">
                This operation will restore content from prior snapshot and create a <strong>new draft revision</strong> (Revision ${nextRev}).
              </p>
              <p class="text-warning" style="font-weight: 600; margin: 0;">
                Published versions, student progress, and live access settings won't be rolled back.
              </p>
            </div>

            <form method="POST" action="/api/author/courses/${opts.courseId}/recovery/${matchingRecovery.id}/restore">
              <input type="hidden" name="expectedRevision" value="${currentRev}" />
              <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                <a href="/teach/${opts.courseId}/activity?mutationId=${sel.id}" class="btn btn-secondary" id="cancel-restore-btn">Cancel</a>
                <button type="submit" class="btn btn-danger" id="confirm-restore-btn" ${opts.restoreConflict ? 'disabled' : ''}>Confirm restore</button>
              </div>
            </form>
          </div>
        </div>
      `;
    } else {
      restoreModalHtml = `
        <div class="modal-backdrop" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1100;" role="presentation">
          <div class="modal-card card p-4" role="alertdialog" aria-modal="true" aria-labelledby="restore-modal-title" style="max-width: 540px; width: 90%; background-color: var(--bg-surface); border: 1px solid var(--border-default); border-radius: var(--radius-md);">
            <header class="mb-3">
              <h2 id="restore-modal-title" class="modal-title" style="font-size: 1.25rem; margin: 0 0 0.5rem 0;">
                Recovery Snapshot Unavailable
              </h2>
              <p class="text-secondary" style="font-size: 0.875rem;">
                No recovery snapshot is retained for <strong>Revision ${sel.baseRevision}</strong>. Snapshots are preserved before batch operations and structural changes (retained for 30 days).
              </p>
            </header>
            <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
              <a href="/teach/${opts.courseId}/activity?mutationId=${sel.id}" class="btn btn-secondary" id="close-unavailable-restore-btn">Close</a>
            </div>
          </div>
        </div>
      `;
    }
  }

  const contentHtml = `
    <div class="agent-activity-container" style="max-width: 1100px; margin: 0 auto; padding: 1rem 0.75rem;">
      <header class="page-header mb-4 pb-3 border-b border-subtle">
        <h1 class="page-title text-2xl font-bold tracking-tight">Recent changes<span class="sr-only"> (Agent Activity)</span></h1>
        <p class="text-secondary text-sm hidden-mobile mt-1">
          Changes made by connected tools.
        </p>
      </header>

      ${feedbackHtml}
      ${filterToolbarHtml}
      ${tableContent}
      ${diffDrawerHtml}
      ${restoreModalHtml}
    </div>
  `;

  return renderAuthorWorkspaceShell({
    courseId: opts.courseId,
    courseTitle: opts.courseTitle,
    publicationState: opts.publicationState,
    hasUnpublishedChanges: opts.hasUnpublishedChanges,
    activeTab: 'content',
    showTree: false,
    editorContent: contentHtml,
  });
}
