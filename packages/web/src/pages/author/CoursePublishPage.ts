import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';
import type { CourseValidationResult, PublicationReceipt } from 'zur-shared';

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
}

const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

export function renderCoursePublishPage(opts: CoursePublishPageOptions): string {
  const isInitialRelease = !opts.currentVersionNumber;
  const publishButtonLabel = isInitialRelease
    ? 'Publish course'
    : `Publish Version ${opts.newVersionNumber}`;

  // If receipt is provided, render Release Receipt view
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
      editorContent: receiptContent,
    });
  }

  // Pre-publish validation review view
  const errors = opts.validation.errors || [];
  const warnings = opts.validation.warnings || [];
  const hasBlockingErrors = errors.length > 0;

  const errorsHtml = hasBlockingErrors
    ? `
      <section class="card mb-4 p-4 border-danger" aria-label="Blocking Validation Errors" style="border-left: 4px solid var(--danger);">
        <h2 class="section-title text-danger mb-2" style="font-size: 1.125rem;">
          Blocking issues (${errors.length})
        </h2>
        <p class="text-secondary mb-3">All blocking issues must be resolved before this draft can be published.</p>
        <ul class="issues-list" style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;">
          ${errors
            .map((err) => {
              const jumpLink = err.stepId
                ? `<a href="/teach/${encodeURIComponent(opts.courseId)}/content" class="jump-link" style="margin-left: 0.5rem; text-decoration: underline;">Edit step →</a>`
                : '';
              return `
                <li class="issue-item error" style="padding: 0.5rem 0.75rem; background-color: var(--bg-hover); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span class="text-danger" style="font-weight: 600; margin-right: 0.5rem;">✕</span>
                    <span>${escapeHtml(err.message)}</span>
                  </div>
                  ${jumpLink}
                </li>
              `;
            })
            .join('')}
        </ul>
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
            .map(
              (w) => `
            <li class="issue-item warning" style="padding: 0.5rem 0.75rem; background-color: var(--bg-hover); border-radius: var(--radius-sm);">
              <span class="text-warning" style="font-weight: 600; margin-right: 0.5rem;">⚠</span>
              <span>${escapeHtml(w.message)}</span>
            </li>
          `
            )
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
            <p class="text-secondary mt-1">Validate the saved draft, review issues and warnings, and confirm the version impact.</p>
          </div>
          <div class="revision-badge">
            <span class="status-badge" style="background-color: var(--bg-hover);">Draft Rev ${opts.draftRevision}</span>
          </div>
        </div>
      </header>

      ${staleRevisionHtml}
      ${errorsHtml}
      ${warningsHtml}

      <!-- Course Summary (Definition List) -->
      <section class="publish-summary-section mb-6" aria-label="Course Summary">
        <h2 class="section-title mb-3 text-base font-semibold">Course summary</h2>
        <dl class="summary-definition-list grid grid-cols-1 sm:grid-cols-3 gap-4" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 0;">
          <div>
            <dt class="text-muted text-xs font-medium">Course title</dt>
            <dd class="font-semibold text-sm mt-1 text-primary" style="margin: 0.25rem 0 0;">${escapeHtml(opts.courseTitle)}</dd>
          </div>
          <div>
            <dt class="text-muted text-xs font-medium">Discoverability</dt>
            <dd class="font-semibold text-sm mt-1 text-primary" style="margin: 0.25rem 0 0;">${escapeHtml(visibilityLabel)}</dd>
          </div>
          <div>
            <dt class="text-muted text-xs font-medium">Enrollment policy</dt>
            <dd class="font-semibold text-sm mt-1 text-primary" style="margin: 0.25rem 0 0;">${escapeHtml(enrollmentPolicyLabel)}</dd>
          </div>
        </dl>
      </section>

      <hr class="section-divider my-6" />

      <!-- Version Impact Summary (PRD §9, design P27) -->
      <section class="publish-impact-section mb-6 impact-card" aria-label="Version Impact Statement">
        <div class="flex items-center gap-3 mb-2">
          <h2 class="section-title text-base font-semibold m-0">Version impact summary</h2>
          <span class="version-delta-badge inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded bg-raised border border-subtle">
            ${opts.currentVersionNumber ? `v${opts.currentVersionNumber}` : 'draft'} → v${opts.newVersionNumber}
          </span>
        </div>
        <p class="impact-statement mb-3 text-sm text-secondary" style="line-height: 1.5;">
          <strong>Existing students will continue on their current version. New enrollments will receive this update.</strong>
        </p>
        <div class="impact-metrics flex flex-wrap gap-6 pt-3 border-t border-subtle text-sm">
          <div>
            <span class="text-muted text-xs">Current published version:</span>
            <span class="font-semibold ml-1 text-secondary">${opts.currentVersionNumber ? `Version ${opts.currentVersionNumber}` : 'None (Initial release)'}</span>
          </div>
          <div>
            <span class="text-muted text-xs">New version to publish:</span>
            <span class="font-semibold ml-1 text-accent">Version ${opts.newVersionNumber}</span>
          </div>
          <div>
            <span class="text-muted text-xs">Active enrolled students:</span>
            <span class="font-semibold ml-1 text-secondary">${opts.activeEnrolledStudents}</span>
          </div>
        </div>
      </section>

      <!-- Publication Action Bar (Sticky) -->
      <footer class="publish-actions-footer p-4 sticky bottom-0 z-10 bg-raised border-t border-subtle flex justify-between items-center rounded-lg shadow-sm">
        <div>
          ${
            hasBlockingErrors
              ? '<span class="text-danger text-sm font-medium">Fix blocking issues before publishing.</span>'
              : '<span class="text-secondary text-sm">Ready to publish.</span>'
          }
        </div>
        <form id="publish-form" style="margin: 0;">
          <input type="hidden" name="expectedRevision" value="${opts.draftRevision}" />
          <button
            type="button"
            id="publish-open-confirm"
            class="btn btn-primary"
            ${hasBlockingErrors ? 'disabled aria-disabled="true"' : ''}
          >
            ${publishButtonLabel}
          </button>
        </form>
      </footer>

      ${confirmModalHtml}
    </div>
  `;

  return renderAuthorWorkspaceShell({
    courseId: opts.courseId,
    courseTitle: opts.courseTitle,
    publicationState: opts.publicationState,
    hasUnpublishedChanges: opts.hasUnpublishedChanges,
    saveStatusText: opts.saveStatus === 'saving' ? 'Saving...' : undefined,
    activeTab: 'content',
    editorContent,
  });
}
