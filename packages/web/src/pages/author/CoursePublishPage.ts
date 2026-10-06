import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';
import type { CourseValidationResult, PublicationReceipt, ValidationErrorItem } from 'zur-shared';

export interface CoursePublishPageOptions {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  draftRevision: number;
  currentVersionNumber?: number | null;
  newVersionNumber: number;
  activeEnrolledStudents: number;
  validation: CourseValidationResult;
  visibility?: 'public' | 'unlisted' | 'private';
  enrollmentPolicy?: 'open' | 'invitation_only';
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'conflict';
  receipt?: PublicationReceipt | null;
  staleRevision?: boolean;
  showConfirmModal?: boolean;
  stepTypeMap?: Record<string, string>;
  modules?: any[];
  stepTitleMap?: Record<string, string>;
}

const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

export function getStepEditorUrl(courseId: string, stepId: string, stepTypeMap?: Record<string, string>): string {
  const stepType = stepTypeMap?.[stepId];
  if (stepType && ['theory', 'video', 'quiz', 'python'].includes(stepType)) {
    return `/teach/${encodeURIComponent(courseId)}/content/${encodeURIComponent(stepType)}/${encodeURIComponent(stepId)}`;
  }
  return `/teach/${encodeURIComponent(courseId)}/content?type=step&id=${encodeURIComponent(stepId)}`;
}

function getStepTitle(stepId: string, opts: CoursePublishPageOptions): string {
  if (opts.stepTitleMap?.[stepId]) return opts.stepTitleMap[stepId];
  if (opts.modules) {
    for (const m of opts.modules) {
      for (const l of m.lessons || []) {
        for (const s of l.steps || []) {
          if (s.id === stepId && s.title) return s.title;
        }
      }
    }
  }
  return 'Exercise';
}

interface ExerciseGroup {
  stepId: string;
  stepType: string;
  title: string;
  baseEditorUrl: string;
  testEditorUrl: string;
  issues: ValidationErrorItem[];
}

export function renderCoursePublishPage(opts: CoursePublishPageOptions): string {
  const isInitialRelease = !opts.currentVersionNumber;
  const publishButtonLabel = isInitialRelease
    ? 'Publish course'
    : `Publish Version ${opts.newVersionNumber}`;

  // Release Receipt view
  if (opts.receipt) {
    const receiptContent = `
      <div class="publish-review-container" style="max-width: 800px; margin: 0 auto; padding: 2rem 1rem;">
        <header class="mb-4">
          <div class="breadcrumbs mb-2">
            <a href="/teach/${encodeURIComponent(opts.courseId)}/content">← Back to Course Builder</a>
          </div>
          <h1 class="page-title">Publication Receipt</h1>
          <p class="text-secondary mt-1">Your changes are released and recorded as Version ${opts.receipt.versionNumber}.</p>
        </header>

        <section class="card p-4 receipt-card" aria-label="Release Information" style="border: 1px solid var(--success); background-color: var(--bg-surface);">
          <div class="receipt-header mb-3" style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="status-badge success" style="font-size: 0.875rem;">Released Version ${opts.receipt.versionNumber}</span>
            <span class="text-muted" style="font-size: 0.8125rem;">${escapeHtml(opts.receipt.publishedAt)}</span>
          </div>

          <div class="receipt-details mb-4">
            <p><strong>Version ID:</strong> <code>${escapeHtml(opts.receipt.versionId)}</code></p>
            <p class="text-secondary mt-1">
              Active enrolled students continuing on earlier releases: <strong>${opts.receipt.studentCountPinnedToOldVersions}</strong>
            </p>
          </div>

          <div class="receipt-actions" style="display: flex; gap: 1rem;">
            <a href="/teach/${encodeURIComponent(opts.courseId)}/content" class="btn btn-secondary">Back to editor</a>
            <a href="/teach/${encodeURIComponent(opts.courseId)}/preview" class="btn btn-secondary">View course</a>
            <a href="/teach/${encodeURIComponent(opts.courseId)}/students" class="btn btn-primary">Invite students</a>
          </div>
        </section>
      </div>
    `;

    return renderAuthorWorkspaceShell({
      courseId: opts.courseId,
      courseTitle: opts.courseTitle,
      publicationState: 'published',
      hasUnpublishedChanges: false,
      activeTab: 'content',
      isPublishPage: true,
      editorContent: receiptContent,
    });
  }

  // Pre-publish validation review view
  const errors = opts.validation.errors || [];
  const warnings = opts.validation.warnings || [];
  const hasBlockingErrors = errors.length > 0;

  // Group errors into named exercise containers
  const groupMap = new Map<string, ExerciseGroup>();
  for (const err of errors) {
    const sId = err.stepId || 'general';
    if (!groupMap.has(sId)) {
      const sType = opts.stepTypeMap?.[sId] || (sId.includes('python') ? 'python' : 'step');
      const title = sId === 'general' ? 'General Course Requirements' : getStepTitle(sId, opts);
      const baseEditorUrl = sId === 'general'
        ? `/teach/${encodeURIComponent(opts.courseId)}/settings`
        : getStepEditorUrl(opts.courseId, sId, opts.stepTypeMap);
      const testEditorUrl = `${baseEditorUrl}${sType === 'python' ? '?tab=tests' : ''}`;

      groupMap.set(sId, {
        stepId: sId,
        stepType: sType,
        title,
        baseEditorUrl,
        testEditorUrl,
        issues: [],
      });
    }
    groupMap.get(sId)!.issues.push(err);
  }
  const exerciseGroups = Array.from(groupMap.values());

  const exerciseGroupsHtml = exerciseGroups.map(grp => `
    <div class="issue-exercise-group card mb-3 p-0 overflow-hidden" data-step-id="${grp.stepId}">
      <div class="issue-exercise-header p-3 bg-surface border-b border-subtle flex justify-between items-center">
        <div class="flex items-center gap-2">
          <span class="badge neutral text-xs font-mono uppercase">${escapeHtml(grp.stepType)}</span>
          <h3 class="exercise-group-title text-sm font-semibold m-0">${escapeHtml(grp.title)}</h3>
        </div>
        <div class="exercise-actions flex items-center gap-2">
          <a href="${grp.testEditorUrl}" class="btn btn-secondary btn-compact text-xs font-medium" id="edit-tests-${grp.stepId}">
            Edit tests →
          </a>
          <a href="${grp.baseEditorUrl}" class="jump-link text-xs text-secondary" style="text-decoration: underline;">
            Edit step →
          </a>
        </div>
      </div>
      <div class="issue-exercise-body p-3">
        <ul class="exercise-issues-list flex flex-col gap-2 m-0 p-0 list-none">
          ${grp.issues.map(err => {
            const isServiceFailure = err.message.includes('INTERNAL_ERROR') || err.message.toLowerCase().includes('timeout');
            return `
              <li class="issue-row ${isServiceFailure ? 'service-failure' : 'failed-assertion'} p-2 rounded bg-hover text-sm">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <span class="text-danger font-bold" aria-hidden="true">✕</span>
                    ${isServiceFailure
                      ? `<strong class="text-danger font-medium">Validation couldn't run</strong> <span class="badge danger text-xs">Service failure</span>`
                      : `<span class="issue-message text-primary">${escapeHtml(err.message)}</span> <span class="badge warning text-xs">Failed assertion</span>`
                    }
                  </div>
                </div>
                <details class="issue-diagnostics text-xs text-muted mt-1.5 ml-5">
                  <summary class="cursor-pointer text-secondary font-medium">Diagnostic details (code &amp; IDs)</summary>
                  <div class="diagnostic-payload font-mono mt-1 p-2 bg-surface rounded text-xs border border-subtle">
                    <div><strong>Step ID:</strong> ${escapeHtml(grp.stepId)}</div>
                    <div><strong>Target:</strong> ${escapeHtml(err.field || 'testCases')}</div>
                    <div><strong>Diagnostic error:</strong> <code class="text-danger">${escapeHtml(err.message)}</code></div>
                  </div>
                </details>
              </li>
            `;
          }).join('')}
        </ul>
      </div>
    </div>
  `).join('');

  const errorsHtml = hasBlockingErrors
    ? `
      <section class="card mb-4 p-4 border-danger" aria-label="Blocking Validation Errors" style="border-left: 4px solid var(--danger);">
        <div class="flex justify-between items-center mb-2">
          <div>
            <h2 class="section-title text-danger m-0" style="font-size: 1.125rem;">
              Blocking issues (${errors.length})
            </h2>
            <span class="text-secondary text-xs mt-0.5 block">${exerciseGroups.length} ${exerciseGroups.length === 1 ? 'exercise needs' : 'exercises need'} review</span>
          </div>
          <a href="/teach/${encodeURIComponent(opts.courseId)}/publish" class="btn btn-secondary btn-compact text-xs" id="retry-validation-btn" data-action="retry-validation" onclick="window.location.reload();">Retry validation</a>
        </div>
        <p class="text-secondary mb-3 text-xs">Fix blocking issues before publishing.</p>

        <div class="exercise-groups-list">
          ${exerciseGroupsHtml}
        </div>
      </section>
    `
    : `
      <section class="status-strip mb-4 p-3 bg-surface border border-subtle rounded-md" aria-label="Pre-publish Checklist Passed" style="border-left: 4px solid var(--success);">
        <p class="text-success m-0" style="font-weight: 600;">✓ Pre-publish checklist passed with 0 blocking errors</p>
      </section>
    `;

  const warningsHtml =
    warnings.length > 0
      ? `
      <section class="card mb-4 p-4" aria-label="Nonblocking Warnings" style="border-left: 4px solid var(--warning);">
        <h2 class="section-title text-warning mb-2" style="font-size: 1.125rem;">
          Warnings (${warnings.length})
        </h2>
        <p class="text-secondary mb-3">These items will not block publication, but reviewing them is recommended.</p>
        <ul class="issues-list" style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;">
          ${warnings
            .map((w) => {
              const jumpUrl = getStepEditorUrl(opts.courseId, w.stepId, opts.stepTypeMap);
              const jumpLink = w.stepId
                ? `<a href="${jumpUrl}" class="jump-link" style="margin-left: 0.5rem; text-decoration: underline;">Edit step →</a>`
                : '';
              return `
                <li class="issue-item warning" style="padding: 0.5rem 0.75rem; background-color: var(--bg-hover); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span class="text-warning" style="font-weight: 600; margin-right: 0.5rem;">⚠</span>
                    <span>${escapeHtml(w.message)}</span>
                  </div>
                  ${jumpLink}
                </li>
              `;
            })
            .join('')}
        </ul>
      </section>
    `
      : '';

  const staleRevisionHtml = opts.staleRevision
    ? `
      <div class="alert alert-warning mb-4" role="alert" style="border-left: 4px solid var(--warning); padding: 1rem; background-color: var(--bg-hover);">
        <h3 style="margin-top: 0; margin-bottom: 0.25rem;">Stale Revision Detected</h3>
        <p class="mb-2">The course draft was modified concurrently. Please reload to review the latest changes before publishing.</p>
        <a href="/teach/${encodeURIComponent(opts.courseId)}/publish" class="btn btn-secondary btn-compact">Revalidate current draft</a>
      </div>
    `
    : '';

  const confirmModalHtml = opts.showConfirmModal
    ? `
      <div class="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="publish-dialog-title" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; z-index: 1100;">
        <div class="dialog-card p-4" style="background-color: var(--bg-surface); border: 1px solid var(--border-control); border-radius: var(--radius-lg); max-width: 500px; width: 90%;">
          <h2 id="publish-dialog-title" class="mb-2" style="font-size: 1.25rem;">Confirm Publication</h2>
          <p class="text-secondary mb-3">
            Publishing releases Version ${opts.newVersionNumber}.
            Existing students will continue on their enrolled version.
          </p>
          <div class="dialog-actions" style="display: flex; justify-content: flex-end; gap: 0.75rem;">
            <button type="button" id="publish-cancel-confirm" class="btn btn-secondary">Cancel</button>
            <button type="button" id="publish-confirm-submit" class="btn btn-primary">${escapeHtml(publishButtonLabel)}</button>
          </div>
        </div>
      </div>
    `
    : '';

  const visibilityLabel =
    opts.visibility === 'public'
      ? 'Public'
      : opts.visibility === 'unlisted'
      ? 'Unlisted'
      : 'Private';

  const enrollmentPolicyLabel =
    opts.enrollmentPolicy === 'open'
      ? 'Open enrollment'
      : 'Invitation only';

  const editorContent = `
    <div class="publish-review-container" style="max-width: 800px; margin: 0 auto; padding: 1.5rem 1rem;">
      <header class="publish-header mb-4">
        <div class="breadcrumbs mb-2">
          <a href="/teach/${encodeURIComponent(opts.courseId)}/content">← Back to Course Builder</a>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 class="page-title">Review publication</h1>
            <p class="text-secondary mt-1">Validate the saved draft, review issues, and confirm version release impact.</p>
          </div>
          <div class="revision-badge">
            <span class="status-badge" style="background-color: var(--bg-hover);">Draft Rev ${opts.draftRevision}</span>
          </div>
        </div>
      </header>

      <nav class="author-workflow-nav mb-3 text-xs" aria-label="Authoring lifecycle">
        <ol class="workflow-steps flex gap-1 list-none p-0 m-0 text-muted" style="list-style: none">
          <li><a href="/teach/${encodeURIComponent(opts.courseId)}/settings" class="text-secondary">1. Basics</a> →</li>
          <li><a href="/teach/${encodeURIComponent(opts.courseId)}/content" class="text-secondary">2. Structure</a> →</li>
          <li><a href="/teach/${encodeURIComponent(opts.courseId)}/content" class="text-secondary">3. Build steps</a> →</li>
          <li><a href="/teach/${encodeURIComponent(opts.courseId)}/preview" class="text-secondary">4. Preview</a> →</li>
          <li class="font-semibold text-primary">5. Publish</li>
        </ol>
      </nav>

      <div class="next-action-callout mb-3 p-2 bg-surface border border-subtle rounded text-xs flex items-center justify-between">
        <div>
          <strong>Next action:</strong>
          <span class="text-secondary ml-1">${hasBlockingErrors ? `Resolve ${errors.length} blocking issue${errors.length === 1 ? '' : 's'} before releasing Version ${opts.newVersionNumber}.` : `Pre-publish checklist passed. Click "${escapeHtml(publishButtonLabel)}" to release.`}</span>
        </div>
      </div>

      ${staleRevisionHtml}
      ${errorsHtml}
      ${warningsHtml}

      <section class="card p-4 publish-impact-card" aria-label="Version and Access Impact" style="background-color: var(--bg-surface);">
        <h2 class="section-title mb-3" style="font-size: 1.125rem;">Release impact</h2>
        <div class="impact-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
          <div class="impact-item">
            <span class="text-secondary text-sm">Release version</span>
            <div class="font-semibold text-lg">Version ${opts.newVersionNumber}</div>
            <span class="text-muted text-xs">${isInitialRelease ? 'Initial release' : `Current published version: Version ${opts.currentVersionNumber}`}</span>
          </div>
          <div class="impact-item">
            <span class="text-secondary text-sm">Active enrolled students</span>
            <div class="font-semibold text-lg">${opts.activeEnrolledStudents}</div>
            <span class="text-muted text-xs">Pinned to their current version</span>
          </div>
          <div class="impact-item">
            <span class="text-secondary text-sm">Visibility &amp; enrollment</span>
            <div class="font-semibold text-base">${visibilityLabel}</div>
            <span class="text-muted text-xs">${enrollmentPolicyLabel}</span>
          </div>
        </div>
        <p class="text-secondary text-xs mt-3">Existing students will continue on their current version. New enrollments will receive this update.</p>
      </section>

      <div class="publish-action-bar mt-4" style="display: flex; justify-content: flex-end; gap: 0.75rem;">
        <a href="/teach/${encodeURIComponent(opts.courseId)}/content" class="btn btn-secondary">Back to editor</a>
        <button
          type="button"
          id="publish-open-confirm"
          class="btn btn-primary"
          ${hasBlockingErrors || opts.staleRevision ? 'disabled aria-disabled="true"' : ''}
        >
          ${escapeHtml(publishButtonLabel)}
        </button>
      </div>

      ${confirmModalHtml}
    </div>
  `;

  return renderAuthorWorkspaceShell({
    courseId: opts.courseId,
    courseTitle: opts.courseTitle,
    publicationState: opts.publicationState,
    hasUnpublishedChanges: opts.hasUnpublishedChanges,
    saveStatusText: opts.saveStatus === 'saved' ? 'Saved' : undefined,
    activeTab: 'content',
    isPublishPage: true,
    editorContent,
  });
}
