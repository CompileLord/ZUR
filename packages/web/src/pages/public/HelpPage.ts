import { renderIcon } from '../../components/common/icons.ts';
export interface ReportCourse {
  id: string;
  title: string;
}

export interface HelpPageProps {
  isSignedIn?: boolean;
  courses?: ReportCourse[] | null;
  returnTo?: string;
  courseId?: string;
  courseVersionId?: string;
  stepId?: string;
  type?: string;
  description?: string;
  isReportModalOpen?: boolean;
  isSubmittingReport?: boolean;
  reportSuccessReference?: string | null;
  reportError?: string | null;
}

export function renderHelpPage(props: HelpPageProps = {}): string {
  const {
    isSignedIn = false,
    courses = [],
    returnTo = '/help',
    courseId = '',
    courseVersionId = '',
    stepId = '',
    type = 'broken_exercise',
    description = '',
    isReportModalOpen = false,
    isSubmittingReport = false,
    reportSuccessReference = null,
    reportError = null,
  } = props;

  const courseOptions = [...(courses ?? [])];
  if (courseId && !courseOptions.some((c) => c.id === courseId)) courseOptions.push({ id: courseId, title: 'The course you were viewing' });
  const needsCoursePick = courseOptions.length > 1 && !courseOptions.some((c) => c.id === courseId);

  const reportUnavailableHtml = !isSignedIn
    ? `
              <div class="report-signin-prompt py-4 text-sm">
                <p class="text-secondary mb-3">Sign in to report an issue. Reports are linked to your account so the team can follow up with you.</p>
                <a id="report-signin" class="btn btn-primary btn-compact" href="/sign-in?returnTo=${encodeURIComponent(returnTo)}">Sign in to report</a>
              </div>
            `
    : courseOptions.length === 0
      ? `
              <div class="report-no-courses py-4 text-sm">
                <p class="text-secondary mb-3">${courses === null ? 'We could not load your courses. Reload the page to try again.' : 'Reports are about a course you are enrolled in. Enroll in a course first, then report an issue from there.'}</p>
                ${courses === null ? '' : '<a class="btn btn-secondary btn-compact" href="/courses">Browse courses</a>'}
              </div>
            `
      : '';

  const reportModalHtml = `
    <dialog
      id="report-issue-modal"
      class="report-modal ${isReportModalOpen ? 'open' : ''}"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      style="${isReportModalOpen ? 'display: flex;' : 'display: none;'}"
      ${isReportModalOpen ? 'open' : ''}
    >
      <div class="sheet-backdrop" data-action="close-report"></div>
      <div class="sheet-panel max-w-dialog" tabindex="-1">
        <div class="sheet-header flex justify-between items-center pb-2 border-b border-subtle">
          <h2 id="report-modal-title" class="text-base font-semibold text-primary">Report an issue</h2>
          <button type="button" class="btn btn-icon" data-action="close-report" aria-label="Close dialog">
            ${renderIcon('x', { size: 16 })}
          </button>
        </div>

        ${
          reportSuccessReference
            ? `
              <div class="report-success p-4 my-4 bg-success-bg border border-success rounded-md text-sm">
                <h3 class="font-semibold text-success mb-1">Report submitted</h3>
                <p class="text-secondary text-xs mb-2">Thank you. Your report has been submitted to the operations desk for investigation.</p>
                <div class="font-mono text-xs text-primary bg-bg-raised p-2 rounded mb-3" style="overflow-wrap: anywhere; word-break: break-word;">Reference: ${escapeHtml(reportSuccessReference)}</div>
                <button type="button" class="btn btn-secondary btn-compact" data-action="close-report">Close</button>
              </div>
            `
            : reportUnavailableHtml || `
              <form id="report-issue-form" class="flex flex-col gap-3 py-3">
                ${
                  reportError
                    ? `<div class="p-3 bg-danger-bg text-danger text-xs rounded border border-danger" style="overflow-wrap: anywhere; word-break: break-word;">${escapeHtml(reportError)}</div>`
                    : ''
                }

                <div class="form-group">
                  <label for="report-course-id" class="form-label">Course <span class="text-danger">*</span></label>
                  <select id="report-course-id" class="form-input" required>
                    ${needsCoursePick ? '<option value="">Choose a course</option>' : ''}
                    ${courseOptions.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === courseId || courseOptions.length === 1 ? ' selected' : ''}>${escapeHtml(c.title)}</option>`).join('')}
                  </select>
                  <span class="form-hint">The course this report is about.</span>
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
    </dialog>
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
            <details class="help-disclosure">
              <summary class="help-disclosure-summary">Resetting your password</summary>
              <p class="help-disclosure-body">
                If you forgot your password, visit the <a href="/forgot-password" class="text-link underline">password recovery page</a> to receive a single-use reset link. Recovery links expire after one hour.
              </p>
            </details>
          </section>

          <section id="enrollment" class="help-section" aria-labelledby="heading-enrollment">
            <h2 id="heading-enrollment" class="section-title text-base font-semibold mb-2">How do courses and enrollments work?</h2>
            <p class="text-secondary text-sm leading-relaxed mb-3">
              Explore available courses in the <a href="/courses" class="text-link underline">course catalog</a>. Open courses allow direct enrollment once signed in. Invitation-only courses require an invitation link provided by your teacher.
            </p>
            <details class="help-disclosure">
              <summary class="help-disclosure-summary">Course versions and progress</summary>
              <p class="help-disclosure-body">
                When you enroll in a course, your progress is tied to that version. When authors publish updates, existing students continue learning uninterrupted on their current version.
              </p>
            </details>
          </section>

          <section id="saving" class="help-section" aria-labelledby="heading-saving">
            <h2 id="heading-saving" class="section-title text-base font-semibold mb-2">My code didn't save</h2>
            <p class="text-secondary text-sm leading-relaxed mb-3">
              Code in a Python exercise saves automatically a moment after you stop typing. The status beside the editor shows Saved, Saving… or Unsaved edits.
            </p>
            <details class="help-disclosure">
              <summary class="help-disclosure-summary">Save errors, conflict notices, and draft recovery</summary>
              <p class="help-disclosure-body">
                If a save fails, for example because your connection dropped, your latest code is kept in this browser and restored the next time you open the exercise. If you changed the same exercise in another tab, the editor shows a draft conflict and lets you choose which version to keep.
              </p>
              <p class="help-disclosure-body">
                Course authors save step edits with Save changes. If the step was saved elsewhere first, you can load that version or keep your own.
              </p>
            </details>
          </section>

          <section id="run-vs-submit" class="help-section" aria-labelledby="heading-run-vs-submit">
            <h2 id="heading-run-vs-submit" class="section-title text-base font-semibold mb-2">Run or Submit?</h2>
            <p class="text-secondary text-sm leading-relaxed mb-3">
              The learning workspace provides three distinct execution actions depending on your task:
            </p>
            <ul class="text-secondary text-sm leading-relaxed mb-3 list-disc pl-5 flex flex-col gap-1.5">
              <li><strong>Run</strong>: executes code against custom input or selected mode, displaying stdout/stderr.</li>
              <li><strong>Test samples</strong>: tests code against public sample cases and displays diffs.</li>
              <li><strong>Submit</strong>: assesses code against required test suites including hidden cases and records completion.</li>
            </ul>
            <details class="help-disclosure">
              <summary class="help-disclosure-summary">Hidden test cases</summary>
              <p class="help-disclosure-body">
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
