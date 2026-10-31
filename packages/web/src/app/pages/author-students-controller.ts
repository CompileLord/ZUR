import { renderAuthorWorkspaceShell } from '../../components/shells/index.ts';
import { type RouteContext } from '../context.ts';
import { escapeHtml } from '../helpers.ts';
import { navigateTo, renderApp } from '../navigation.ts';
import { attachRosterListeners } from './author-roster-listeners.ts';
import { appEl, courseClient } from '../state.ts';
import { alertDialog } from '../../components/common/Dialog.ts';

export function renderRosterRoute(ctx: RouteContext): void {
  const { params, searchParams, path } = ctx;
    const courseId = params.courseId || 'course-python-foundations';
    const search = searchParams.get('search') || undefined;
    const status = searchParams.get('status') || undefined;
    const version = searchParams.get('version') || undefined;
    const offset = Number(searchParams.get('offset') || 0);

    appEl.innerHTML = renderAuthorWorkspaceShell({
      courseId,
      courseTitle: 'Loading students and invitations…',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      activeTab: 'students',
      editorContent: `
            <div class="p-8 text-center text-secondary">
              <p class="font-medium text-base mb-1">Loading students and invitations…</p>
            </div>
          `,
    });

    Promise.all([
      courseClient.getCourseOverview(courseId).catch(() => null),
      courseClient.getRoster(courseId, { search, status, version, offset }),
      courseClient.listInvitations(courseId),
      import('../../pages/author/StudentsAndInvitationsPage.ts'),
    ]).then(([overview, rosterRes, invRes, { renderStudentsAndInvitationsPage }]) => {
      if (window.location.pathname.replace(/\/+$/, '') !== path.split('?')[0].replace(/\/+$/, '')) return;

      const courseTitle = overview?.course?.title || 'Python foundations';
      const pubStatus = (overview?.course?.publicationStatus || 'published') as any;

      appEl.innerHTML = renderStudentsAndInvitationsPage({
        courseId,
        courseTitle,
        publicationState: pubStatus,
        hasUnpublishedChanges: false,
        totalStudentsCount: rosterRes.total,
        roster: rosterRes,
        availableVersions: rosterRes.versions,
        invitations: invRes.invitations || [],
        filters: { search, status, version },
      });

      attachRosterListeners(courseId, { search, status, version });
    }).catch((err) => {
      appEl.innerHTML = renderAuthorWorkspaceShell({
        courseId,
        courseTitle: 'Course Roster',
        publicationState: 'published',
        hasUnpublishedChanges: false,
        activeTab: 'students',
        editorContent: `
              <div class="p-8 text-center text-danger">
                <p class="font-bold text-lg mb-2">Failed to load course roster</p>
                <p class="text-sm text-secondary mb-4">${escapeHtml(err.message)}</p>
                <button class="btn btn-secondary" data-route-retry>Retry</button>
              </div>
            `,
      });
    });
    return;
}

export function renderStudentDetailRoute(ctx: RouteContext): void {
  const { params, searchParams, path } = ctx;
    const courseId = params.courseId || 'course-python-foundations';
    const enrollmentId = params.enrollmentId;
    let selectedStepId = searchParams.get('stepId') || undefined;
    const selectedAttemptId = searchParams.get('attemptId') || undefined;

    appEl.innerHTML = renderAuthorWorkspaceShell({
      courseId,
      courseTitle: 'Loading student detail…',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      activeTab: 'students',
      editorContent: `
            <div class="p-8 text-center text-secondary">
              <p class="font-medium text-base mb-1">Loading student progress and attempts…</p>
            </div>
          `,
    });

    Promise.all([
      courseClient.getCourseOverview(courseId).catch(() => null),
      courseClient.getStudentDetail(courseId, enrollmentId),
      import('../../pages/author/StudentDetailPage.ts'),
    ]).then(async ([overview, detailData, { renderStudentDetailPage }]) => {
      if (window.location.pathname.replace(/\/+$/, '') !== path.split('?')[0].replace(/\/+$/, '')) return;

      selectedStepId ||= detailData.curriculum?.[0]?.lessons?.[0]?.steps?.[0]?.id;
      let attemptPagination;
      if (selectedStepId) {
        const offset = Math.max(0, Number(searchParams.get('attemptOffset') || 0));
        const attemptsPage = await courseClient.getStudentAttempts(courseId, enrollmentId, selectedStepId, 10, offset);
        attemptPagination = { offset: attemptsPage.offset, limit: attemptsPage.limit, total: attemptsPage.total };
        const selectedId = selectedAttemptId || attemptsPage.items?.[0]?.id;
        const selected = selectedId ? await courseClient.getStudentAttempt(courseId, enrollmentId, selectedStepId, selectedId) : null;
        detailData.attempts = { [selectedStepId]: (attemptsPage.items || []).map((attempt: any) => ({
          id: attempt.id, attemptNumber: attempt.attemptNumber, verdict: attempt.verdict,
          score: null, submittedAt: attempt.submittedAt, isLatest: false,
        })) };
        if (selected) {
          const row = detailData.attempts[selectedStepId].find((attempt: any) => attempt.id === selected.id);
          if (row) row.submittedCode = selected.submittedCode;
        }
      }

      const courseTitle = detailData.enrollment.courseTitle || overview?.course?.title || 'Python foundations';
      const pubStatus = (overview?.course?.publicationStatus || 'published') as any;

      appEl.innerHTML = renderStudentDetailPage({
        courseId,
        courseTitle,
        publicationState: pubStatus,
        hasUnpublishedChanges: false,
        data: detailData,
        selectedStepId,
        selectedAttemptId,
        attemptPagination,
      });

      attachStudentDetailListeners(courseId, enrollmentId, detailData);
    }).catch((err) => {
      appEl.innerHTML = renderAuthorWorkspaceShell({
        courseId,
        courseTitle: 'Student Detail',
        publicationState: 'published',
        hasUnpublishedChanges: false,
        activeTab: 'students',
        editorContent: `
              <div class="p-8 text-center text-danger">
                <p class="font-bold text-lg mb-2">Failed to load student detail</p>
                <p class="text-sm text-secondary mb-4">${escapeHtml(err.message)}</p>
                <a href="/teach/${escapeHtml(courseId)}/students" class="btn btn-secondary">← Back to students</a>
              </div>
            `,
      });
    });
    return;
}

export function renderAnalyticsRoute(ctx: RouteContext): void {
  const { params, searchParams, path } = ctx;
    const courseId = params.courseId || 'course-python-foundations';
    const versionNumber = searchParams.get('version') ? Number(searchParams.get('version')) : undefined;
    const windowDays = searchParams.get('windowDays') ? Number(searchParams.get('windowDays')) : undefined;

    appEl.innerHTML = renderAuthorWorkspaceShell({
      courseId,
      courseTitle: 'Computing course analytics…',
      publicationState: 'published',
      hasUnpublishedChanges: false,
      activeTab: 'analytics',
      editorContent: `
            <div class="p-8 text-center text-secondary">
              <p class="font-medium text-base mb-1">Computing exact course metrics…</p>
            </div>
          `,
    });

    Promise.all([
      courseClient.getCourseOverview(courseId).catch(() => null),
      courseClient.getCourseAnalytics(courseId, { versionNumber, windowDays }),
      import('../../pages/author/CourseAnalyticsPage.ts'),
    ]).then(([overview, analyticsData, { renderCourseAnalyticsPage }]) => {
      if (window.location.pathname.replace(/\/+$/, '') !== path.split('?')[0].replace(/\/+$/, '')) return;

      const courseTitle = overview?.course?.title || 'Python foundations';
      const pubStatus = (overview?.course?.publicationStatus || 'published') as any;

      appEl.innerHTML = renderCourseAnalyticsPage({
        courseId,
        courseTitle,
        publicationState: pubStatus,
        hasUnpublishedChanges: false,
        analytics: analyticsData,
        availableVersions: analyticsData.versions || [],
        filters: { versionId: versionNumber ? String(versionNumber) : undefined, windowDays },
      });

      attachCourseAnalyticsListeners(courseId);
    }).catch((err) => {
      appEl.innerHTML = renderAuthorWorkspaceShell({
        courseId,
        courseTitle: 'Course Analytics',
        publicationState: 'published',
        hasUnpublishedChanges: false,
        activeTab: 'analytics',
        editorContent: `
              <div class="p-8 text-center text-danger">
                <p class="font-bold text-lg mb-2">Failed to load course analytics</p>
                <p class="text-sm text-secondary mb-4">${escapeHtml(err.message)}</p>
                <button class="btn btn-secondary" data-route-retry>Retry</button>
              </div>
            `,
      });
    });
    return;
}

function attachStudentDetailListeners(courseId: string, enrollmentId: string, detailData: any): void {
  const closeAllModals = () => {
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.classList.add('hidden'));
  };

  document.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
    btn.addEventListener('click', closeAllModals);
  });

  // Step selection
  document.querySelectorAll<HTMLElement>('[data-action="select-step"]').forEach((el) => {
    el.addEventListener('click', () => {
      const stepId = el.dataset.stepId;
      if (stepId) {
        const url = new URL(window.location.href);
        url.searchParams.set('stepId', stepId);
        url.searchParams.delete('attemptId');
        navigateTo(url.pathname + url.search);
      }
    });
  });

  // Attempt selection
  document.querySelectorAll<HTMLButtonElement>('[data-action="select-attempt"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stepId = btn.dataset.stepId;
      const attemptId = btn.dataset.attemptId;
      if (stepId && attemptId) {
        const url = new URL(window.location.href);
        url.searchParams.set('stepId', stepId);
        url.searchParams.set('attemptId', attemptId);
        navigateTo(url.pathname + url.search);
      }
    });
  });

  // Revoke modal
  const btnOpenRevoke = document.getElementById('btn-open-revoke-detail');
  const revokeModal = document.getElementById('revoke-student-modal');
  const revokeReasonInput = document.getElementById('revoke-reason-input') as HTMLInputElement | null;
  const btnConfirmRevoke = document.getElementById('btn-confirm-revoke') as HTMLButtonElement | null;

  btnOpenRevoke?.addEventListener('click', () => {
    revokeModal?.classList.remove('hidden');
  });

  btnConfirmRevoke?.addEventListener('click', async () => {
    btnConfirmRevoke.disabled = true;
    btnConfirmRevoke.textContent = 'Revoking…';
    try {
      await courseClient.revokeStudent(courseId, enrollmentId, revokeReasonInput?.value?.trim() || undefined);
      closeAllModals();
      renderApp();
    } catch (err: any) {
      void alertDialog(err.message || 'Failed to revoke access.');
      btnConfirmRevoke.disabled = false;
      btnConfirmRevoke.textContent = 'Revoke access';
    }
  });

  // Reinstate modal
  const btnOpenReinstate = document.getElementById('btn-open-reinstate-detail');
  const reinstateModal = document.getElementById('reinstate-student-modal');
  const btnConfirmReinstate = document.getElementById('btn-confirm-reinstate') as HTMLButtonElement | null;

  btnOpenReinstate?.addEventListener('click', () => {
    reinstateModal?.classList.remove('hidden');
  });

  btnConfirmReinstate?.addEventListener('click', async () => {
    btnConfirmReinstate.disabled = true;
    btnConfirmReinstate.textContent = 'Reinstating…';
    try {
      await courseClient.reinstateStudent(courseId, enrollmentId);
      closeAllModals();
      renderApp();
    } catch (err: any) {
      void alertDialog(err.message || 'Failed to reinstate access.');
      btnConfirmReinstate.disabled = false;
      btnConfirmReinstate.textContent = 'Reinstate access';
    }
  });
}

function attachCourseAnalyticsListeners(courseId: string): void {
  const versionSelect = document.getElementById('analytics-version-filter') as HTMLSelectElement | null;
  const windowSelect = document.getElementById('analytics-window-filter') as HTMLSelectElement | null;
  const applyBtn = document.getElementById('btn-apply-analytics-filters');

  const executeAnalyticsFilter = () => {
    const url = new URL(window.location.href);
    if (versionSelect?.value) {
      url.searchParams.set('version', versionSelect.value);
    } else {
      url.searchParams.delete('version');
    }
    if (windowSelect?.value) {
      url.searchParams.set('windowDays', windowSelect.value);
    } else {
      url.searchParams.delete('windowDays');
    }
    navigateTo(url.pathname + url.search);
  };

  applyBtn?.addEventListener('click', executeAnalyticsFilter);
  versionSelect?.addEventListener('change', executeAnalyticsFilter);
  windowSelect?.addEventListener('change', executeAnalyticsFilter);
}
