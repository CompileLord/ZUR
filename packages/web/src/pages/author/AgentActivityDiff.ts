import { escapeHtml } from './AgentActivityFormat.ts';

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

export function renderVisualDiff(prior: any, updated: any): string {
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
