import { renderIcon } from '../../components/common/icons.ts';
import { formatDate, sentenceCase } from '../../utils/formatters.ts';
import { formField, table, pill, idChip, detailHeader, pageNav, escapeAdmin, renderActionDialog } from './admin-page-helpers.ts';

export function renderAdminCoursesContent(path: string, data: any): string {
      const searchParams = new URLSearchParams(path.split('?')[1] || '');
      const searchVal = searchParams.get('search') || '';

      const rows = (data.items || []).map(
        (c: any) => `
        <tr>
          <td class="course-title-cell"><a href="/admin/courses/${encodeURIComponent(c.id)}" class="table-link font-medium">${escapeAdmin(c.title)}</a></td>
          <td class="course-owner-cell"><span class="text-secondary">${escapeAdmin(c.owner_name)}</span></td>
          <td class="admin-nowrap">${pill(sentenceCase(c.publication_status), c.publication_status === 'published' ? 'success' : 'neutral')}</td>
          <td class="admin-nowrap">${pill(sentenceCase(c.visibility), 'neutral')}</td>
          <td class="text-right admin-nowrap"><span class="font-mono text-secondary">${escapeAdmin(c.latest_version ?? 'None')}</span></td>
          <td class="admin-nowrap">${c.is_suspended ? pill('Suspended', 'danger') : pill('Available', 'success')}</td>
          <td class="text-right admin-nowrap">${c.open_reports > 0 ? `<a href="/admin/reports" class="status-badge warning" title="${c.open_reports} open reports">${c.open_reports}</a>` : `<span class="text-muted">0</span>`}</td>
        </tr>
      `
      );

      return `
        <div class="admin-page-header">
          <h1 class="page-title">Courses</h1>
        </div>

        <form class="admin-filter-toolbar" action="/admin/courses" method="get">
          <div class="search-input-wrapper">
            <span class="search-input-icon" aria-hidden="true">${renderIcon('search', { size: 16 })}</span>
            <input class="form-input search-input" name="search" placeholder="Search by course title…" value="${escapeAdmin(searchVal)}" aria-label="Search courses">
          </div>
          <button type="submit" class="btn btn-secondary btn-compact">Search</button>
          ${searchVal ? `<a href="/admin/courses" class="btn btn-ghost btn-compact">Clear search</a>` : ''}
        </form>

        ${table(
          ['Course', 'Owner', 'Publication', 'Visibility', { label: 'Latest version', align: 'right' }, 'Availability', { label: 'Open reports', align: 'right' }],
          rows,
          'No matching courses.',
          searchVal ? '<a href="/admin/courses">Clear search</a> to list every course.' : 'Courses appear here once an author creates one.'
        )}
        ${pageNav(data, path)}
      `;
}

export function renderAdminCourseDetailContent(path: string, data: any): string {
      const query = new URLSearchParams(path.split('?')[1] || '');
      const targetVersionId = query.get('versionId');
      const targetStepId = query.get('stepId');
      const targetVersion = targetVersionId && data.versions ? data.versions.find((v: any) => v.id === targetVersionId) : null;
      const targetStep = targetVersion && targetStepId ? targetVersion.steps.find((s: any) => s.id === targetStepId) : null;

      let inspectionBanner = '';
      let snapshotInspectionPanel = '';
      if (targetVersionId) {
        if (!targetVersion) {
          inspectionBanner = `<aside class="alert alert-warning my-3" role="status"><strong>Requested immutable version not found:</strong> Version snapshot <code>${escapeAdmin(targetVersionId)}</code> is not recorded for this course.</aside>`;
        } else {
          const isLatest = targetVersion.versionNumber === data.latestVersion;
          let stepInspection = '';
          if (targetStep) {
            const problemHtml = targetStep.content?.problemStatement
              ? `<div class="step-detail-problem mt-2"><strong class="text-xs text-muted uppercase">Problem statement:</strong><p class="text-sm mt-1">${escapeAdmin(targetStep.content.problemStatement)}</p></div>`
              : '';
            const starterHtml = targetStep.content?.starterCode
              ? `<div class="step-detail-starter mt-2"><strong class="text-xs text-muted uppercase">Starter code:</strong><pre class="p-2 bg-canvas border border-subtle rounded text-xs overflow-x-auto">${escapeAdmin(targetStep.content.starterCode)}</pre></div>`
              : '';
            stepInspection = `<div class="target-step-card border border-subtle p-3 rounded mt-2 bg-subtle" data-inspected-step="${escapeAdmin(targetStep.id)}"><h4 class="text-sm font-semibold mb-1">Target step snapshot: ${escapeAdmin(targetStep.title)}</h4><p class="text-xs text-secondary mb-1">${escapeAdmin(targetStep.moduleTitle || 'Module')} › ${escapeAdmin(targetStep.lessonTitle || 'Lesson')} · Type: <code>${escapeAdmin(targetStep.type)}</code> · ${targetStep.isRequired ? 'Required' : 'Optional'}</p>${problemHtml}${starterHtml}</div>`;
          }

          snapshotInspectionPanel = `
            <section class="exact-version-inspection-panel border border-accent p-3 rounded my-3" data-inspected-version="${escapeAdmin(targetVersion.id)}" role="region" aria-label="Exact Version Inspection">
              <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
                <h3 class="text-sm font-bold">Version ${escapeAdmin(targetVersion.versionNumber)} · ${isLatest ? 'Latest' : 'Historical'}${targetStep ? ` · ${escapeAdmin(targetStep.title)}` : ''}</h3>
                <span class="status-badge ${isLatest ? 'success' : 'warning'}">${isLatest ? 'Latest release' : 'Historical'}</span>
              </div>
              ${stepInspection}
              <details class="text-xs text-muted mt-2">
                <summary class="cursor-pointer font-medium py-1">Technical snapshot details</summary>
                <div class="mt-1 pl-2 border-l border-subtle space-y-1">
                  <p>Version ID: <code>${escapeAdmin(targetVersion.id)}</code></p>
                  <p>Published: ${escapeAdmin(targetVersion.createdAt)}</p>
                  ${targetStep ? `<p>Step ID: <code>${escapeAdmin(targetStep.id)}</code> · ${targetStep.isRequired ? 'Required' : 'Optional'}</p>` : ''}
                </div>
              </details>
            </section>
          `;
        }
      }

      const versionOptions = (data.versions || []).flatMap((v: any) =>
        (v.steps || []).filter((s: any) => s.isRequired).map((s: any) => {
          const val = `${v.id}|${s.id}`;
          const isSelected = targetVersionId === v.id && targetStepId === s.id;
          return `<option value="${escapeAdmin(val)}" ${isSelected ? 'selected' : ''}>Version ${v.versionNumber} · ${escapeAdmin(s.title)}</option>`;
        })
      ).join('');

      const versionsList = (data.versions || [])
        .map((v: any) => `
          <li class="admin-version-row">
            <div class="admin-version-meta">
              <span class="admin-version-name">Version ${v.versionNumber}</span>
              <span class="text-secondary text-xs">Published ${formatDate(v.createdAt)}</span>
              ${idChip(v.id, 'Version ID')}
            </div>
            <a href="/admin/courses/${encodeURIComponent(data.id)}?versionId=${encodeURIComponent(v.id)}" class="btn btn-secondary btn-compact">Inspect exact snapshot</a>
          </li>
        `)
        .join('');

      return `
        <p class="mb-4"><a href="/admin/courses" class="back-link">${renderIcon('arrow-left', { size: 14 })} Back to courses</a></p>
        ${detailHeader(escapeAdmin(data.title), data.isSuspended ? pill('Suspended', 'danger') : pill('Available', 'success'), idChip(data.id, 'Course ID'))}

        ${inspectionBanner}
        ${snapshotInspectionPanel}

        <div class="admin-detail-layout">
          <div class="admin-detail-main">
        <div class="admin-entity-card mb-5">
          <div class="admin-definition-grid">
            <div class="admin-def-item">
              <span class="admin-def-label">Owner</span>
              <span class="admin-def-value">${escapeAdmin(data.ownerName)}<br><span class="text-secondary text-xs">${escapeAdmin(data.ownerEmail)}</span></span>
            </div>
            <div class="admin-def-item">
              <span class="admin-def-label">Published release</span>
              <span class="admin-def-value">Version ${escapeAdmin(data.latestVersion || 'none')}</span>
            </div>
            <div class="admin-def-item">
              <span class="admin-def-label">Active enrollments</span>
              <span class="admin-def-value font-mono">${data.activeEnrollments}</span>
            </div>
            <div class="admin-def-item">
              <span class="admin-def-label">Open reports</span>
              <span class="admin-def-value">${data.openReports > 0 ? `<a href="/admin/reports" class="status-badge warning">${data.openReports} open</a>` : `<span class="text-muted">0</span>`}</span>
            </div>
          </div>
        </div>

        <div class="admin-section-card mb-6">
          <h2 class="section-title">Published versions</h2>
          <ul class="admin-version-rows">${versionsList || '<li class="text-muted">No published releases yet.</li>'}</ul>
        </div>
          </div>
          <aside class="admin-detail-side admin-actions-card" aria-label="Course actions">
            <h2 class="admin-side-title">Course actions</h2>
            <div class="admin-actions-stack">
              <button type="button" class="btn btn-secondary" data-open-dialog="dialog-course-waiver">${renderIcon('alert-triangle', { size: 14 })} Waive broken step…</button>
              ${
                data.ownerDeletionPending && data.publicationStatus !== 'archived'
                  ? `<button type="button" class="btn btn-warning" data-open-dialog="dialog-course-archive">Archive to resolve ownership blocker…</button>`
                  : ''
              }
              ${data.isSuspended ? `<button type="button" class="btn btn-primary" data-open-dialog="dialog-course-availability">${renderIcon('play', { size: 14 })} Restore availability…</button>` : ''}
            </div>
            ${data.isSuspended ? '' : `<div class="admin-danger-zone"><h3>Danger zone</h3><button type="button" class="btn btn-danger" data-open-dialog="dialog-course-availability">${renderIcon('alert-triangle', { size: 14 })} Suspend course…</button></div>`}
          </aside>
        </div>

        <!-- Dialog: Course Availability -->
        ${renderActionDialog({
          id: 'dialog-course-availability',
          title: `${data.isSuspended ? 'Restore availability' : 'Suspend course'} · ${escapeAdmin(data.title)}`,
          target: `${escapeAdmin(data.title)} (${data.id})`,
          currentState: data.isSuspended ? 'Suspended' : 'Available',
          resultingState: data.isSuspended ? 'Available' : 'Suspended',
          effect: data.isSuspended
            ? 'Restores course visibility in catalog and unblocks learning sessions.'
            : 'Hides course from catalog and halts active learner workspace admissions.',
          actionUrl: `/api/admin/courses/${encodeURIComponent(data.id)}/suspension`,
          buttonLabel: data.isSuspended ? 'Restore availability' : 'Suspend course',
          buttonVariant: data.isSuspended ? 'primary' : 'danger',
          isDestructive: !data.isSuspended,
          extraContent: `<input type="hidden" name="suspended" value="${!data.isSuspended}">`
        })}

        <!-- Dialog: Step Waiver -->
        <dialog id="dialog-course-waiver" class="admin-modal-dialog" aria-labelledby="dialog-course-waiver-title">
          <div class="dialog-content">
            <div class="dialog-header">
              <h3 id="dialog-course-waiver-title" class="dialog-title">Waive broken step · ${escapeAdmin(data.title)}</h3>
              <button type="button" class="dialog-close-btn" data-close-dialog aria-label="Close dialog">${renderIcon('x', { size: 16 })}</button>
            </div>
            <div class="dialog-body">
              <div class="admin-action-effect-card warning mb-1">
                <span class="effect-label">Notice on progression waivers:</span>
                <p class="effect-description text-secondary text-xs mt-1 leading-relaxed">
                  Only active enrollments pinned to the selected immutable version can be affected. This satisfies progress without awarding a passing verdict. The affected scope is rechecked server-side before commit.
                </p>
              </div>

              <form class="admin-mutation-form" data-admin-mutation action="/api/admin/courses/${encodeURIComponent(data.id)}/waivers" method="post">
                <label class="form-group">
                  <span class="form-label">Version and required step</span>
                  <select class="form-input form-select" name="versionStep" data-waiver-step required>
                    <option value="">Select version and step…</option>
                    ${versionOptions}
                  </select>
                </label>
                <input type="hidden" name="reviewedAffectedCount" value="0">
                <p class="waiver-review-count text-secondary text-xs my-1 p-2 bg-canvas border border-subtle rounded" role="status">
                  Choose a step to review affected enrollments.
                </p>
                ${formField('reason', 'Reason')}
                ${formField('currentPassword', 'Confirm administrator password', 'password')}
                <div class="dialog-footer flex justify-end gap-2">
                  <button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button>
                  <button class="btn btn-primary" type="submit" disabled>Review and apply waiver</button>
                </div>
                <p class="form-error hidden" role="alert"></p>
              </form>
            </div>
          </div>
        </dialog>

        <!-- Dialog: Owner Deletion Archive -->
        ${
          data.ownerDeletionPending && data.publicationStatus !== 'archived'
            ? renderActionDialog({
                id: 'dialog-course-archive',
                title: `Archive course · ${escapeAdmin(data.title)}`,
                target: `${escapeAdmin(data.title)} (${data.id})`,
                currentState: data.publicationStatus,
                resultingState: 'Archived',
                effect: 'Archiving resolves the owner deletion request blocker after the retention period.',
                actionUrl: `/api/admin/courses/${encodeURIComponent(data.id)}/archive-for-deletion`,
                buttonLabel: 'Archive to resolve ownership blocker',
                buttonVariant: 'primary'
              })
            : ''
        }
      `;
}
