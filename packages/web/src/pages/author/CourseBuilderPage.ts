import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';
import { renderIcon } from '../../components/common/icons.ts';
import { renderAuthorTree } from './AuthorTreeComponent.ts';
import { formatDate } from '../../utils/formatters.ts';

export interface StepSummary {
  id: string;
  lessonId: string;
  type: 'theory' | 'video' | 'quiz' | 'python';
  title: string;
  position: number;
  isRequired: boolean;
  estimatedDurationMinutes: number;
}

export interface LessonSummary {
  id: string;
  moduleId: string;
  title: string;
  description?: string;
  position: number;
  steps: StepSummary[];
}

export interface ModuleSummary {
  id: string;
  courseId: string;
  title: string;
  position: number;
  lessons: LessonSummary[];
}

export interface RemoteUpdateInfo {
  agentName: string;
  timestampText?: string;
  newRevision: number;
  hasLocalEdits?: boolean;
}

export interface CourseBuilderPageOptions {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  saveStatusText?: string;
  modules: ModuleSummary[];
  selectedType?: 'course' | 'module' | 'lesson' | 'step';
  selectedId?: string;
  feedbackMessage?: string;
  remoteUpdate?: RemoteUpdateInfo;
  lastEditTime?: string;
  /** Ids of steps with blocking validation errors (shown as a dot in the tree). */
  invalidStepIds?: string[];
}

/** Overflow (three-dot) menu holding destructive row actions. Uses the existing data-confirm-delete submit flow. */
function overflowDelete(label: string, action: string, confirmText: string, itemLabel: string): string {
  return `
    <details class="row-overflow">
      <summary class="row-overflow-btn" aria-label="More actions for ${label}" title="More actions">${renderIcon('more-vertical', { size: 16 })}</summary>
      <div class="row-overflow-menu" role="group" aria-label="More actions for ${label}">
        <form method="POST" action="${action}" data-confirm-delete="${confirmText}">
          <button type="submit" class="row-overflow-item is-danger">${renderIcon('trash', { size: 14 })}${itemLabel}</button>
        </form>
      </div>
    </details>`;
}

/** Closes open row overflow menus on outside click or Escape. Safe to call after every render. */
export function initRowOverflowMenus(root: ParentNode): void {
  const open = () => Array.from(root.querySelectorAll<HTMLDetailsElement>('details.row-overflow[open]'));
  const onClick = (e: Event) => {
    if (!root.querySelector('details.row-overflow')) { document.removeEventListener('click', onClick, true); return; }
    open().forEach((d) => { if (!d.contains(e.target as Node)) d.open = false; });
  };
  document.addEventListener('click', onClick, true);
  root.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Escape') return;
    const d = open()[0];
    if (!d) return;
    d.open = false;
    d.querySelector<HTMLElement>('summary')?.focus();
  });
  root.querySelectorAll<HTMLDetailsElement>('details.row-overflow').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) open().forEach((o) => { if (o !== d) o.open = false; });
  }));
}

export function renderCourseBuilderPage(opts: CourseBuilderPageOptions): string {
  opts = safeTemplateData(opts);
  const selectedType = opts.selectedType || 'course';
  const selectedId = opts.selectedId || opts.courseId;

  const treeContent = renderAuthorTree({
    courseId: opts.courseId,
    courseTitle: opts.courseTitle,
    modules: opts.modules,
    selectedType,
    selectedId,
    title: 'Structure',
    invalidStepIds: opts.invalidStepIds,
  });
  const menuBtn = (label: string) =>
    `<button type="button" class="tree-row-menu-btn" data-reorder-menu aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${label}" title="Actions (Alt+Up / Alt+Down to move)">${renderIcon('more-horizontal', { size: 14 })}</button>`;
  const grip = `<span class="tree-grip" aria-hidden="true">${renderIcon('grip-vertical', { size: 14 })}</span>`;

  // Center editor pane based on selected entity
  let editorContent = '';

  if (selectedType === 'course') {
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

    editorContent = `
      <div class="builder-center-pane builder-overview">
        <header class="pane-header overview-header">
          <div>
            <h1 class="page-title">${opts.courseTitle}</h1>
            <p class="overview-sub text-secondary">${opts.modules.length} ${opts.modules.length === 1 ? 'module' : 'modules'} &middot; ${totalLessons} ${totalLessons === 1 ? 'lesson' : 'lessons'} &middot; ${totalSteps} ${totalSteps === 1 ? 'step' : 'steps'} &middot; ~${totalMinutes} min${editedText ? ` &middot; Last edited ${editedText}` : ''}</p>
          </div>
          <details class="add-module-disclosure overview-add-module">
            <summary class="btn btn-primary btn-compact cursor-pointer list-none">+ Add module</summary>
            <form method="POST" action="/teach/${opts.courseId}/modules" class="overview-add-module-form">
              <input type="text" name="title" class="text-input" placeholder="Module title" aria-label="New module title" data-no-persist required />
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
  } else if (selectedType === 'module') {
    const mod = opts.modules.find((m) => m.id === selectedId);
    if (mod) {
      editorContent = `
        <div class="builder-center-pane builder-entity">
          <header class="entity-head">
            <nav class="entity-crumbs" aria-label="Breadcrumb"><a href="/teach/${opts.courseId}/content">Course</a><span aria-hidden="true">/</span><span>Module</span></nav>
            <div class="entity-title-row">
              <form method="POST" action="/teach/${opts.courseId}/modules/${mod.id}/rename" class="entity-rename">
                <label for="module-rename-input" class="sr-only">Module title</label>
                <input id="module-rename-input" type="text" name="title" class="entity-title-input" value="${mod.title}" required />
                <button type="submit" class="btn btn-secondary btn-compact">Rename</button>
              </form>
              ${overflowDelete(mod.title, `/teach/${opts.courseId}/modules/${mod.id}/delete`, 'Delete this module and all its lessons?', 'Delete module')}
            </div>
          </header>

          <section class="module-lessons-section">
            <h2 class="section-title">Lessons <span class="count-pill">${mod.lessons.length}</span></h2>
            <div class="lessons-list" data-reorder-scope="module-lessons">
              ${mod.lessons
                .map(
                  (l, idx) => `
                  <div class="lesson-row" data-reorder="lesson" data-id="${l.id}" data-parent="${mod.id}" draggable="true">
                    ${grip}
                    <span class="lesson-row-index">${idx + 1}</span>
                    <div class="lesson-row-main">
                      <a class="lesson-row-title" href="/teach/${opts.courseId}/content?type=lesson&id=${l.id}">${l.title}</a>
                      <span class="lesson-row-sub">${l.description ? l.description : 'No description'}</span>
                    </div>
                    <span class="lesson-row-count">${l.steps.length} of 20 steps</span>
                    <a href="/teach/${opts.courseId}/content?type=lesson&id=${l.id}" class="btn btn-secondary btn-compact">Open lesson</a>
                    ${menuBtn(l.title)}
                  </div>
                `
                )
                .join('')}
            </div>

            <form method="POST" action="/teach/${opts.courseId}/modules/${mod.id}/lessons" class="inline-add-form add-lesson-form" aria-label="Add lesson to ${mod.title}">
              <div class="inline-add-field">
                <label for="new-lesson-title" class="inline-add-label">New lesson</label>
                <input id="new-lesson-title" type="text" name="title" class="text-input" placeholder="Lesson title, e.g. Variables and Memory" required />
              </div>
              <div class="inline-add-field">
                <label for="new-lesson-desc" class="inline-add-label">Description <span class="text-muted">(optional)</span></label>
                <input id="new-lesson-desc" type="text" name="description" class="text-input" placeholder="Brief summary of learning goals" />
              </div>
              <button type="submit" class="btn btn-primary btn-compact">Add lesson</button>
            </form>
          </section>
        </div>
      `;
    } else {
      editorContent = `
        <div class="builder-center-pane">
          <div class="alert alert-warning card p-4" role="alert" style="border-left: 4px solid var(--warning); background-color: var(--bg-surface);">
            <h2 class="section-title text-warning mb-2" style="font-size: 1.125rem;">Selected module was deleted</h2>
            <p class="text-secondary mb-3">The selected module no longer exists in this course draft. It may have been removed in a recent update.</p>
            <a href="/teach/${opts.courseId}/content" class="btn btn-secondary btn-compact">Return to course overview</a>
          </div>
        </div>
      `;
    }
  } else if (selectedType === 'lesson') {
    let targetLesson: LessonSummary | null = null;
    let targetModule: ModuleSummary | null = null;

    for (const m of opts.modules) {
      const found = m.lessons.find((l) => l.id === selectedId);
      if (found) {
        targetLesson = found;
        targetModule = m;
        break;
      }
    }

    if (targetLesson && targetModule) {
      const stepCount = targetLesson.steps.length;
      const canAddStep = stepCount < 20;

      const stepIcon = (t: StepSummary['type']) => (t === 'theory' ? 'file-text' : t === 'video' ? 'video' : t === 'quiz' ? 'list-checks' : 'code');
      const invalidSet = new Set(opts.invalidStepIds || []);
      editorContent = `
        <div class="builder-center-pane builder-entity">
          <header class="entity-head">
            <nav class="entity-crumbs" aria-label="Breadcrumb">
              <a href="/teach/${opts.courseId}/content">Course</a><span aria-hidden="true">/</span>
              <a href="/teach/${opts.courseId}/content?type=module&id=${targetModule.id}">${targetModule.title}</a><span aria-hidden="true">/</span><span>Lesson</span>
            </nav>
            <div class="entity-title-row">
              <form method="POST" action="/teach/${opts.courseId}/lessons/${targetLesson.id}/rename" class="entity-rename">
                <label for="lesson-rename-input" class="sr-only">Lesson title</label>
                <input id="lesson-rename-input" type="text" name="title" class="entity-title-input" value="${targetLesson.title}" required />
                <input type="hidden" name="description" value="${targetLesson.description || ''}" />
                <button type="submit" class="btn btn-secondary btn-compact">Rename</button>
              </form>
              ${overflowDelete(targetLesson.title, `/teach/${opts.courseId}/lessons/${targetLesson.id}/delete`, 'Delete this lesson and all its steps?', 'Delete lesson')}
            </div>
            ${targetLesson.description ? `<p class="entity-desc">${targetLesson.description}</p>` : ''}
          </header>

          <section class="lesson-steps-section">
            <div class="section-header-row">
              <h2 class="section-title">Steps <span class="count-pill">${stepCount} of 20</span></h2>
              ${!canAddStep ? '<span class="status-badge badge-warning">20 of 20 steps limit reached</span>' : ''}
            </div>

            ${
              stepCount === 0
                ? '<p class="steps-empty text-secondary">No steps yet. Add the first step below.</p>'
                : `<div class="steps-table-wrapper">
              <table class="steps-table">
                <thead>
                  <tr>
                    <th scope="col" class="col-num">#</th>
                    <th scope="col">Type</th>
                    <th scope="col">Title</th>
                    <th scope="col" class="col-meta">Required</th>
                    <th scope="col" class="col-meta">Time</th>
                    <th scope="col" class="col-actions"><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody data-reorder-scope="lesson-steps">
                  ${targetLesson.steps
                    .map((s, idx) => {
                      const editUrl = `/teach/${opts.courseId}/content/${s.type}/${s.id}`;
                      return `
                        <tr data-reorder="step" data-id="${s.id}" data-parent="${targetLesson.id}" draggable="true">
                          <td class="col-num"><span class="step-num-cell">${grip}${idx + 1}</span></td>
                          <td><span class="step-type-badge badge-${s.type} step-type-${s.type}">${renderIcon(stepIcon(s.type), { size: 12 })}${s.type}</span></td>
                          <td class="col-title"><a href="${editUrl}">${s.title}</a>${invalidSet.has(s.id) ? '<span class="tree-invalid-dot" role="img" aria-label="Needs fixes before publishing" title="Needs fixes before publishing"></span>' : ''}</td>
                          <td class="col-meta">${s.isRequired ? 'Required' : 'Optional'}</td>
                          <td class="col-meta">${s.estimatedDurationMinutes} min</td>
                          <td class="col-actions">
                            <div class="row-actions">
                              <a href="${editUrl}" class="btn btn-secondary btn-compact">Edit</a>
                              <a href="/teach/${opts.courseId}/preview?stepId=${s.id}" class="btn btn-secondary btn-compact">Preview</a>
                              <form method="POST" action="/teach/${opts.courseId}/steps/${s.id}/duplicate">
                                <button type="submit" class="btn btn-secondary btn-compact" ${!canAddStep ? 'disabled' : ''}>Duplicate</button>
                              </form>
                              ${menuBtn(s.title)}
                              ${overflowDelete(s.title, `/teach/${opts.courseId}/steps/${s.id}/delete`, 'Delete this step?', 'Delete step')}
                            </div>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>`
            }

            ${
              canAddStep
                ? `
                    <form method="POST" action="/teach/${opts.courseId}/lessons/${targetLesson.id}/steps" class="inline-add-form add-step-form" aria-label="Add step">
                      <div class="inline-add-field">
                        <label for="step-title-input" class="inline-add-label">New step</label>
                        <input id="step-title-input" type="text" name="title" class="text-input" placeholder="Step title, e.g. Variable Scope" required />
                      </div>
                      <div class="inline-add-field inline-add-type">
                        <label for="step-type-select" class="inline-add-label">Type</label>
                        <select id="step-type-select" name="type" class="select-input">
                          <option value="theory">Theory (Markdown)</option>
                          <option value="video">Video (Approved provider)</option>
                          <option value="quiz">Quiz (Single or Multiple Choice)</option>
                          <option value="python">Python Exercise (Coding)</option>
                        </select>
                      </div>
                      <button type="submit" class="btn btn-primary btn-compact">Add step</button>
                    </form>
                `
                : '<div class="alert alert-info mt-4" role="note">Maximum 20 steps per lesson reached. Create a new lesson to add more steps.</div>'
            }
          </section>
        </div>
      `;
    } else {
      editorContent = `
        <div class="builder-center-pane">
          <div class="alert alert-warning card p-4" role="alert" style="border-left: 4px solid var(--warning); background-color: var(--bg-surface);">
            <h2 class="section-title text-warning mb-2" style="font-size: 1.125rem;">Selected lesson was deleted</h2>
            <p class="text-secondary mb-3">The selected lesson no longer exists in this course draft. It may have been removed in a recent update.</p>
            <a href="/teach/${opts.courseId}/content" class="btn btn-secondary btn-compact">Return to course overview</a>
          </div>
        </div>
      `;
    }
  } else if (selectedType === 'step') {
    let targetStep: StepSummary | null = null;
    for (const m of opts.modules) {
      for (const l of m.lessons) {
        const found = l.steps.find((s) => s.id === selectedId);
        if (found) {
          targetStep = found;
          break;
        }
      }
    }

    if (targetStep) {
      const editUrl =
        targetStep.type === 'theory'
          ? `/teach/${opts.courseId}/content/theory/${targetStep.id}`
          : targetStep.type === 'video'
          ? `/teach/${opts.courseId}/content/video/${targetStep.id}`
          : targetStep.type === 'quiz'
          ? `/teach/${opts.courseId}/content/quiz/${targetStep.id}`
          : `/teach/${opts.courseId}/content/python/${targetStep.id}`;

      editorContent = `
        <div class="builder-center-pane">
          <header class="pane-header">
            <span class="step-type-badge badge-${targetStep.type}">${targetStep.type.toUpperCase()}</span>
            <h1 class="page-title">${targetStep.title}</h1>
            <p class="text-secondary">${targetStep.estimatedDurationMinutes} minutes · ${targetStep.isRequired ? 'Required' : 'Optional'}</p>
          </header>

          <div class="step-jump-card card mt-4">
            <div class="card-body">
              <p>This is a <strong>${targetStep.type}</strong> step. Launch the dedicated author editor or preview it from a student perspective.</p>
              <div class="action-row mt-3">
                <a href="${editUrl}" class="btn btn-primary">Open ${targetStep.type} editor</a>
                <a href="/teach/${opts.courseId}/preview/${targetStep.id}" class="btn btn-secondary">Preview as student</a>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      editorContent = `
        <div class="builder-center-pane">
          <div class="alert alert-warning card p-4" role="alert" style="border-left: 4px solid var(--warning); background-color: var(--bg-surface);">
            <h2 class="section-title text-warning mb-2" style="font-size: 1.125rem;">Selected step was deleted</h2>
            <p class="text-secondary mb-3">The selected step no longer exists in this course draft. It may have been removed in a recent update.</p>
            <a href="/teach/${opts.courseId}/content" class="btn btn-secondary btn-compact">Return to course overview</a>
          </div>
        </div>
      `;
    }
  }

  // Contextual inspector content (design.md §5, §12 P22)
  const totalLessonsAll = opts.modules.reduce((acc, m) => acc + m.lessons.length, 0);
  const totalStepsAll = opts.modules.reduce((acc, m) => acc + m.lessons.reduce((lAcc, l) => lAcc + l.steps.length, 0), 0);
  const totalDurationAll = opts.modules.reduce(
    (acc, m) => acc + m.lessons.reduce((lAcc, l) => lAcc + l.steps.reduce((sAcc, s) => sAcc + (s.estimatedDurationMinutes || 0), 0), 0),
    0
  );

  let inspectorContent: string | undefined = undefined;

  if (selectedType === 'module') {
    const currentMod = opts.modules.find((m) => m.id === selectedId);
    if (currentMod) {
      const modStepCount = currentMod.lessons.reduce((acc, l) => acc + l.steps.length, 0);
      const modDuration = currentMod.lessons.reduce(
        (acc, l) => acc + l.steps.reduce((sAcc, s) => sAcc + (s.estimatedDurationMinutes || 0), 0),
        0
      );
      inspectorContent = `
        <div class="inspector-box p-4">
          <div class="inspector-header mb-3">
            <span class="text-xs text-secondary font-medium">Module overview</span>
            <h3 class="inspector-title text-base font-semibold mt-0.5">${currentMod.title}</h3>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Module Scope</span>
            <ul class="text-sm text-secondary mt-1" style="list-style: none; padding-left: 0; display: flex; flex-direction: column; gap: 0.25rem;">
              <li><strong>${currentMod.lessons.length}</strong> lessons</li>
              <li><strong>${modStepCount}</strong> steps</li>
              <li><strong>~${modDuration}</strong> minutes</li>
            </ul>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Actions</span>
            <div class="action-links mt-2" style="display: flex; flex-direction: column; gap: 0.5rem;">
              <a href="/teach/${opts.courseId}/content" class="btn btn-secondary btn-compact" style="width: 100%; text-align: center;">Back to Course</a>
            </div>
          </div>
        </div>
      `;
    }
  } else if (selectedType === 'lesson') {
    let curLes: LessonSummary | null = null;
    let curMod: ModuleSummary | null = null;
    for (const m of opts.modules) {
      const found = m.lessons.find((l) => l.id === selectedId);
      if (found) {
        curLes = found;
        curMod = m;
        break;
      }
    }
    if (curLes) {
      const lesDuration = curLes.steps.reduce((acc, s) => acc + (s.estimatedDurationMinutes || 0), 0);
      const requiredCount = curLes.steps.filter((s) => s.isRequired).length;
      inspectorContent = `
        <div class="inspector-box p-4">
          <div class="inspector-header mb-3">
            <span class="text-xs text-secondary font-medium">Lesson details</span>
            <h3 class="inspector-title text-base font-semibold mt-0.5">${curLes.title}</h3>
            ${curMod ? `<span class="text-xs text-secondary" style="display: block; margin-top: 0.25rem;">Module: ${curMod.title}</span>` : ''}
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Lesson Capacity</span>
            <div class="mt-1 text-sm font-semibold">${curLes.steps.length} / 20 steps</div>
            <span class="text-xs text-secondary">${20 - curLes.steps.length} steps remaining</span>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Requirements &amp; Duration</span>
            <ul class="text-sm text-secondary mt-1" style="list-style: none; padding-left: 0; display: flex; flex-direction: column; gap: 0.25rem;">
              <li><strong>${requiredCount}</strong> required steps</li>
              <li><strong>${curLes.steps.length - requiredCount}</strong> optional steps</li>
              <li><strong>~${lesDuration}</strong> minutes estimated</li>
            </ul>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Actions</span>
            <div class="action-links mt-2" style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${curMod ? `<a href="/teach/${opts.courseId}/content?type=module&id=${curMod.id}" class="btn btn-secondary btn-compact" style="width: 100%; text-align: center;">View Module</a>` : ''}
              <a href="/teach/${opts.courseId}/content" class="btn btn-secondary btn-compact" style="width: 100%; text-align: center;">Course Overview</a>
            </div>
          </div>
        </div>
      `;
    }
  } else if (selectedType === 'step') {
    let curStep: StepSummary | null = null;
    for (const m of opts.modules) {
      for (const l of m.lessons) {
        const found = l.steps.find((s) => s.id === selectedId);
        if (found) {
          curStep = found;
          break;
        }
      }
    }
    if (curStep) {
      const editUrl =
        curStep.type === 'theory'
          ? `/teach/${opts.courseId}/content/theory/${curStep.id}`
          : curStep.type === 'video'
          ? `/teach/${opts.courseId}/content/video/${curStep.id}`
          : curStep.type === 'quiz'
          ? `/teach/${opts.courseId}/content/quiz/${curStep.id}`
          : `/teach/${opts.courseId}/content/python/${curStep.id}`;

      inspectorContent = `
        <div class="inspector-box p-4">
          <div class="inspector-header mb-3">
            <span class="text-xs text-secondary font-medium">Step settings</span>
            <h3 class="inspector-title text-base font-semibold mt-0.5">${curStep.title}</h3>
            <span class="status-badge neutral mt-1" style="text-transform: capitalize;">${curStep.type}</span>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Completion Requirement</span>
            <div class="mt-1">
              <span class="status-badge ${curStep.isRequired ? 'badge-primary' : 'badge-neutral'}">${curStep.isRequired ? 'Required step' : 'Optional step'}</span>
            </div>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Estimated Duration</span>
            <div class="mt-1 text-sm font-semibold">${curStep.estimatedDurationMinutes} minutes</div>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Actions</span>
            <div class="action-links mt-2" style="display: flex; flex-direction: column; gap: 0.5rem;">
              <a href="${editUrl}" class="btn btn-primary btn-compact" style="width: 100%; text-align: center;">Open Editor</a>
              <a href="/teach/${opts.courseId}/preview/${curStep.id}" class="btn btn-secondary btn-compact" style="width: 100%; text-align: center;">Preview Step</a>
            </div>
          </div>
        </div>
      `;
    }
  }

  const feedbackMessageHtml = opts.feedbackMessage
    ? `<div class="alert alert-danger mb-4" role="alert">${opts.feedbackMessage}</div>`
    : '';

  const remoteUpdateHtml = opts.remoteUpdate
    ? `
      <aside class="remote-update-strip" role="status" aria-live="polite" aria-label="Remote update notice" style="margin-bottom: 1rem; padding: 0.75rem 1rem; background-color: var(--bg-surface); border: 1px solid var(--border-subtle); border-left: 4px solid var(--accent); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="status-badge ${opts.remoteUpdate.hasLocalEdits ? 'error' : 'info'}" aria-hidden="true">${opts.remoteUpdate.hasLocalEdits ? 'Conflict' : 'Remote'}</span>
          <span>
            Updated through <strong>${opts.remoteUpdate.agentName}</strong> · ${opts.remoteUpdate.timestampText || 'just now'}
            <span class="text-secondary" style="font-size: 0.8125rem;">(Revision ${opts.remoteUpdate.newRevision})</span>
            ${opts.remoteUpdate.hasLocalEdits ? '<span class="status-badge error mt-1" style="display: inline-block;">Version conflict: Unsaved local changes preserved. Review differences before replacing.</span>' : ''}
          </span>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <a href="/teach/${opts.courseId}/activity" class="btn btn-secondary btn-compact">View changes</a>
          ${!opts.remoteUpdate.hasLocalEdits
            ? '<button type="button" class="btn btn-primary btn-compact" id="load-update-btn">Load update</button>'
            : '<button type="button" class="btn btn-secondary btn-compact" id="resolve-conflict-btn">Compare changes</button>'}
        </div>
      </aside>
    `
    : '';

  return renderAuthorWorkspaceShell({
    courseId: opts.courseId,
    courseTitle: opts.courseTitle,
    publicationState: opts.publicationState,
    hasUnpublishedChanges: opts.hasUnpublishedChanges,
    saveStatusText: opts.saveStatusText,
    activeTab: 'content',
    treeContent,
    modules: opts.modules,
    selectedType: opts.selectedType,
    selectedId: opts.selectedId,
    editorContent: `${feedbackMessageHtml}${remoteUpdateHtml}${editorContent}`,
    inspectorContent,
  });
}
