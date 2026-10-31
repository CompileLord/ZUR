import { renderAuthorWorkspaceShell } from '../../components/shells/index.ts';
import { s2Request } from '../api.ts';
import { type RouteContext } from '../context.ts';
import { escapeHtml } from '../helpers.ts';
import { renderApp } from '../navigation.ts';
import { appEl } from '../state.ts';
import { alertDialog } from '../../components/common/Dialog.ts';

export function renderAgentActivityRoute(ctx: RouteContext): void {
  const { params, searchParams, path } = ctx;
    const courseId = params.courseId || 'course-python-foundations';
    const page = Number(searchParams.get('page') || 1);
    const toolName = searchParams.get('toolName') || undefined;
    const outcome = searchParams.get('outcome') || undefined;
    const tokenId = searchParams.get('tokenId') || undefined;
    const date = searchParams.get('date') || undefined;
    const mutationId = searchParams.get('mutationId') || undefined;
    const showRestoreConfirmModal = searchParams.get('restore') === 'true';

    appEl.innerHTML = renderAuthorWorkspaceShell({
      courseId,
      courseTitle: 'Loading...',
      publicationState: 'draft',
      hasUnpublishedChanges: false,
      activeTab: 'activity' as any,
      editorContent: `
            <div class="p-8 text-center text-secondary">
              <p class="font-medium text-base mb-1">Loading agent activity and draft recovery…</p>
            </div>
          `,
    });

    const actParams = new URLSearchParams({ page: String(page) });
    if (toolName) actParams.set('toolName', toolName);
    if (outcome) actParams.set('outcome', outcome);
    if (tokenId) actParams.set('tokenId', tokenId);
    if (date) actParams.set('date', date);

    let recoveryRevisions: any[] | undefined = undefined;
    let recoveryError: string | undefined = undefined;

    Promise.all([
      s2Request(`/api/author/courses/${courseId}`),
      s2Request(`/api/author/courses/${courseId}/activity?${actParams.toString()}`),
      mutationId ? s2Request(`/api/author/courses/${courseId}/activity/${mutationId}`) : Promise.resolve(null),
      s2Request(`/api/author/courses/${courseId}/recovery`)
        .then((recoveryData) => {
          recoveryRevisions = recoveryData?.revisions || [];
        })
        .catch((recErr: any) => {
          recoveryError = recErr?.message || 'Could not verify draft recovery snapshots.';
        }),
      import('../../pages/author/AgentActivityPage.ts'),
    ]).then(([courseData, activityData, selectedMutation, _, { renderAgentActivityPage }]) => {
      if (window.location.pathname.replace(/\/+$/, '') !== path.split('?')[0].replace(/\/+$/, '')) return;

      const courseTitle = courseData?.title || 'Course Activity';
      const pubStatus = (courseData?.publicationStatus || 'draft') as any;
      const currentDraftRevision = courseData?.draftRevision ?? courseData?.draft_revision ?? 1;

      appEl.innerHTML = renderAgentActivityPage({
        courseId,
        courseTitle,
        publicationState: pubStatus,
        hasUnpublishedChanges: false,
        currentDraftRevision,
        connections: activityData?.connections || [],
        filterConnection: tokenId,
        filterDate: date,
        filterTool: toolName,
        filterOutcome: outcome,
        activities: (activityData?.items || []).map((item: any) => ({
          id: item.id,
          tokenId: item.tokenId,
          tokenLabel: item.tokenLabel,
          toolName: item.toolName,
          baseRevision: item.baseRevision,
          newRevision: item.newRevision,
          affectedEntities: item.affectedEntities,
          outcome: item.outcome,
          correlationId: item.correlationId,
          createdAt: item.createdAt,
        })),
        totalActivities: activityData?.total,
        currentPage: activityData?.page,
        totalPages: activityData?.totalPages,
        selectedMutation,
        recoveryRevisions,
        recoveryError,
        showRestoreConfirmModal,
      });

      appEl.querySelector('.activity-filters-card form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        const fd = new FormData(form);
        const q = new URLSearchParams();
        for (const [k, v] of fd.entries()) {
          if (v) q.set(k, String(v));
        }
        const targetUrl = `/teach/${courseId}/activity${q.toString() ? `?${q.toString()}` : ''}`;
        window.history.pushState({}, '', targetUrl);
        renderApp();
      });

      appEl.querySelector('form[action*="/recovery/"]')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        const action = form.getAttribute('action')!;
        const expectedRevision = (form.querySelector('input[name="expectedRevision"]') as HTMLInputElement)?.value;
        const confirmBtn = form.querySelector('#confirm-restore-btn') as HTMLButtonElement | null;
        try {
          if (confirmBtn) confirmBtn.disabled = true;
          await s2Request(action, 'POST', { expectedRevision: Number(expectedRevision) });
          window.history.pushState({}, '', `/teach/${courseId}/content`);
          renderApp();
        } catch (err: any) {
          if (
            err.status === 409 ||
            err.statusCode === 409 ||
            err.code === 'STALE_REVISION' ||
            err.code === 'REVISION_CONFLICT' ||
            String(err.message).toLowerCase().includes('modified') ||
            String(err.message).toLowerCase().includes('conflict')
          ) {
            const modal = form.closest('.modal-card') || form.parentElement;
            if (modal) {
              let conflictAlert = modal.querySelector('#restore-conflict-msg');
              if (!conflictAlert) {
                conflictAlert = document.createElement('div');
                conflictAlert.id = 'restore-conflict-msg';
                conflictAlert.className = 'restore-conflict-alert mb-3';
                conflictAlert.setAttribute('role', 'alert');
                conflictAlert.setAttribute('aria-live', 'assertive');
                modal.insertBefore(conflictAlert, form);
              }
              conflictAlert.innerHTML = `
                    <div style="background: rgba(216, 59, 1, 0.1); border: 1px solid var(--danger); border-radius: var(--radius-sm); padding: 0.75rem 1rem;">
                      <strong style="color: var(--danger); display: block; margin-bottom: 0.25rem;">Revision Conflict (Concurrent modification detected)</strong>
                      <p style="margin: 0 0 0.5rem 0; font-size: 0.875rem; color: var(--fg-default);">
                        ${escapeHtml(err.message || 'The course draft has been modified since it was loaded. Please review changes before restoring.')}
                      </p>
                      <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <a href="/teach/${escapeHtml(courseId)}/activity" id="btn-reload-current-revision" class="btn btn-secondary btn-compact">Reload latest draft state</a>
                      </div>
                    </div>
                  `;
              document.getElementById('btn-reload-current-revision')?.addEventListener('click', (ev) => {
                ev.preventDefault();
                window.history.pushState({}, '', `/teach/${courseId}/activity`);
                renderApp();
              });
              if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.title = 'Stale revision: reload draft before restoring.';
              }
              return;
            }
          }
          if (confirmBtn) confirmBtn.disabled = false;
          void alertDialog(err.message);
        }
      });
    }).catch((err: any) => {
      appEl.innerHTML = renderAuthorWorkspaceShell({
        courseId,
        courseTitle: 'Agent Activity',
        publicationState: 'draft',
        hasUnpublishedChanges: false,
        activeTab: 'content',
        editorContent: `
              <div class="p-8 text-center text-danger" id="activity-load-error">
                <p class="font-bold text-lg mb-2">Failed to load agent activity</p>
                <p class="text-sm text-secondary mb-4">${escapeHtml(err?.message || 'Failed to load agent activity data')}</p>
                <div style="display: flex; gap: 8px; justify-content: center;">
                  <button type="button" class="btn btn-primary" id="btn-retry-activity">Retry</button>
                  <a href="/teach/${escapeHtml(courseId)}/content" class="btn btn-secondary">← Back to Course Builder</a>
                </div>
              </div>
            `,
      });
      document.getElementById('btn-retry-activity')?.addEventListener('click', () => {
        renderApp();
      });
    });
    return;
}
