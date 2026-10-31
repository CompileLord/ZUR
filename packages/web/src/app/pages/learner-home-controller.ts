import { renderDialog } from '../../components/common/Dialog.ts';
import { renderDashboardContinuePage } from '../../pages/learning/DashboardContinuePage.ts';
import { renderEnrolledCoursePage } from '../../pages/learning/EnrolledCoursePage.ts';
import { renderAcceptInvitationPage } from '../../pages/learning/AcceptInvitationPage.ts';
import { s2Request } from '../api.ts';
import { type AppUser } from '../context.ts';
import { s2Current } from '../helpers.ts';
import { loadS2Page, renderApp } from '../navigation.ts';
import { showRouteLoading } from '../route-loading.ts';
import { appEl, authClient } from '../state.ts';

let pendingHomeNotice: string | null = null;

function showHomeNotice(message: string): void {
  const container = appEl.querySelector('.home-container');
  if (!container) return;
  container.querySelector('.home-notice')?.remove();
  const notice = document.createElement('p');
  notice.className = 'home-notice';
  notice.setAttribute('role', 'status');
  notice.textContent = message;
  const heading = container.querySelector(':scope > .page-title');
  if (heading) heading.after(notice); else container.prepend(notice);
}

/** Wires the Home "Leave course" menu item: branded confirm dialog, POST leave, SPA re-render. */
function attachHomeLeaveHandlers(path: string): void {
  if (pendingHomeNotice) { showHomeNotice(pendingHomeNotice); pendingHomeNotice = null; }
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  appEl.querySelectorAll<HTMLButtonElement>('.leave-course-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const courseId = trigger.dataset.courseId || '';
      const courseTitle = trigger.dataset.courseTitle || 'this course';
      const returnFocus = trigger.closest('details')?.querySelector<HTMLElement>('summary') || trigger;
      trigger.closest('details')?.removeAttribute('open');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderDialog({
        id: 'home-leave-course-dialog',
        title: 'Leave course?',
        bodyHtml: `<p>Are you sure you want to leave &quot;${esc(courseTitle)}&quot;? Your progress and completed steps will be saved, but this course will no longer appear in Your courses. You can rejoin later.</p><p class="form-error hidden" role="alert" data-leave-error></p>`,
        confirmLabel: 'Leave course',
        cancelLabel: 'Cancel',
        isDestructive: true,
        variant: 'confirm',
      });
      const backdrop = wrapper.firstElementChild as HTMLElement;
      document.body.append(backdrop);
      const cancel = backdrop.querySelector<HTMLButtonElement>('[data-dialog-action="cancel"]')!;
      const confirm = backdrop.querySelector<HTMLButtonElement>('[data-dialog-action="confirm"]')!;
      const errorEl = backdrop.querySelector<HTMLElement>('[data-leave-error]')!;
      let busy = false;
      const close = (restoreFocus = true) => {
        document.removeEventListener('keydown', onKeydown, true);
        backdrop.remove();
        if (restoreFocus) returnFocus.focus?.();
      };
      const onKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') { event.preventDefault(); if (!busy) close(); }
        else if (event.key === 'Tab') {
          const order = [cancel, confirm];
          const index = order.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault();
          order[(index + (event.shiftKey ? order.length - 1 : 1)) % order.length].focus();
        }
      };
      document.addEventListener('keydown', onKeydown, true);
      cancel.addEventListener('click', () => { if (!busy) close(); });
      backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop && !busy) close(); });
      confirm.addEventListener('click', async () => {
        if (busy) return;
        busy = true; confirm.disabled = true; cancel.disabled = true;
        errorEl.classList.add('hidden'); errorEl.textContent = '';
        try {
          await authClient.fetchApi(`/api/courses/${encodeURIComponent(courseId)}/leave`, { method: 'POST' });
          close(false);
          pendingHomeNotice = `You left "${courseTitle}". Your progress is saved and you can rejoin from Previous enrollments.`;
          if (s2Current(path)) void loadS2Page('P09', {}, path);
          else pendingHomeNotice = null;
        } catch (err: any) {
          busy = false; confirm.disabled = false; cancel.disabled = false;
          errorEl.textContent = err?.message || 'Could not leave the course. Try again.';
          errorEl.classList.remove('hidden');
        }
      });
      cancel.focus();
    });
  });
}

export async function loadInvitationPage(inviteToken: string, path: string): Promise<void> {
  try {
    const preview = await s2Request(`/api/invitations/${encodeURIComponent(inviteToken)}`);
    if (!s2Current(path)) return;
    const show = (error?: string) => {
      appEl.innerHTML = renderAcceptInvitationPage({ token: inviteToken, valid: preview.valid, reason: preview.reason, courseTitle: preview.course?.title, courseDescription: preview.course?.description, inviterName: preview.inviterName, expiresAt: preview.expiresAt, recipientEmailMasked: preview.recipientEmailMasked, currentUser: authClient.getUser(), error });
      appEl.querySelector('.invitation-accept-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        try { const accepted = await s2Request(`/api/invitations/${encodeURIComponent(inviteToken)}/accept`, 'POST'); window.history.pushState({}, '', `/learn/${accepted.enrollment.id}`); renderApp(); }
        catch (err: any) { show(err.message); }
      });
    };
    show();
  } catch { if (s2Current(path)) appEl.innerHTML = renderAcceptInvitationPage({ token: inviteToken, valid: false }); }
}

export async function loadHomePage(user: AppUser, path: string): Promise<void> {
  showRouteLoading('Home');
  const [data, coursesData] = await Promise.all([
    s2Request('/api/student/dashboard'),
    s2Request('/api/student/courses').catch(() => null),
  ]);
  if (!s2Current(path)) return;
  if (data.continueCourse?.enrollmentId && (data.continueCourse.nextIncompleteStepId || data.continueCourse.lastVisitedStepId)) {
    try {
      const stepId = data.continueCourse.nextIncompleteStepId || data.continueCourse.lastVisitedStepId;
      const prog = await s2Request(`/api/enrollments/${data.continueCourse.enrollmentId}/progress`);
      const targetStep = prog?.steps?.find((s: any) => s.id === stepId);
      if (targetStep) {
        data.continueCourse.nextStepTitle = targetStep.title;
        data.continueCourse.lessonTitle = targetStep.lessonTitle;
      }
    } catch { /* optional enrichment */ }
  }
  const courses = (coursesData?.enrollments || []).map((e: any) => ({
    ...e,
    percentage: e.progress?.percentage || 0,
    completedRequired: e.progress?.completedRequired || 0,
    totalRequired: e.progress?.totalRequired || 0,
    isCompleted: Boolean(e.progress?.isCompleted),
    nextStepId: e.progress?.nextIncompleteStepId || e.progress?.lastVisitedStepId,
    nextStepTitle: e.progress?.nextIncompleteStepTitle || e.progress?.lastVisitedStepTitle,
  }));
  const rawFilter = new URL(path, window.location.origin).searchParams.get('filter');
  const activeCourses = courses.filter((e: any) => e.status === 'active');
  const activeFilter: 'in_progress' | 'completed' | 'all' =
    rawFilter === 'completed' || rawFilter === 'all' || rawFilter === 'in_progress'
      ? rawFilter
      : activeCourses.length > 0 && activeCourses.every((e: any) => e.isCompleted) ? 'all' : 'in_progress';
  if (s2Current(path)) {
    appEl.innerHTML = coursesData
      ? renderDashboardContinuePage({ user, continueCourse: data.continueCourse, courses, activeFilter })
      : renderDashboardContinuePage({ user, continueCourse: data.continueCourse, recentCourses: data.recentCourses });
    attachHomeLeaveHandlers(path);
  }
  return;
}

export function loadLearnRedirect(path: string): void {
  const query = new URL(path, window.location.origin).search;
  const target = `/learn${query}`;
  window.history.replaceState({}, '', target);
  renderApp(target);
  return;
}

export async function loadEnrolledCoursePage(user: AppUser, params: Record<string, string>, path: string): Promise<void> {
  showRouteLoading('Course overview');
  const progress = await s2Request(`/api/enrollments/${params.enrollmentId}/progress`);
  if (!s2Current(path)) return;
  const modules: any[] = [];
  for (const step of progress.steps) {
    let module = modules.find(m => m.id === step.moduleId);
    if (!module) { module = { id: step.moduleId, title: String(step.moduleTitle || '').replace(/^Module\s+\d+\s*:\s*/i, ''), lessons: [] }; modules.push(module); }
    let lesson = module.lessons.find((l: any) => l.id === step.lessonId);
    if (!lesson) { lesson = { id: step.lessonId, title: String(step.lessonTitle || '').replace(/^Lesson\s+\d+\s*:\s*/i, ''), steps: [] }; module.lessons.push(lesson); }
    lesson.steps.push(step);
  }
  const duration = Number(progress.estimatedDurationMinutes) || progress.steps.reduce((sum: number, step: any) => sum + (Number(step.estimatedDurationMinutes) || 0), 0);
  appEl.innerHTML = renderEnrolledCoursePage({ user, userId: user.id, courseVersionId: progress.pinnedVersionId || progress.courseVersionId, enrollmentId: params.enrollmentId, courseId: progress.courseId, title: progress.courseTitle, description: progress.description, difficulty: progress.difficulty, estimatedDurationMinutes: duration, pinnedVersionNumber: progress.pinnedVersionNumber, percentage: progress.percentage, completedRequired: progress.completedRequired, totalRequired: progress.totalRequired, waivedRequired: progress.waivedRequired, isCompleted: progress.isCompleted, nextStepId: progress.nextIncompleteStepId, modules });
  return;
}
