import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';

export interface StudentDetailPageProps {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  data: {
    enrollment: {
      id: string;
      courseId: string;
      courseTitle: string;
      courseVersionId: string;
      versionNumber: number | null;
      status: 'active' | 'revoked' | 'left';
      enrolledAt: string;
      revokedAt: string | null;
      revocationReason: string | null;
      completedAt: string | null;
    };
    student: {
      id: string;
      displayName: string;
      email?: string | null;
    };
    overallProgress: {
      requiredStepsCompleted: number;
      totalRequiredSteps: number;
      percentage: number;
      lastLearningActivityAt: string | null;
    };
    curriculum: Array<{
      id: string;
      title: string;
      ordinal: number;
      lessons: Array<{
        id: string;
        title: string;
        ordinal: number;
        steps: Array<{
          id: string;
          title: string;
          type: 'theory' | 'video' | 'quiz' | 'python';
          ordinal: number;
          isRequired: boolean;
        }>;
      }>;
    }>;
    stepProgress: Record<string, {
      satisfied: boolean;
      completedAt: string | null;
      submissionCount: number;
      bestScore: number | null;
      isWaived: boolean;
      waivedAt?: string | null;
    }>;
    attempts: Record<string, Array<{
      id: string;
      attemptNumber: number;
      verdict: string;
      score: number | null;
      submittedAt: string;
      submittedCode?: string | null;
      isLatest: boolean;
    }>>;
    waivers: Record<string, { waivedAt: string; reason: string }>;
  };
  selectedStepId?: string;
  selectedAttemptId?: string;
  attemptPagination?: { offset: number; limit: number; total: number };
  actionMessage?: { type: 'success' | 'error'; text: string };
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'No activity yet';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function renderStudentDetailPage(props: StudentDetailPageProps): string {
  const { data } = props;
  const enr = data.enrollment;
  const student = data.student;
  const progress = data.overallProgress;

  // Find all steps in a flat list
  const allSteps: Array<{
    id: string;
    title: string;
    type: 'theory' | 'video' | 'quiz' | 'python';
    isRequired: boolean;
    moduleTitle: string;
    lessonTitle: string;
  }> = [];

  data.curriculum.forEach((mod) => {
    mod.lessons.forEach((les) => {
      les.steps.forEach((st) => {
        allSteps.push({
          id: st.id,
          title: st.title,
          type: st.type,
          isRequired: st.isRequired,
          moduleTitle: mod.title,
          lessonTitle: les.title,
        });
      });
    });
  });

  const selectedStepId = props.selectedStepId || allSteps[0]?.id;
  const selectedStep = allSteps.find(s => s.id === selectedStepId);
  const selectedStepAttempts = selectedStepId ? (data.attempts[selectedStepId] || []) : [];
  const selectedAttemptId = props.selectedAttemptId || selectedStepAttempts[0]?.id;
  const selectedAttempt = selectedStepAttempts.find(a => a.id === selectedAttemptId) || selectedStepAttempts[0];

  const statusBadge = enr.status === 'active'
    ? '<span class="status-badge success">Active enrollment</span>'
    : enr.status === 'revoked'
    ? '<span class="status-badge danger">Access revoked</span>'
    : '<span class="status-badge info">Left course</span>';

  const content = `
    <div class="student-detail-container p-6 max-w-7xl mx-auto" data-enrollment-id="${escapeHtml(enr.id)}">
      <!-- Breadcrumb Navigation -->
      <nav class="breadcrumb-nav mb-4" aria-label="Breadcrumbs">
        <a href="/teach/${escapeHtml(props.courseId)}/students" class="btn btn-ghost btn-compact text-secondary hover:text-primary">
          ← Back to students
        </a>
      </nav>

      ${props.actionMessage ? `
        <div class="alert alert-${props.actionMessage.type === 'error' ? 'danger' : 'success'} mb-6" role="alert">
          ${escapeHtml(props.actionMessage.text)}
        </div>
      ` : ''}

      <!-- Student Overview Card -->
      <div class="student-hero-card p-6 bg-surface border border-subtle rounded-xl mb-6 shadow-sm">
        <div class="flex flex-wrap justify-between items-start gap-4">
          <div>
            <div class="flex items-center gap-3">
              <h1 class="page-title text-2xl font-bold tracking-tight">${escapeHtml(student.displayName)}</h1>
              ${statusBadge}
            </div>
            <div class="flex flex-wrap items-center gap-4 mt-2 text-xs text-secondary">
              ${student.email ? `
                <span class="font-mono bg-raised px-2 py-0.5 rounded border border-subtle" title="Masked student email">
                  ${escapeHtml(student.email)}
                </span>
              ` : ''}
              <span>Enrolled version: <strong>Version ${enr.versionNumber ?? 1}</strong></span>
              <span>Enrolled on: ${formatDate(enr.enrolledAt)}</span>
              <span>Last active: <strong>${formatDate(progress.lastLearningActivityAt)}</strong></span>
            </div>
            ${enr.status === 'revoked' && enr.revokedAt ? `
              <div class="mt-3 p-2 bg-danger-bg text-danger text-xs rounded border border-danger">
                <strong>Access Revoked on ${formatDate(enr.revokedAt)}:</strong> ${escapeHtml(enr.revocationReason || 'No reason specified')}
              </div>
            ` : ''}
          </div>

          <!-- Actions -->
          <div class="student-header-actions flex flex-wrap gap-2">
            ${enr.status === 'active' ? `
              <button
                type="button"
                id="btn-open-revoke-detail"
                class="btn btn-ghost text-danger hover:bg-danger-bg btn-compact"
                data-enrollment-id="${escapeHtml(enr.id)}"
                data-student-name="${escapeHtml(student.displayName)}"
              >
                Revoke access
              </button>
            ` : enr.status === 'revoked' ? `
              <button
                type="button"
                id="btn-open-reinstate-detail"
                class="btn btn-secondary btn-compact"
                data-enrollment-id="${escapeHtml(enr.id)}"
                data-student-name="${escapeHtml(student.displayName)}"
              >
                Reinstate access
              </button>
            ` : ''}

            <a
              href="/help?courseId=${escapeHtml(props.courseId)}&versionId=${escapeHtml(enr.courseVersionId)}"
              class="btn btn-secondary btn-compact"
              title="Report an issue with an exercise in this pinned version"
            >
              Report broken exercise
            </a>
          </div>
        </div>

        <!-- Progress Bar Summary -->
        <div class="mt-6 pt-4 border-t border-subtle">
          <div class="flex justify-between items-center text-xs mb-2">
            <span class="font-semibold text-secondary uppercase tracking-wide">Required Steps Progress</span>
            <span class="font-bold text-primary">${progress.requiredStepsCompleted} of ${progress.totalRequiredSteps} completed (${progress.percentage}%)</span>
          </div>
          <div class="progress-bar-bg h-2 w-full bg-raised rounded-full overflow-hidden">
            <div class="progress-bar-fill h-full bg-accent rounded-full" style="width: ${Math.min(100, Math.max(0, progress.percentage))}%"></div>
          </div>
        </div>
      </div>

      <!-- Detail Grid: Curriculum Rail & Attempt Explorer -->
      <div class="student-detail-layout">
        <!-- Curriculum Rail (Left) -->
        <div class="student-detail-curriculum space-y-4">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-secondary mb-2">
            Curriculum Breakdown
          </h2>

          <div class="curriculum-steps-list">
            ${allSteps.length === 0 ? `
              <div class="p-6 text-center text-secondary text-sm">No curriculum steps found for this version.</div>
            ` : allSteps.map((st) => {
              const sp = data.stepProgress[st.id];
              const isSelected = st.id === selectedStepId;
              const hasWaiver = Boolean(sp?.isWaived || data.waivers[st.id]);
              const stepAttempts = data.attempts[st.id] || [];

              let stepBadge = '';
              if (hasWaiver) {
                stepBadge = '<span class="status-badge info text-xs">Waived (Admin)</span>';
              } else if (sp?.satisfied) {
                stepBadge = '<span class="status-badge success text-xs">Completed</span>';
              } else if (stepAttempts.length > 0) {
                stepBadge = '<span class="status-badge warning text-xs">In Progress</span>';
              } else {
                stepBadge = '<span class="text-xs text-muted">Not started</span>';
              }

              return `
                <button type="button"
                  class="step-rail-item ${isSelected ? 'selected' : ''}"
                  data-action="select-step"
                  data-step-id="${escapeHtml(st.id)}"
                  aria-pressed="${isSelected}"
                >
                  <div class="step-rail-row">
                    <div class="step-rail-main">
                      <div class="step-rail-meta">
                        <span class="step-rail-badge badge-${escapeHtml(st.type)}">${escapeHtml(st.type)}</span>
                        <span class="step-rail-lesson-title" title="${escapeHtml(st.lessonTitle)}">${escapeHtml(st.lessonTitle)}</span>
                        ${!st.isRequired ? '<span class="step-rail-optional">optional</span>' : ''}
                      </div>
                      <div class="step-rail-step-title" title="${escapeHtml(st.title)}">${escapeHtml(st.title)}</div>
                    </div>
                    <div class="step-rail-aside">
                      ${stepBadge}
                      ${(st.type === 'python' || st.type === 'quiz') ? `
                        <span class="step-rail-attempts-count">${stepAttempts.length} attempt${stepAttempts.length === 1 ? '' : 's'}</span>
                      ` : ''}
                    </div>
                  </div>
                </button>
              `;
            }).join('')}
          </div>

          <div class="p-3 bg-raised border border-subtle rounded-lg text-xs text-secondary leading-relaxed">
            <strong>Policy Notice:</strong> Student step completions require automated assessment passes or recorded administrative waivers. There is no manual teacher-side completion-override toggle.
          </div>
        </div>

        <!-- Submitted Attempts & Read-only Code View (Right) -->
        <div class="student-detail-attempts">
          ${selectedStep ? `
            <div class="step-detail-card border border-subtle rounded-xl bg-surface p-6">
              <header class="flex justify-between items-start pb-4 mb-4 border-b border-subtle">
                <div>
                  <span class="badge-${selectedStep.type} text-xs font-mono uppercase px-2 py-0.5 rounded">
                    ${selectedStep.type}
                  </span>
                  <h3 class="text-lg font-bold text-primary mt-1">${escapeHtml(selectedStep.title)}</h3>
                  <p class="text-xs text-secondary mt-0.5">
                    ${escapeHtml(selectedStep.moduleTitle)} · ${escapeHtml(selectedStep.lessonTitle)}
                  </p>
                </div>

                <div class="text-right">
                  ${data.waivers[selectedStep.id] ? `
                    <div class="p-2 bg-info-bg border border-info rounded text-xs text-info text-left max-w-xs">
                      <strong>Waiver applied:</strong> ${escapeHtml(data.waivers[selectedStep.id].reason)}
                      <div class="text-[10px] text-muted mt-0.5">${formatDate(data.waivers[selectedStep.id].waivedAt)}</div>
                    </div>
                  ` : ''}
                </div>
              </header>

              ${(selectedStep.type === 'python' || selectedStep.type === 'quiz') ? `
                <div class="attempts-section space-y-4">
                  <div class="flex justify-between items-center">
                    <h4 class="text-xs font-semibold uppercase tracking-wide text-secondary">
                      Submitted Assessment Attempts (${selectedStepAttempts.length})
                    </h4>
                  </div>

                  ${selectedStepAttempts.length === 0 ? `
                    <div class="p-6 bg-raised border border-subtle rounded-lg text-center text-sm text-secondary">
                      <p class="font-medium mb-1">No assessed attempts submitted</p>
                      <p class="text-xs text-muted">The student has not yet submitted code or quiz answers for this step.</p>
                    </div>
                  ` : `
                    <!-- Attempt Selection Tabs -->
                    <div class="attempt-tabs flex gap-2 overflow-x-auto pb-2 border-b border-subtle" role="tablist">
                      ${selectedStepAttempts.map((att) => {
                        const isAttSelected = att.id === selectedAttempt?.id;
                        const isPass = att.verdict === 'pass' || att.verdict === 'passed';
                        return `
                          <button
                            type="button"
                            class="attempt-tab-btn px-3 py-1.5 text-xs rounded border transition-colors flex items-center gap-1.5 ${isAttSelected ? 'bg-primary text-on-primary border-primary font-semibold' : 'bg-surface text-secondary border-subtle hover:bg-hover'}"
                            data-action="select-attempt"
                            data-attempt-id="${escapeHtml(att.id)}"
                            data-step-id="${escapeHtml(selectedStep.id)}"
                            role="tab"
                            aria-selected="${isAttSelected}"
                          >
                            <span>Attempt #${att.attemptNumber}</span>
                            <span class="inline-block w-2 h-2 rounded-full ${isPass ? 'bg-success' : 'bg-danger'}"></span>
                          </button>
                        `;
                      }).join('')}
                    </div>
                    ${props.attemptPagination && props.attemptPagination.total > props.attemptPagination.limit ? `
                      <nav class="flex justify-between items-center text-xs" aria-label="Attempt pages">
                        <span>Showing ${props.attemptPagination.offset + 1}–${Math.min(props.attemptPagination.offset + props.attemptPagination.limit, props.attemptPagination.total)} of ${props.attemptPagination.total}</span>
                        ${props.attemptPagination.offset > 0 ? `<a class="btn btn-secondary btn-compact" href="?stepId=${encodeURIComponent(selectedStep.id)}&attemptOffset=${Math.max(0, props.attemptPagination.offset - props.attemptPagination.limit)}">Previous attempts</a>` : ''}
                        ${props.attemptPagination.offset + props.attemptPagination.limit < props.attemptPagination.total ? `<a class="btn btn-secondary btn-compact" href="?stepId=${encodeURIComponent(selectedStep.id)}&attemptOffset=${props.attemptPagination.offset + props.attemptPagination.limit}">More attempts</a>` : ''}
                      </nav>
                    ` : ''}

                    <!-- Selected Attempt Detail View -->
                    ${selectedAttempt ? `
                      <div class="attempt-view-panel space-y-3 pt-2">
                        <div class="flex justify-between items-center text-xs p-3 bg-raised border border-subtle rounded-lg">
                          <div>
                            <span class="font-semibold text-primary">Verdict:</span>
                            <span class="font-mono ml-1 font-bold ${selectedAttempt.verdict === 'pass' ? 'text-success' : 'text-danger'}">
                              ${escapeHtml(selectedAttempt.verdict.toUpperCase())}
                            </span>
                            ${selectedAttempt.score !== null && selectedAttempt.score !== undefined ? `
                              <span class="ml-2 text-muted">· Score: ${selectedAttempt.score}%</span>
                            ` : ''}
                          </div>
                          <div class="text-muted">
                            Submitted: ${formatDate(selectedAttempt.submittedAt)}
                          </div>
                        </div>

                        ${selectedAttempt.submittedCode ? `
                          <div class="code-snapshot-wrapper">
                            <div class="flex justify-between items-center bg-raised px-4 py-2 border-t border-x border-subtle rounded-t-lg">
                              <span class="text-xs font-mono text-secondary font-semibold">Submitted Solution Snapshot (Read-Only)</span>
                              <span class="text-[11px] text-muted">Private unsent drafts are never visible</span>
                            </div>
                            <pre class="bg-canvas p-4 border border-subtle rounded-b-lg font-mono text-xs overflow-x-auto text-primary leading-relaxed"><code>${escapeHtml(selectedAttempt.submittedCode)}</code></pre>
                          </div>
                        ` : `
                          <div class="p-4 bg-raised border border-subtle rounded text-xs text-muted">
                            No code snapshot recorded for this attempt.
                          </div>
                        `}
                      </div>
                    ` : ''}
                  `}
                </div>
              ` : `
                <div class="p-6 bg-raised border border-subtle rounded-lg text-sm text-secondary">
                  <p class="font-medium mb-1">${selectedStep.type.toUpperCase()} Step</p>
                  <p class="text-xs text-muted">
                    This step does not require code execution. Reading or video progress is recorded automatically upon viewing completion.
                  </p>
                  ${data.stepProgress[selectedStep.id]?.completedAt ? `
                    <div class="mt-3 text-xs text-success font-medium">
                      ✓ Completed on ${formatDate(data.stepProgress[selectedStep.id].completedAt)}
                    </div>
                  ` : ''}
                </div>
              `}
            </div>
          ` : `
            <div class="p-8 text-center text-secondary border border-subtle rounded-xl bg-surface">
              Select a step from the curriculum breakdown to view progress and submitted attempts.
            </div>
          `}
        </div>
      </div>
    </div>

    <!-- Revoke Student Confirmation Modal Dialog -->
    <div id="revoke-student-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="revoke-modal-title">
      <div class="modal-dialog confirm max-w-md p-6 bg-raised border border-danger rounded-xl shadow-lg">
        <h2 id="revoke-modal-title" class="text-lg font-semibold text-danger mb-2">Revoke Course Access</h2>
        <p class="text-sm text-secondary mb-4 leading-relaxed">
          Revoke course access for <strong id="revoke-student-display-name" class="text-primary font-semibold">${escapeHtml(student.displayName)}</strong>?
        </p>
        <div class="p-3 bg-danger-bg text-danger border border-danger rounded text-xs mb-4 leading-relaxed">
          <strong>Important:</strong> Revoking access restricts this student from viewing or continuing the course. It <strong>explicitly does not delete their account</strong>. All verified progress, step completion timestamps, and submitted attempts are retained.
        </div>
        <div class="form-group mb-4">
          <label for="revoke-reason-input" class="form-label block text-xs font-semibold uppercase text-secondary mb-1">Reason for revocation (optional)</label>
          <input type="text" id="revoke-reason-input" class="form-input w-full text-sm" placeholder="e.g. End of term, duplicate enrollment" />
        </div>
        <input type="hidden" id="revoke-enrollment-id-input" value="${escapeHtml(enr.id)}" />
        <div class="flex justify-end gap-3 pt-3 border-t border-subtle">
          <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
          <button type="button" id="btn-confirm-revoke" class="btn btn-destructive">Revoke access</button>
        </div>
      </div>
    </div>

    <!-- Reinstate Student Confirmation Modal Dialog -->
    <div id="reinstate-student-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="reinstate-modal-title">
      <div class="modal-dialog confirm max-w-md p-6 bg-raised border border-subtle rounded-xl shadow-lg">
        <h2 id="reinstate-modal-title" class="text-lg font-semibold text-primary mb-2">Reinstate Course Access</h2>
        <p class="text-sm text-secondary mb-4 leading-relaxed">
          Reinstate access for <strong id="reinstate-student-display-name" class="text-primary font-semibold">${escapeHtml(student.displayName)}</strong>?
        </p>
        <p class="text-xs text-muted mb-4">
          The student will immediately regain access to resume their course where they left off, on their previously pinned version.
        </p>
        <input type="hidden" id="reinstate-enrollment-id-input" value="${escapeHtml(enr.id)}" />
        <div class="flex justify-end gap-3 pt-3 border-t border-subtle">
          <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
          <button type="button" id="btn-confirm-reinstate" class="btn btn-primary">Reinstate access</button>
        </div>
      </div>
    </div>
  `;

  return renderAuthorWorkspaceShell({
    courseId: props.courseId,
    courseTitle: props.courseTitle,
    publicationState: props.publicationState,
    hasUnpublishedChanges: props.hasUnpublishedChanges,
    activeTab: 'students',
    editorContent: content,
  });
}
