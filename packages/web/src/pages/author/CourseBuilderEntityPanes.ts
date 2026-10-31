import { renderIcon } from '../../components/common/icons.ts';
import { overflowDelete } from './CourseBuilderOverflow.ts';
import type { CourseBuilderPageOptions, LessonSummary, ModuleSummary, StepSummary } from './CourseBuilderTypes.ts';

export function renderModulePane(opts: CourseBuilderPageOptions, selectedId: string, grip: string, menuBtn: (label: string) => string): string {
    const mod = opts.modules.find((m) => m.id === selectedId);
    if (mod) {
      return `
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
      return `
        <div class="builder-center-pane">
          <div class="alert alert-warning card p-4" role="alert" style="border-left: 4px solid var(--warning); background-color: var(--bg-surface);">
            <h2 class="section-title text-warning mb-2" style="font-size: 1.125rem;">Selected module was deleted</h2>
            <p class="text-secondary mb-3">The selected module no longer exists in this course draft. It may have been removed in a recent update.</p>
            <a href="/teach/${opts.courseId}/content" class="btn btn-secondary btn-compact">Return to course overview</a>
          </div>
        </div>
      `;
    }
}

export function renderLessonPane(opts: CourseBuilderPageOptions, selectedId: string, grip: string, menuBtn: (label: string) => string): string {
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
      return `
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
      return `
        <div class="builder-center-pane">
          <div class="alert alert-warning card p-4" role="alert" style="border-left: 4px solid var(--warning); background-color: var(--bg-surface);">
            <h2 class="section-title text-warning mb-2" style="font-size: 1.125rem;">Selected lesson was deleted</h2>
            <p class="text-secondary mb-3">The selected lesson no longer exists in this course draft. It may have been removed in a recent update.</p>
            <a href="/teach/${opts.courseId}/content" class="btn btn-secondary btn-compact">Return to course overview</a>
          </div>
        </div>
      `;
    }
}

export function renderStepPane(opts: CourseBuilderPageOptions, selectedId: string): string {
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

      return `
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
      return `
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
