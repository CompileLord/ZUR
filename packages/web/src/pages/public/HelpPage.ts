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
    <div class="help-page container py-10">
      <header class="help-header flex items-center justify-between flex-wrap gap-4 mb-8 pb-4 border-b border-subtle">
        <div>
          <h1 class="page-title font-semibold mb-1">Help and support</h1>
          <p class="text-secondary text-sm">
            Answers to common questions about accounts, courses, saving work, and exercises.
          </p>
        </div>
        <button type="button" class="btn btn-secondary btn-compact" data-action="open-report">
          Report an issue
        </button>
      </header>

      <div class="help-grid">
        <!-- In-page Table of Contents: Compact sticky left TOC (P40) -->
        <aside class="help-toc-sidebar" aria-label="Help topics">
          <nav class="help-toc">
            <div class="help-toc-heading">On this page</div>
            <ul class="help-toc-list">
              <li><a href="#account" class="help-toc-link">I can't sign in</a></li>
              <li><a href="#enrollment" class="help-toc-link">How do courses and enrollments work?</a></li>
              <li><a href="#saving" class="help-toc-link">My code didn't save</a></li>
              <li><a href="#run-vs-submit" class="help-toc-link">Run or Submit?</a></li>
              <li><a href="#reporting" class="help-toc-link">Reporting an issue</a></li>
              <li><a href="#contact" class="help-toc-link">Support channels</a></li>
            </ul>
          </nav>
        </aside>

        <!-- Help Content Prose: Concise task-oriented sections with disclosures for detail -->
        <div class="help-content flex flex-col gap-8">
          <section id="account" class="help-section" aria-labelledby="heading-account">
            <h2 id="heading-account" class="section-title text-base font-semibold mb-2">I can't sign in</h2>
            <p class="text-secondary text-sm leading-relaxed mb-3">
              Make sure you are using the email address you registered with. If you haven't confirmed your email yet, visit <a href="/verify-email" class="text-link underline">Verify Email</a> to request an activation link.
            </p>
            <details class="help-disclosure text-xs text-secondary">
              <summary class="font-medium text-muted cursor-pointer hover:text-primary py-1">Resetting your password</summary>
              <p class="pt-2 leading-relaxed">
                If you forgot your password, visit the <a href="/forgot-password" class="text-link underline">password recovery page</a> to receive a single-use reset link. Recovery links expire after one hour.
              </p>
            </details>
          </section>

          <section id="enrollment" class="help-section" aria-labelledby="heading-enrollment">
            <h2 id="heading-enrollment" class="section-title text-base font-semibold mb-2">How do courses and enrollments work?</h2>
            <p class="text-secondary text-sm leading-relaxed mb-3">
              Explore available courses in the <a href="/courses" class="text-link underline">course catalog</a>. Open courses allow direct enrollment once signed in. Invitation-only courses require an invitation link provided by your teacher.
            </p>
            <details class="help-disclosure text-xs text-secondary">
              <summary class="font-medium text-muted cursor-pointer hover:text-primary py-1">Course versions and progress</summary>
              <p class="pt-2 leading-relaxed">
                When you enroll in a course, your progress is tied to that version. When authors publish updates, existing students continue learning uninterrupted on their current version.
              </p>
            </details>
          </section>

          <section id="saving" class="help-section" aria-labelledby="heading-saving">
            <h2 id="heading-saving" class="section-title text-base font-semibold mb-2">My code didn't save</h2>
            <p class="text-secondary text-sm leading-relaxed mb-3">
              Your code saves automatically. Check the save status in the workspace header before leaving.
            </p>
            <details class="help-disclosure text-xs text-secondary">
              <summary class="font-medium text-muted cursor-pointer hover:text-primary py-1">Save status and sync details</summary>
              <p class="pt-2 leading-relaxed">
                The workspace header indicates <code>Saved</code> only after server acknowledgement. If connection is temporarily interrupted, local drafts are preserved in the browser until reconnected.
              </p>
            </details>
          </section>

          <section id="run-vs-submit" class="help-section" aria-labelledby="heading-run-vs-submit">
            <h2 id="heading-run-vs-submit" class="section-title text-base font-semibold mb-2">Run or Submit?</h2>
            <p class="text-secondary text-sm leading-relaxed mb-3">
              <strong>Run</strong> tests your code against public sample cases or custom input without affecting course progress. <strong>Submit</strong> evaluates your solution against all required checks and records completion.
            </p>
            <details class="help-disclosure text-xs text-secondary">
              <summary class="font-medium text-muted cursor-pointer hover:text-primary py-1">Hidden test cases</summary>
              <p class="pt-2 leading-relaxed">
                Hidden tests verify edge cases and prevent hardcoding. If a hidden test fails, feedback points out edge cases and types of errors without exposing secret test data.
              </p>
            </details>
          </section>

          <section id="reporting" class="help-section" aria-labelledby="heading-reporting">
            <h2 id="heading-reporting" class="section-title text-base font-semibold mb-2">Reporting an issue</h2>
            <p class="text-secondary text-sm leading-relaxed mb-4">
              Encountered a broken exercise, invalid test case, or platform problem? You can submit an issue report directly for operator triage.
            </p>
            <button type="button" class="btn btn-secondary btn-compact" data-action="open-report">
              Report an issue
            </button>
          </section>

          <section id="contact" class="help-section border-t border-subtle pt-6" aria-labelledby="heading-contact">
            <h2 id="heading-contact" class="section-title text-base font-semibold mb-2">Support channels</h2>
            <p class="text-secondary text-sm leading-relaxed">
              During the pilot, learners can submit issue reports directly using the Report an issue button on this page, or using the report dialog in any learning workspace.
            </p>
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
