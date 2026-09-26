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
          <p class="text-secondary mt-1">Your changes have been recorded into an immutable version snapshot.</p>
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
      <section class="card mb-4 p-3" aria-label="Pre-publish Checklist Passed" style="border-left: 4px solid var(--success);">
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
            Publishing creates an immutable snapshot (Version ${opts.newVersionNumber}).
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

      <!-- Course Summary -->
      <section class="card mb-4 p-4" aria-label="Course Summary" style="background-color: var(--bg-surface); border: 1px solid var(--border-subtle);">
        <h2 class="section-title mb-3" style="font-size: 1.125rem;">Course Summary</h2>
        <div class="summary-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
          <div>
            <span class="text-muted" style="font-size: 0.75rem; text-transform: uppercase;">Course Title</span>
            <p style="font-weight: 600; margin: 0.25rem 0 0;">${escapeHtml(opts.courseTitle)}</p>
          </div>
          <div>
            <span class="text-muted" style="font-size: 0.75rem; text-transform: uppercase;">Discoverability</span>
            <p style="font-weight: 600; margin: 0.25rem 0 0; text-transform: capitalize;">${opts.visibility || 'Private'}</p>
          </div>
          <div>
            <span class="text-muted" style="font-size: 0.75rem; text-transform: uppercase;">Enrollment Policy</span>
            <p style="font-weight: 600; margin: 0.25rem 0 0; text-transform: capitalize;">${(opts.enrollmentPolicy || 'invitation_only').replace('_', ' ')}</p>
          </div>
        </div>
      </section>

      <!-- Version Impact Summary (PRD §9, design P27) -->
      <section class="card mb-4 p-4 impact-card" aria-label="Version Impact Statement" style="background-color: var(--bg-surface); border: 1px solid var(--border-subtle);">
        <h2 class="section-title mb-2" style="font-size: 1.125rem;">Version Impact Summary</h2>
        <p class="impact-statement mb-3" style="font-size: 0.9375rem; line-height: 1.5;">
          <strong>Existing students will continue on their current version. New enrollments will receive this update.</strong>
        </p>
        <div class="impact-metrics" style="display: flex; gap: 2rem; border-top: 1px solid var(--border-subtle); padding-top: 1rem;">
          <div>
            <span class="text-muted" style="font-size: 0.8125rem;">Current published version:</span>
            <span style="font-weight: 600; margin-left: 0.5rem;">${opts.currentVersionNumber ? `Version ${opts.currentVersionNumber}` : 'None (Initial release)'}</span>
          </div>
          <div>
            <span class="text-muted" style="font-size: 0.8125rem;">New version to publish:</span>
            <span style="font-weight: 600; margin-left: 0.5rem; color: var(--accent);">Version ${opts.newVersionNumber}</span>
          </div>
          <div>
            <span class="text-muted" style="font-size: 0.8125rem;">Active enrolled students:</span>
            <span style="font-weight: 600; margin-left: 0.5rem;">${opts.activeEnrolledStudents}</span>
          </div>
        </div>
      </section>

      <!-- Publication Action Bar -->
      <footer class="publish-actions-footer card p-4" style="background-color: var(--bg-surface); border: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
        <div>
          ${
            hasBlockingErrors
              ? '<span class="text-danger" style="font-size: 0.875rem;">Fix blocking issues before publishing.</span>'
              : '<span class="text-secondary" style="font-size: 0.875rem;">Ready to publish immutable release snapshot.</span>'
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
    saveStatusText: opts.saveStatus === 'saving' ? 'Saving...' : 'Saved',
    activeTab: 'content',
    editorContent,
  });
}
