export interface HelpPageProps {
  courseId?: string;
  courseVersionId?: string;
  stepId?: string;
  type?: string;
  description?: string;
  includeCode?: boolean;
  isReportModalOpen?: boolean;
  isSubmittingReport?: boolean;
  reportSuccessReference?: string | null;
  reportError?: string | null;
}

export function renderHelpPage(props: HelpPageProps = {}): string {
  const {
    courseId = '',
    courseVersionId = '',
    stepId = '',
    type = 'broken_exercise',
    description = '',
    includeCode = false,
    isReportModalOpen = false,
    isSubmittingReport = false,
    reportSuccessReference = null,
    reportError = null,
  } = props;

  const reportModalHtml = `
    <div
      id="report-issue-modal"
      class="report-modal ${isReportModalOpen ? 'open' : ''}"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      style="${isReportModalOpen ? 'display: flex;' : 'display: none;'}"
    >
      <div class="sheet-backdrop" data-action="close-report"></div>
      <div class="sheet-panel max-w-dialog" tabindex="-1">
        <div class="sheet-header flex justify-between items-center pb-3 border-b border-subtle">
          <h2 id="report-modal-title" class="text-base font-semibold text-primary">Report an issue</h2>
          <button type="button" class="btn btn-ghost btn-compact" data-action="close-report" aria-label="Close dialog">
            ✕
          </button>
        </div>

        ${
          reportSuccessReference
            ? `
              <div class="report-success p-4 my-4 bg-success-bg border border-success rounded-md text-sm">
                <h3 class="font-semibold text-success mb-1">Report submitted</h3>
                <p class="text-secondary text-xs mb-2">Thank you. Your report has been submitted to the operations desk for investigation.</p>
                <div class="font-mono text-xs text-primary bg-bg-raised p-2 rounded mb-3">Reference: ${escapeHtml(reportSuccessReference)}</div>
                <button type="button" class="btn btn-secondary btn-compact" data-action="close-report">Close</button>
              </div>
            `
            : `
              <form id="report-issue-form" class="flex flex-col gap-4 py-4">
                ${
                  reportError
                    ? `<div class="p-3 bg-danger-bg text-danger text-xs rounded border border-danger">${escapeHtml(reportError)}</div>`
                    : ''
                }

                <div class="form-group">
                  <label for="report-course-id" class="form-label">Course ID <span class="text-danger">*</span></label>
                  <input
                    id="report-course-id"
                    type="text"
                    class="form-input"
                    value="${escapeHtml(courseId)}"
                    placeholder="e.g. course-python-foundations"
                    required
                  />
                  <span class="form-hint">Contextual course identifier.</span>
                </div>

                <div class="form-group">
                  <label for="report-type" class="form-label">Issue Type <span class="text-danger">*</span></label>
                  <select id="report-type" class="form-input" required>
                    <option value="broken_exercise" ${type === 'broken_exercise' ? 'selected' : ''}>Broken exercise or test case</option>
                    <option value="inappropriate_content" ${type === 'inappropriate_content' ? 'selected' : ''}>Inappropriate or abusive content</option>
                    <option value="other" ${type === 'other' ? 'selected' : ''}>Other platform issue</option>
                  </select>
                </div>

                <div class="form-group">
                  <label for="report-description" class="form-label">Description <span class="text-danger">*</span></label>
                  <textarea
                    id="report-description"
                    class="form-input"
                    rows="4"
                    placeholder="Describe what happened, what was expected, and how to reproduce it…"
                    required
                  >${escapeHtml(description)}</textarea>
                </div>

                <div class="form-group flex items-center gap-2">
                  <input id="report-include-code" type="checkbox" class="form-checkbox" ${includeCode ? 'checked' : ''} />
                  <label for="report-include-code" class="text-xs text-secondary cursor-pointer">
                    Include submitted code draft with report (optional)
                  </label>
                </div>

                <input type="hidden" id="report-version-id" value="${escapeHtml(courseVersionId)}" />
                <input type="hidden" id="report-step-id" value="${escapeHtml(stepId)}" />

                <div class="flex justify-end gap-3 pt-3 border-t border-subtle">
                  <button type="button" class="btn btn-secondary btn-compact" data-action="close-report">Cancel</button>
                  <button
                    type="submit"
                    class="btn btn-primary btn-compact"
                    ${isSubmittingReport ? 'disabled aria-disabled="true"' : ''}
                  >
                    ${isSubmittingReport ? 'Sending report…' : 'Send report'}
                  </button>
                </div>
              </form>
            `
        }
      </div>
    </div>
  `;

  return `
    <div class="help-page container py-12">
      <div class="max-w-reading mx-auto">
        <header class="help-header mb-8">
          <h1 class="page-title font-semibold mb-2">Help and support</h1>
          <p class="text-secondary text-sm leading-relaxed">
            Guidance on account management, course enrollment, code autosaving, automated evaluation, and incident reporting.
          </p>
        </header>

        <!-- In-page Table of Contents (P40) -->
        <nav class="table-of-contents p-4 mb-10 bg-surface border border-subtle rounded-lg" aria-label="Help topics">
          <span class="text-xs font-semibold uppercase tracking-wider text-muted block mb-2">On this page</span>
          <ul class="flex flex-col gap-1.5 text-sm list-none p-0">
            <li><a href="#account" class="text-link">Account access & verification</a></li>
            <li><a href="#enrollment" class="text-link">Course enrollment & invitations</a></li>
            <li><a href="#saving" class="text-link">Saving your work & code drafts</a></li>
            <li><a href="#run-vs-submit" class="text-link">Run samples versus Submit solution</a></li>
            <li><a href="#reporting" class="text-link">Reporting an issue</a></li>
            <li><a href="#contact" class="text-link">Support channels</a></li>
          </ul>
        </nav>

        <!-- Help Content Prose -->
        <div class="help-content flex flex-col gap-10">
          <section id="account" class="help-section" aria-labelledby="heading-account">
            <h2 id="heading-account" class="section-title text-lg font-semibold mb-3">Account access & verification</h2>
            <p class="text-secondary text-sm leading-relaxed mb-3">
              ZUR is currently in a controlled pilot release for adult learners (18 years of age and older). An active, verified email address is required before you can enroll in courses or create course drafts.
            </p>
            <p class="text-secondary text-sm leading-relaxed mb-3">
              If you haven't received your verification link, visit <a href="/verify-email" class="text-link">Verify Email</a> to request a new link with rate-limited cooldown protection. If you forgot your password, use the <a href="/forgot-password" class="text-link">password recovery page</a> to receive a single-use reset token.
            </p>
          </section>

          <section id="enrollment" class="help-section" aria-labelledby="heading-enrollment">
            <h2 id="heading-enrollment" class="section-title text-lg font-semibold mb-3">Course enrollment & invitations</h2>
            <p class="text-secondary text-sm leading-relaxed mb-3">
              Courses on ZUR can have either <strong>Open enrollment</strong> or <strong>Invitation only</strong> policies:
            </p>
            <ul class="list-disc pl-5 text-sm text-secondary flex flex-col gap-2 mb-3">
              <li><strong>Open enrollment:</strong> Any verified learner can join directly from the public course overview.</li>
              <li><strong>Invitation only:</strong> You must receive a unique email invitation or shareable invitation link from the course author.</li>
            </ul>
            <p class="text-secondary text-sm leading-relaxed">
              When you enroll, your progress is permanently pinned to that exact immutable published course version. Even if the teacher publishes updates later, your exercises and grading criteria remain stable.
            </p>
          </section>

          <section id="saving" class="help-section" aria-labelledby="heading-saving">
            <h2 id="heading-saving" class="section-title text-lg font-semibold mb-3">Saving your work & code drafts</h2>
            <p class="text-secondary text-sm leading-relaxed mb-3">
              Student code drafts automatically synchronize with the server every 1–2 seconds during coding pauses. The workspace header indicates <code>Saved</code> only after server acknowledgement.
            </p>
            <p class="text-secondary text-sm leading-relaxed">
              For shared computer safety, local browser drafts are strictly cleared from device storage upon explicit user sign-out. Returning on another device will restore your last server-synchronized draft.
            </p>
          </section>

          <section id="run-vs-submit" class="help-section" aria-labelledby="heading-run-vs-submit">
            <h2 id="heading-run-vs-submit" class="section-title text-lg font-semibold mb-3">Run samples versus Submit solution</h2>
            <div class="run-vs-submit-card p-4 bg-surface border border-subtle rounded-lg text-sm mb-3">
              <div class="mb-3">
                <span class="font-semibold text-primary block mb-1">Run samples</span>
                <p class="text-secondary text-xs leading-relaxed">
                  Executes your current editor code against public example test cases and displays stdout/diff. Does NOT impact your course progress or record an authoritative grading attempt.
                </p>
              </div>
              <div class="pt-3 border-t border-subtle">
                <span class="font-semibold text-primary block mb-1">Submit solution</span>
                <p class="text-secondary text-xs leading-relaxed">
                  Grades an immutable snapshot of your code against all public and hidden test cases in an isolated execution sandbox. Marks the step completed when all tests pass.
                </p>
              </div>
            </div>
            <p class="text-secondary text-xs text-muted">
              Hidden test cases protect evaluation integrity. If a hidden check fails, safe feedback guides you toward edge cases without disclosing secret test values.
            </p>
          </section>

          <section id="reporting" class="help-section" aria-labelledby="heading-reporting">
            <h2 id="heading-reporting" class="section-title text-lg font-semibold mb-3">Reporting an issue</h2>
            <p class="text-secondary text-sm leading-relaxed mb-4">
              Encountered a broken exercise, an invalid test case, or inappropriate course material? You can submit an issue report directly for operator triage.
            </p>
            <button type="button" class="btn btn-secondary btn-compact" data-action="open-report">
              Report an issue
            </button>
          </section>

          <section id="contact" class="help-section border-t border-subtle pt-8" aria-labelledby="heading-contact">
            <h2 id="heading-contact" class="section-title text-lg font-semibold mb-3">Support channels</h2>
            <div class="banner banner-info p-4 bg-surface border border-subtle rounded-lg text-sm">
              <h3 class="text-sm font-semibold mb-1">Public external support pending launch</h3>
              <p class="text-secondary text-xs leading-relaxed mb-2">
                Public external support email addresses and ticket desks are currently undergoing infrastructure setup and are pending approval prior to general release.
              </p>
              <p class="text-secondary text-xs leading-relaxed">
                During the pilot phase, authenticated learners should report broken exercises or issues using the <button type="button" class="text-link underline" data-action="open-report">Report an issue</button> button.
              </p>
            </div>
          </section>
        </div>
      </div>

      ${reportModalHtml}
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
