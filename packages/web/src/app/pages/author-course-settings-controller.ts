import { s2Request } from '../api.ts';
import { s2Current } from '../helpers.ts';
import { navigateTo, renderApp } from '../navigation.ts';
import { appEl } from '../state.ts';

export async function loadCourseSettingsPage(path: string, courseId: string, course: any): Promise<void> {
  const categories = await s2Request('/api/categories');
  const { renderCourseSettingsPage, initSettingsSections } = await import('../../pages/author/CourseSettingsPage.ts');
  if (s2Current(path)) appEl.innerHTML = renderCourseSettingsPage({ course, categories });
  initSettingsSections(appEl);
  appEl.querySelectorAll<HTMLFormElement>('form[data-course-lifecycle]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const action = form.dataset.courseLifecycle;
    if (!['archive', 'restore', 'delete'].includes(action || '')) return;
    if (action === 'delete' && !window.confirm('Permanently delete this course draft and all its lessons?')) return;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      await s2Request(`/api/author/courses/${encodeURIComponent(courseId)}${action === 'delete' ? '' : `/${action}`}`, action === 'delete' ? 'DELETE' : 'POST');
      if (!s2Current(path)) return;
      if (action === 'delete') navigateTo('/teach');
      else renderApp(path);
    } catch (err: any) {
      if (!s2Current(path)) return;
      if (button) button.disabled = false;
      form.querySelector('[role="alert"]')?.remove();
      const alert = document.createElement('p');
      alert.setAttribute('role', 'alert'); alert.className = 'form-error';
      alert.textContent = err.message || 'Could not update the course. Try again.';
      form.append(alert);
    }
  }));
  appEl.querySelectorAll('form.metadata-form, form.access-form').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const target = event.currentTarget as HTMLFormElement;
    const fields = Object.fromEntries(new FormData(target).entries()) as Record<string, string>;
    const metadata = target.classList.contains('metadata-form');
    if (metadata) { fields.tags = fields.tags || ''; fields.learningOutcomes = fields.learningOutcomes || ''; }
    try {
      await s2Request(`/api/author/courses/${courseId}/${metadata ? 'metadata' : 'settings'}`, 'PUT', metadata ? { expectedRevision: Number(fields.expectedRevision), metadata: { ...fields, tags: fields.tags.split(',').map(v => v.trim()).filter(Boolean), learningOutcomes: fields.learningOutcomes.split('\n').map(v => v.trim()).filter(Boolean), estimatedDurationMinutes: Number(fields.estimatedDurationMinutes) || 0 } } : fields);
      renderApp(path);
    } catch (err: any) { window.alert(err.message); }
  }));
  return;
}
