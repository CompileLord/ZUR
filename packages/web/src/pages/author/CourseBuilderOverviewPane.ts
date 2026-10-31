import { renderIcon } from '../../components/common/icons.ts';
import { formatDate } from '../../utils/formatters.ts';
import type { CourseBuilderPageOptions } from './CourseBuilderTypes.ts';

export function renderCourseOverviewPane(opts: CourseBuilderPageOptions, grip: string, menuBtn: (label: string) => string): string {
    const totalLessons = opts.modules.reduce((acc, m) => acc + m.lessons.length, 0);
    const totalSteps = opts.modules.reduce((acc, m) => acc + m.lessons.reduce((lAcc, l) => lAcc + l.steps.length, 0), 0);
    const totalMinutes = opts.modules.reduce((acc, m) => acc + m.lessons.reduce((lAcc, l) => lAcc + l.steps.reduce((sAcc, s) => sAcc + (s.estimatedDurationMinutes || 0), 0), 0), 0);
    const editedText = opts.lastEditTime ? formatDate(opts.lastEditTime) : '';

    const moduleCards = opts.modules
      .map((m, idx) => {
        const steps = m.lessons.reduce((a, l) => a + l.steps.length, 0);
        const minutes = m.lessons.reduce((a, l) => a + l.steps.reduce((s, st) => s + (st.estimatedDurationMinutes || 0), 0), 0);
        const emptyLessons = m.lessons.filter((l) => l.steps.length === 0).length;
        const chip =
          m.lessons.length === 0
            ? '<span class="status-badge warning">No lessons yet</span>'
            : emptyLessons > 0
            ? `<span class="status-badge warning">${emptyLessons} ${emptyLessons === 1 ? 'lesson needs' : 'lessons need'} steps</span>`
            : '<span class="status-badge success">Content complete</span>';
        const cleanTitle = m.title.replace(/^Module\s+\d+\s*:\s*/i, '');
        const typeCounts = (['theory', 'video', 'quiz', 'python'] as const)
          .map((t) => ({ t, n: m.lessons.reduce((a, l) => a + l.steps.filter((s) => s.type === t).length, 0) }))
          .filter((x) => x.n > 0)
          .map((x) => `<span class="step-type-${x.t} module-type-count" title="${x.n} ${x.t}">${renderIcon(x.t === 'theory' ? 'file-text' : x.t === 'video' ? 'video' : x.t === 'quiz' ? 'list-checks' : 'code', { size: 13 })}${x.n}</span>`)
          .join('');
        return `
          <li class="module-card" data-reorder="module" data-id="${m.id}" data-parent="${opts.courseId}">
            <div class="module-card-top" draggable="true">
              ${grip}
              <span class="module-card-index">Module ${idx + 1}</span>
              ${chip}
              <span class="module-card-spacer"></span>
              ${menuBtn(cleanTitle)}
            </div>
            <h3 class="module-card-title"><a href="/teach/${opts.courseId}/content?type=module&id=${m.id}" title="${cleanTitle}">${cleanTitle}</a></h3>
            <div class="module-card-meta">
              <span>${m.lessons.length} ${m.lessons.length === 1 ? 'lesson' : 'lessons'}</span>
              <span class="meta-separator">&middot;</span>
              <span>${steps} ${steps === 1 ? 'step' : 'steps'}</span>
              <span class="meta-separator">&middot;</span>
              <span>~${minutes} min</span>
            </div>
            <div class="module-card-types">${typeCounts}</div>
          </li>`;
      })
      .join('');

    return `
      <div class="builder-center-pane builder-overview">
        <header class="pane-header overview-header">
          <div>
            <h1 class="page-title">${opts.courseTitle}</h1>
            <p class="overview-sub text-secondary">${opts.modules.length} ${opts.modules.length === 1 ? 'module' : 'modules'} &middot; ${totalLessons} ${totalLessons === 1 ? 'lesson' : 'lessons'} &middot; ${totalSteps} ${totalSteps === 1 ? 'step' : 'steps'} &middot; ~${totalMinutes} min${editedText ? ` &middot; Last edited ${editedText}` : ''}</p>
          </div>
          <details class="add-module-disclosure overview-add-module">
            <summary class="btn btn-primary btn-compact cursor-pointer list-none">+ Add module</summary>
            <form method="POST" action="/teach/${opts.courseId}/modules" class="overview-add-module-form">
              <input type="text" name="title" class="text-input" placeholder="Module title" aria-label="New module title" required />
              <button type="submit" class="btn btn-primary btn-compact">Create</button>
            </form>
          </details>
        </header>

        ${opts.modules.length === 0
          ? '<div class="overview-empty card"><h2 class="section-title">Start with a module</h2><p class="text-secondary">Modules group lessons. Add your first module, then add lessons and steps.</p></div>'
          : `<ul class="module-card-grid" role="list" aria-label="Modules in this course" data-reorder-scope="overview-modules">${moduleCards}</ul>
        <p class="overview-hint text-xs text-muted">Drag cards to reorder, or use the actions menu (Alt+Up / Alt+Down on a focused row).</p>`}
      </div>
    `;
}
