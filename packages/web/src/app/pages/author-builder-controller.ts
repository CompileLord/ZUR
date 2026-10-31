import { initAuthorTree, fetchInvalidStepIds, applyInvalidStepDots } from '../../pages/author/AuthorTreeComponent.ts';
import { s2Request } from '../api.ts';
import { s2Current } from '../helpers.ts';
import { hydrateDeferredAssets } from '../lesson-media.ts';
import { renderApp, navigateTo } from '../navigation.ts';
import { showRouteFailure } from '../route-loading.ts';
import { appEl } from '../state.ts';
import { confirmActionDialog } from '../../components/common/Dialog.ts';

export async function loadCourseBuilderPage(path: string, courseId: string, course: any, tree: any): Promise<void> {
  const query = new URLSearchParams(window.location.search);
  let remoteUpdate: any;
  try {
    const actRes = await s2Request(`/api/author/courses/${courseId}/activity?limit=1`);
    const latest = actRes?.items?.[0];
    const createdAt = latest?.createdAt || latest?.created_at;
    const minutesAgo = createdAt ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000) : Infinity;
    if (latest && minutesAgo < 60) {
      remoteUpdate = {
        agentName: latest.tokenLabel || latest.client_label || 'AI agent',
        timestampText: minutesAgo < 1 ? 'just now' : `${minutesAgo} min ago`,
        newRevision: latest.newRevision ?? latest.new_revision,
      };
    }
  } catch { /* activity optional */ }
  const { renderCourseBuilderPage } = await import('../../pages/author/CourseBuilderPage.ts');
  appEl.innerHTML = renderCourseBuilderPage({ courseId, courseTitle: course.title, publicationState: course.publicationStatus, hasUnpublishedChanges: course.hasUnpublishedChanges, modules: tree.modules, selectedType: (query.get('type') as any) || 'course', selectedId: query.get('id') || courseId, remoteUpdate, lastEditTime: course.lastEditTime });
  
  initAuthorTree(appEl, { courseId, request: (route, method, body) => s2Request(route, method, body), refresh: () => renderApp(path), navigate: (url) => navigateTo(url) });
  { const { initRowOverflowMenus } = await import('../../pages/author/CourseBuilderPage.ts'); initRowOverflowMenus(appEl); }
  {  void fetchInvalidStepIds(s2Request, courseId).then((ids) => { if (s2Current(path)) applyInvalidStepDots(appEl, ids); }); }

  document.getElementById('load-update-btn')?.addEventListener('click', () => {
    renderApp(path);
  });
  appEl.querySelectorAll('form[action^="/teach/"]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const target = event.currentTarget as HTMLFormElement;
    const fields = Object.fromEntries(new FormData(target).entries());
    const action = target.getAttribute('action') || '';
    const deleting = action.endsWith('/delete');
    if (deleting && !await confirmActionDialog({ title: 'Delete this item?', message: target.dataset.confirmDelete || 'Delete this item?', confirmLabel: 'Delete', isDestructive: true })) return;
    let route = action.replace(/^\/teach/, '/api/author/courses');
    if (deleting) route = route.slice(0, -7);
    if (route.endsWith('/rename')) route = route.slice(0, -7);
    if (route.endsWith('/duplicate')) route = route.slice(0, -10) + '/duplicate';
    try {
      if (action.endsWith('/reorder')) {
        let payload: any = fields;
        if (fields.direction && (fields.stepId || fields.lessonId || fields.moduleId)) {
          if (action.includes('/steps/reorder')) {
            const lessonId = action.split('/lessons/')[1]?.split('/steps/reorder')[0];
            const lesson = tree.modules.flatMap((m: any) => m.lessons).find((l: any) => l.id === lessonId);
            if (lesson) {
              const ids = lesson.steps.map((s: any) => s.id);
              const curIdx = ids.indexOf(fields.stepId);
              const targetIdx = fields.direction === 'up' ? curIdx - 1 : curIdx + 1;
              if (curIdx >= 0 && targetIdx >= 0 && targetIdx < ids.length) {
                const [moved] = ids.splice(curIdx, 1);
                ids.splice(targetIdx, 0, moved);
                payload = { stepIds: ids };
              }
            }
          } else if (action.includes('/lessons/reorder')) {
            const moduleId = action.split('/modules/')[1]?.split('/lessons/reorder')[0];
            const mod = tree.modules.find((m: any) => m.id === moduleId);
            if (mod) {
              const ids = mod.lessons.map((l: any) => l.id);
              const curIdx = ids.indexOf(fields.lessonId);
              const targetIdx = fields.direction === 'up' ? curIdx - 1 : curIdx + 1;
              if (curIdx >= 0 && targetIdx >= 0 && targetIdx < ids.length) {
                const [moved] = ids.splice(curIdx, 1);
                ids.splice(targetIdx, 0, moved);
                payload = { lessonIds: ids };
              }
            }
          } else if (action.endsWith('/modules/reorder')) {
            const ids = tree.modules.map((m: any) => m.id);
            const curIdx = ids.indexOf(fields.moduleId);
            const targetIdx = fields.direction === 'up' ? curIdx - 1 : curIdx + 1;
            if (curIdx >= 0 && targetIdx >= 0 && targetIdx < ids.length) {
              const [moved] = ids.splice(curIdx, 1);
              ids.splice(targetIdx, 0, moved);
              payload = { moduleIds: ids };
            }
          }
        }
        await s2Request(route, 'POST', payload);
        renderApp(path);
        return;
      }
      await s2Request(route, deleting ? 'DELETE' : action.endsWith('/rename') ? 'PUT' : 'POST', fields);
      if (deleting && !/\/steps\//.test(action)) navigateTo(`/teach/${encodeURIComponent(courseId)}/content`);
      else renderApp(path);
    }
    catch (err: any) { showRouteFailure(err.message, path); }
  }));
  return;
}

export async function loadAuthorPreviewPage(path: string, courseId: string, tree: any): Promise<void> {
  const steps = tree.modules.flatMap((m: any) => m.lessons.flatMap((l: any) => l.steps));
  const requested = new URLSearchParams(window.location.search).get('stepId');
  const step = steps.find((s: any) => s.id === requested) || steps[0];
  if (!step) { showRouteFailure('Add a step before previewing the course.', path); return; }
  const preview = await s2Request(`/api/author/courses/${courseId}/preview/${step.id}`);
  if (!s2Current(path)) return;
  const { renderAuthorPreviewPage, initAuthorPreviewInteractions } = await import('../../pages/author/AuthorPreviewPage.ts');
  appEl.innerHTML = renderAuthorPreviewPage({ ...preview, modules: tree.modules, returnEditorUrl: `/teach/${courseId}/content/${step.type}/${step.id}` });
  initAuthorPreviewInteractions(appEl);
  void hydrateDeferredAssets(appEl);
  return;
}
