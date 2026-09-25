import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';

export interface CourseAnalyticsPageProps {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  availableVersions?: Array<{ id: string; versionNumber: number }>;
  analytics: {
    courseId: string;
    courseVersionId: string | null;
    windowDays: number;
    activeEnrollments: number;
    learningActiveStudents: number;
    completionRate: {
      count: number;
      total: number;
      percentage: number;
    };
    averageProgress: number;
    exerciseInsights: Array<{
      stepId: string;
      stepTitle: string;
      stepType: string;
      moduleTitle: string;
      lessonTitle: string;
      distinctParticipants: number;
      distinctPassCount: number;
      passRatePercentage: number | null;
      medianAttemptsToPass: number | null;
      lastAssessedActivityAt: string | null;
      totalSubmissions: number;
      waiverCount: number;
      infraFailureCount: number;
    }>;
  };
  filters?: {
    versionId?: string;
    windowDays?: number;
  };
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
  if (!iso) return 'No assessed attempts yet';
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

export function renderCourseAnalyticsPage(props: CourseAnalyticsPageProps): string {
  const an: any = props.analytics || {};
  const filters = props.filters;
  const currentWindowDays = filters?.windowDays ?? an.timeWindowDays ?? an.windowDays ?? 7;
  const versionsList = props.availableVersions || [];

  const comp = an.completion || an.completionRate || {};
  const totalActive = comp.totalActive ?? comp.totalActiveCount ?? comp.total ?? an.activeEnrollments ?? 0;
  const completedCount = comp.completedCount ?? comp.count ?? 0;
  const completionPercent = totalActive > 0 ? (comp.ratePercent ?? comp.completionRatePercent ?? comp.percentage ?? null) : null;
  const avgProgress = totalActive > 0 ? (an.averageProgressPercent ?? an.averageProgress ?? null) : null;
  const insightsList: any[] = an.exerciseInsights || [];

  const content = `
    <div class="analytics-page-container p-6 max-w-7xl mx-auto" data-course-id="${escapeHtml(props.courseId)}">
      <!-- Top Header & Filter Toolbar -->
      <header class="analytics-header flex flex-wrap justify-between items-center gap-4 mb-6 pb-4 border-b border-subtle">
        <div>
          <h1 class="page-title text-2xl font-bold tracking-tight">Course analytics</h1>
          <p class="text-sm text-secondary mt-1">
            Exact learning activity and completion metrics computed strictly from authoritative records.
          </p>
        </div>

        <!-- Filter Controls -->
        <div class="analytics-filters flex flex-wrap items-center gap-3">
          ${versionsList.length > 0 ? `
            <div>
              <label for="analytics-version-filter" class="sr-only">Enrollment summary version</label>
              <select id="analytics-version-filter" class="form-select text-sm">
                <option value="" ${!filters?.versionId ? 'selected' : ''}>All versions</option>
                ${versionsList.map((v: any) => `
                  <option value="${escapeHtml(String(v.versionNumber))}" ${filters?.versionId === String(v.versionNumber) ? 'selected' : ''}>
                    Version ${v.versionNumber}
                  </option>
                `).join('')}
              </select>
            </div>
          ` : ''}

          <div>
            <label for="analytics-window-filter" class="sr-only">Reporting window</label>
            <select id="analytics-window-filter" class="form-select text-sm">
              <option value="7" ${currentWindowDays === 7 ? 'selected' : ''}>Last 7 days</option>
              <option value="14" ${currentWindowDays === 14 ? 'selected' : ''}>Last 14 days</option>
              <option value="30" ${currentWindowDays === 30 ? 'selected' : ''}>Last 30 days</option>
              <option value="90" ${currentWindowDays === 90 ? 'selected' : ''}>Last 90 days</option>
            </select>
          </div>

          <button id="btn-apply-analytics-filters" class="btn btn-secondary btn-compact" type="button">
            Apply
          </button>
        </div>
      </header>

      <p class="analytics-version-scope text-sm text-secondary" role="note">
        Enrollment metrics follow the selected version scope. Exercise insights show one immutable version${filters?.versionId ? `, Version ${escapeHtml(filters.versionId)}` : `; latest release, Version ${escapeHtml(String(an.versionNumber ?? 'unavailable'))}`}.
      </p>

      <!-- Horizontal Definition List of Metrics (Design §12 P30 & PRD §14) -->
      <section class="horizontal-metrics-section mb-8" aria-label="Course summary metrics">
        <dl class="metrics-definition-list">
          <!-- Metric 1: Active Enrollments -->
          <div class="metrics-definition-item">
            <dt>Active enrollments</dt>
            <dd>${an.activeEnrollments ?? 0}</dd>
            <p class="metric-caption">Learners currently enrolled in Active state</p>
          </div>

          <!-- Metric 2: Learning-active Students -->
          <div class="metrics-definition-item">
            <dt>Learning-active students</dt>
            <dd>${an.learningActiveStudents ?? 0}</dd>
            <p class="metric-caption">Active students with a completion or assessment submission in the last ${currentWindowDays} days</p>
          </div>

          <!-- Metric 3: Completion Rate -->
          <div class="metrics-definition-item">
            <dt>Completion rate</dt>
            <dd>${completionPercent === null ? 'No activity yet' : `${completionPercent}%`}</dd>
            <p class="metric-caption">${totalActive === 0 ? 'No active enrollments' : `${completedCount} / ${totalActive} active students finished`}</p>
          </div>

          <!-- Metric 4: Average Progress -->
          <div class="metrics-definition-item">
            <dt>Average progress</dt>
            <dd>${avgProgress === null ? 'No activity yet' : `${avgProgress}%`}</dd>
            <p class="metric-caption">${totalActive === 0 ? 'No active enrollments' : 'Mean required-step completion across all active enrollments'}</p>
          </div>
        </dl>
      </section>

      <!-- Exercise Insights Section -->
      <section class="exercise-insights-section space-y-4" aria-labelledby="insights-heading">
        <div class="flex justify-between items-end pb-2">
          <div>
            <h2 id="insights-heading" class="text-lg font-bold text-primary">Exercise insights — Version ${escapeHtml(String(an.versionNumber ?? 'latest'))}${!filters?.versionId ? ' (latest release)' : ''}</h2>
            <p class="text-xs text-secondary mt-0.5">
              Exercise results use one immutable release at a time and are never combined across versions. The reporting window is ${currentWindowDays} days. Excludes infrastructure failures and admin waivers.
            </p>
          </div>
        </div>

        <div class="data-table-wrapper border border-subtle rounded-xl bg-surface overflow-x-auto shadow-sm">
          <table class="data-table w-full text-left border-collapse text-sm" aria-label="Exercise performance metrics">
            <thead>
              <tr class="border-b border-subtle bg-raised text-secondary font-semibold text-xs uppercase tracking-wider">
                <th scope="col" class="py-3 px-4">Exercise / Step</th>
                <th scope="col" class="py-3 px-4 text-center">Participants</th>
                <th scope="col" class="py-3 px-4">Pass rate</th>
                <th scope="col" class="py-3 px-4 text-center">Median attempts to pass</th>
                <th scope="col" class="py-3 px-4">Last assessed activity</th>
                <th scope="col" class="py-3 px-4">Annotations</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-subtle">
              ${insightsList.length === 0 ? `
                <tr>
                  <td colspan="6" class="p-8 text-center text-secondary">
                    <p class="font-medium text-base mb-1">No assessed exercises found</p>
                    <p class="text-xs text-muted">This course does not contain assessed exercises (python/quiz) in the selected version.</p>
                  </td>
                </tr>
              ` : insightsList.map((ex: any) => {
                const distinctParticipants = ex.distinctParticipants ?? 0;
                const distinctPassing = ex.distinctPassingStudents ?? ex.distinctPassCount ?? 0;
                const passRate = ex.passRatePercent ?? ex.passRatePercentage;
                const hasAssessedAttempts = distinctParticipants > 0 && passRate !== null && passRate !== undefined;
                const isSmallSample = distinctParticipants > 0 && distinctParticipants < 5;
                const medianAttempts = ex.medianAttemptsToPass;
                const lastAct = ex.lastActivityAt || ex.lastAssessedActivityAt;
                const waivers = ex.waiverCount ?? 0;
                const infraFailures = ex.infrastructureFailureCount ?? ex.infraFailureCount ?? 0;
                const stepType = ex.type || ex.stepType || 'exercise';

                return `
                  <tr class="hover:bg-hover transition-colors">
                    <td class="py-3.5 px-4">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="badge-${escapeHtml(stepType)} text-[10px] font-mono uppercase px-1.5 py-0.5 rounded">
                          ${escapeHtml(stepType)}
                        </span>
                        <span class="text-xs text-muted truncate">${escapeHtml(ex.lessonTitle || '')}</span>
                      </div>
                      <div class="font-medium text-primary">${escapeHtml(ex.stepTitle || '')}</div>
                    </td>

                    <td class="py-3.5 px-4 text-center">
                      <span class="font-mono text-sm font-semibold text-primary">
                        ${distinctParticipants}
                      </span>
                      ${isSmallSample ? `
                        <span class="block text-[10px] text-muted font-normal">(small sample)</span>
                      ` : ''}
                    </td>

                    <td class="py-3.5 px-4">
                      ${hasAssessedAttempts ? `
                        <div>
                          <span class="font-bold text-sm ${passRate >= 70 ? 'text-success' : passRate >= 40 ? 'text-warning' : 'text-danger'}">
                            ${passRate}%
                          </span>
                          <span class="text-xs text-secondary ml-1">
                            (${distinctPassing} / ${distinctParticipants})
                          </span>
                        </div>
                      ` : `
                        <span class="text-xs text-muted italic">No assessed attempts yet</span>
                      `}
                    </td>

                    <td class="py-3.5 px-4 text-center">
                      ${medianAttempts !== null && medianAttempts !== undefined ? `
                        <span class="font-mono text-sm font-bold text-primary">
                          ${medianAttempts}
                        </span>
                      ` : `
                        <span class="text-xs text-muted">—</span>
                      `}
                    </td>

                    <td class="py-3.5 px-4 text-xs text-secondary">
                      ${formatDate(lastAct)}
                    </td>

                    <td class="py-3.5 px-4 text-xs text-secondary">
                      <div class="flex flex-col gap-1">
                        ${waivers > 0 ? `
                          <span class="text-info font-medium">
                            • ${waivers} admin waiver${waivers === 1 ? '' : 's'}
                          </span>
                        ` : ''}
                        ${infraFailures > 0 ? `
                          <span class="text-muted">
                            • ${infraFailures} infra error${infraFailures === 1 ? '' : 's'} excluded
                          </span>
                        ` : ''}
                        ${waivers === 0 && infraFailures === 0 ? `
                          <span class="text-muted">—</span>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div class="p-4 bg-surface border border-subtle rounded-lg text-xs text-secondary leading-relaxed">
          <strong>Metric notes:</strong> Admin and preview activity is excluded from product metrics. Pass rates reflect distinct students with a verified pass over distinct students with at least one non-infrastructure submission. Waivers are tracked separately and never counted as passed student submissions.
        </div>
      </section>
    </div>
  `;

  return renderAuthorWorkspaceShell({
    courseId: props.courseId,
    courseTitle: props.courseTitle,
    publicationState: props.publicationState,
    hasUnpublishedChanges: props.hasUnpublishedChanges,
    activeTab: 'analytics',
    editorContent: content,
  });
}
