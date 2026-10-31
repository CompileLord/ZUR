import { renderIcon } from '../../components/common/icons.ts';
import { formatDate, sentenceCase, humanizeEnum } from '../../utils/formatters.ts';
import { formField, table, pill, idChip, reportTone, detailHeader, pageNav, escapeAdmin } from './admin-page-helpers.ts';

export function renderAdminReportsContent(path: string, data: any): string {
      const searchParams = new URLSearchParams(path.split('?')[1] || '');
      const activeStatus = searchParams.get('status') || '';

      const rows = (data.items || []).map(
        (r: any) => `
        <tr class="report-row report-row-${escapeAdmin(r.status)}">
          <td><a href="/admin/reports/${encodeURIComponent(r.id)}" class="table-link font-medium">${escapeAdmin(humanizeEnum(r.type))}</a></td>
          <td><span class="text-secondary">${escapeAdmin(r.courseTitle)}</span></td>
          <td><span class="text-secondary">${escapeAdmin(r.reporterName)}</span></td>
          <td>${pill(sentenceCase(r.status), reportTone(r.status))}</td>
          <td><time datetime="${escapeAdmin(r.createdAt)}" title="${escapeAdmin(r.createdAt)}" class="text-secondary">${formatDate(r.createdAt)}</time></td>
        </tr>
      `
      );

      const emptyMessage = activeStatus === 'open'
        ? 'No open reports.'
        : activeStatus
        ? 'No reports match these filters.'
        : 'No reports submitted.';

      return `
        <div class="admin-page-header">
          <h1 class="page-title">Reports</h1>
        </div>

        <div class="admin-toolbar-row mb-4">
          <nav class="segmented-control" aria-label="Filter reports by status">
            <a href="/admin/reports" class="segmented-control-btn ${!activeStatus ? 'active' : ''}" ${!activeStatus ? 'aria-current="page"' : ''}>All</a>
            <a href="/admin/reports?status=open" class="segmented-control-btn ${activeStatus === 'open' ? 'active' : ''}" ${activeStatus === 'open' ? 'aria-current="page"' : ''}>Open</a>
            <a href="/admin/reports?status=investigating" class="segmented-control-btn ${activeStatus === 'investigating' ? 'active' : ''}" ${activeStatus === 'investigating' ? 'aria-current="page"' : ''}>Investigating</a>
            <a href="/admin/reports?status=resolved" class="segmented-control-btn ${activeStatus === 'resolved' ? 'active' : ''}" ${activeStatus === 'resolved' ? 'aria-current="page"' : ''}>Resolved</a>
          </nav>
        </div>

        ${table(['Type', 'Course', 'Reporter', 'Status', 'Submitted'], rows, emptyMessage, activeStatus ? '<a href="/admin/reports">Show all reports</a>' : 'Learner reports appear here for triage.')}
        ${pageNav(data, path)}
      `;
}

export function renderAdminReportDetailContent(data: any): string {
      const hasValidVersion = Boolean(data.courseVersionId && data.versionDetails);
      const versionLabel = data.versionNumber ? `Version ${data.versionNumber}` : data.courseVersionId || 'Unavailable';
      const versionParam = hasValidVersion ? `versionId=${encodeURIComponent(data.courseVersionId)}` : '';
      const stepParam = hasValidVersion && data.stepId ? `&stepId=${encodeURIComponent(data.stepId)}` : '';
      const targetCourseUrl = data.courseId && hasValidVersion ? `/admin/courses/${encodeURIComponent(data.courseId)}?${versionParam}${stepParam}` : null;

      const versionLinkHtml = targetCourseUrl
        ? `<a href="${escapeAdmin(targetCourseUrl)}" class="admin-exact-version-link font-medium underline" data-report-version-link>${escapeAdmin(versionLabel)}${data.versionDetails ? (data.versionDetails.isLatest ? ' (latest published)' : ' (historical version, not newest)') : ''}</a>`
        : `<span class="text-muted" data-report-version-unavailable>Unavailable: no version snapshot recorded</span>`;

      const stepLabel = data.stepTitle ? `${data.stepTitle} (${data.stepId})` : data.stepId || 'Course-level';
      const stepLinkHtml = data.stepId
        ? targetCourseUrl
          ? `<a href="${escapeAdmin(targetCourseUrl)}" class="admin-exact-step-link font-medium underline" data-report-step-link>${escapeAdmin(stepLabel)}</a>`
          : `<span class="text-muted" data-report-step-unavailable>${escapeAdmin(stepLabel)}</span>`
        : `<span class="text-muted">Course-level report</span>`;

      return `
        <p class="mb-4"><a href="/admin/reports" class="back-link">${renderIcon('arrow-left', { size: 14 })} Back to reports</a></p>
        ${detailHeader(`${escapeAdmin(humanizeEnum(data.type))} · ${escapeAdmin(data.courseTitle)}`, pill(sentenceCase(data.status), reportTone(data.status)), idChip(data.id, 'Report ID'))}

        <div class="admin-detail-layout">
          <div class="admin-detail-main">
            <div class="admin-section-card mb-4">
              <h2 class="section-title">Report description</h2>
              <p class="text-sm leading-relaxed">${escapeAdmin(data.description)}</p>
            </div>

            <div class="report-context-panel mb-4">
              <h3 class="text-sm font-semibold mb-3">Reported learning context</h3>
              <dl class="admin-context-list">
                <div><dt>Course</dt><dd><a href="/admin/courses/${encodeURIComponent(data.courseId)}" class="underline font-medium">${escapeAdmin(data.courseTitle)}</a></dd></div>
                <div><dt>Immutable version</dt><dd>${versionLinkHtml}</dd></div>
                <div><dt>Step</dt><dd>${stepLinkHtml}</dd></div>
              </dl>
              ${data.versionDetails?.createdAt ? `<p class="text-xs text-muted mt-3 pt-2 border-t border-subtle">Pinned to immutable version published ${formatDate(data.versionDetails.createdAt)}.</p>` : ''}
            </div>

            ${data.submittedCode ? `<details class="disclosure-card mb-4"><summary class="cursor-pointer font-medium">Consented submitted code</summary><div class="disclosure-body"><pre class="code-pre">${escapeAdmin(data.submittedCode)}</pre></div></details>` : ''}
          </div>

          <aside class="admin-detail-side admin-triage-card" aria-labelledby="triage-title">
            <h2 id="triage-title" class="admin-side-title">Resolution and triage</h2>
            <form data-admin-mutation action="/api/admin/reports/${encodeURIComponent(data.id)}" method="patch" class="admin-mutation-form">
              <label class="form-group">
                <span class="form-label">Status</span>
                <select name="status" class="form-input form-select">
                  <option value="open" ${data.status === 'open' ? 'selected' : ''}>Open</option>
                  <option value="investigating" ${data.status === 'investigating' ? 'selected' : ''}>Investigating</option>
                  <option value="resolved" ${data.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                </select>
              </label>
              ${formField('outcome', 'Resolution outcome', 'text', false)}
              <label class="form-group">
                <span class="form-label">Internal notes</span>
                <textarea class="form-input form-textarea" name="internalNotes">${escapeAdmin(data.internalNotes || '')}</textarea>
              </label>
              ${formField('reason', 'Reason')}
              ${formField('currentPassword', 'Confirm administrator password', 'password')}
              <div class="flex justify-end gap-2 mt-4">
                <button class="btn btn-primary" type="submit">Update report</button>
              </div>
              <p class="form-error hidden" role="alert"></p>
            </form>
          </aside>
        </div>
      `;
}
