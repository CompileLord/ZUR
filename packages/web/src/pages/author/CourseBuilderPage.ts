import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';
import { renderIcon, type IconName } from '../../components/common/icons.ts';

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
}

export function renderCourseBuilderPage(opts: CourseBuilderPageOptions): string {
  opts = safeTemplateData(opts);
  const selectedType = opts.selectedType || 'course';
  const selectedId = opts.selectedId || opts.courseId;

  // Render left structure tree
  const treeItemsHtml = opts.modules
    .map((mod, mIdx) => {
      const isModSelected = selectedType === 'module' && selectedId === mod.id;
      const lessonItemsHtml = mod.lessons
        .map((les, lIdx) => {
          const isLesSelected = selectedType === 'lesson' && selectedId === les.id;
          const stepCount = les.steps.length;
          const limitNotice = ` (${stepCount} steps)<span class="sr-only"> (${stepCount} of 20)</span>`;

          const stepsHtml = les.steps
            .map((st, sIdx) => {
              const isStSelected = selectedType === 'step' && selectedId === st.id;
              const typeLabel =
                st.type === 'theory'
                  ? 'Theory'
                  : st.type === 'video'
                  ? 'Video'
                  : st.type === 'quiz'
                  ? 'Quiz'
                  : 'Python';

              const iconName: IconName =
                st.type === 'theory'
                  ? 'file-text'
                  : st.type === 'video'
                  ? 'video'
                  : st.type === 'quiz'
                  ? 'list-checks'
                  : 'code';

              const editHref =
                st.type === 'theory'
                  ? `/teach/${opts.courseId}/content/theory/${st.id}`
                  : st.type === 'video'
                  ? `/teach/${opts.courseId}/content/video/${st.id}`
                  : st.type === 'quiz'
                  ? `/teach/${opts.courseId}/content/quiz/${st.id}`
                  : `/teach/${opts.courseId}/content/python/${st.id}`;

              return `
                <li class="tree-item tree-step ${isStSelected ? 'selected' : ''}" role="treeitem" aria-selected="${isStSelected}">
                  <div class="tree-node-content">
                    <span class="tree-type-icon step-type-${st.type}" aria-label="${typeLabel}" title="${typeLabel}">
                      ${renderIcon(iconName, { size: 14 })}
                    </span>
                    <a href="/teach/${opts.courseId}/content?type=step&id=${st.id}" class="tree-label">${st.title}</a>
                  </div>
                  <div class="tree-node-actions">
                    <a href="${editHref}" class="btn-icon" aria-label="Edit ${st.title}" title="Edit">${renderIcon('edit', { size: 14 })}</a>
                    <a href="/teach/${opts.courseId}/preview/${st.id}" class="btn-icon" aria-label="Preview ${st.title}" title="Preview">${renderIcon('eye', { size: 14 })}</a>
                  </div>
                </li>
              `;
            })
            .join('');

          return `
            <li class="tree-item tree-lesson ${isLesSelected ? 'selected' : ''}" role="treeitem" aria-selected="${isLesSelected}">
              <div class="tree-node-header">
                <a href="/teach/${opts.courseId}/content?type=lesson&id=${les.id}" class="tree-label">
                  <strong>${lIdx + 1}. ${les.title}</strong>
                  <span class="step-count-label text-secondary">${limitNotice}</span>
                </a>
              </div>
              <ul class="tree-children" role="group">
                ${stepsHtml}
              </ul>
            </li>
          `;
        })
        .join('');

      return `
        <li class="tree-item tree-module ${isModSelected ? 'selected' : ''}" role="treeitem" aria-selected="${isModSelected}">
          <div class="tree-node-header">
            <a href="/teach/${opts.courseId}/content?type=module&id=${mod.id}" class="tree-label">
              <strong>Module ${mIdx + 1}: ${mod.title.replace(/^Module\s+\d+\s*:\s*/i, '')}</strong>
            </a>
          </div>
          <ul class="tree-children" role="group">
            ${lessonItemsHtml}
          </ul>
        </li>
      `;
    })
    .join('');

  const totalStepsCount = opts.modules.reduce((acc, m) => acc + m.lessons.reduce((lAcc, l) => lAcc + l.steps.length, 0), 0);

  const treeContent = `
    <div class="builder-tree-container">
      <div class="tree-header flex items-center justify-between pb-2 mb-2 border-b border-subtle">
        <h2 class="tree-title text-sm font-semibold m-0">Structure</h2>
        <span class="text-secondary text-xs">${totalStepsCount} steps</span>
      </div>

      <ul class="tree-root" role="tree" aria-label="Course Content Tree">
        <li class="tree-item ${selectedType === 'course' ? 'selected' : ''}" role="treeitem" aria-selected="${selectedType === 'course'}">
          <a href="/teach/${opts.courseId}/content" class="tree-label">
            <strong>${opts.courseTitle} (Overview)</strong>
          </a>
        </li>
        ${treeItemsHtml}
      </ul>

      <div class="tree-footer mt-2 pt-2 border-t border-subtle">
        <details class="add-module-disclosure">
          <summary class="btn btn-secondary btn-compact w-full text-center cursor-pointer list-none">+ Add module</summary>
          <form method="POST" action="/teach/${opts.courseId}/modules" class="mt-2">
            <div class="input-with-button flex gap-1">
              <input type="text" name="title" class="text-input input-compact flex-1" placeholder="Module title..." required autofocus />
              <button type="submit" class="btn btn-primary btn-compact">Save</button>
            </div>
          </form>
        </details>
      </div>
    </div>
  `;

  // Center editor pane based on selected entity
  let editorContent = '';

  if (selectedType === 'course') {
    const totalLessons = opts.modules.reduce((acc, m) => acc + m.lessons.length, 0);
    const totalSteps = opts.modules.reduce((acc, m) => acc + m.lessons.reduce((lAcc, l) => lAcc + l.steps.length, 0), 0);

    editorContent = `
      <div class="builder-center-pane">
        <header class="pane-header mb-4">
          <h1 class="page-title">${opts.courseTitle}</h1>
        </header>

        <div class="stats-overview-bar">
          <div class="stat-box"><strong>${opts.modules.length}</strong> Modules</div>
          <div class="stat-box"><strong>${totalLessons}</strong> Lessons</div>
          <div class="stat-box"><strong>${totalSteps}</strong> Steps</div>
        </div>

        <div class="builder-modules-list mt-4">
          <h2 class="section-title text-base font-semibold mb-3">Modules in this course</h2>
          <div class="module-row-list" role="list">
            ${opts.modules
              .map(
                (m, idx) => `
                <div class="module-overview-row flex items-center justify-between p-3 border-b border-subtle" role="listitem">
                  <div class="module-row-title-group flex items-center gap-2">
                    <form method="POST" action="/teach/${opts.courseId}/modules/reorder" class="reorder-module-form" style="display:inline-flex; gap: 4px;">
                      <input type="hidden" name="moduleId" value="${m.id}" />
                      <input type="hidden" name="direction" value="up" />
                      <button type="submit" class="btn btn-secondary btn-compact move-module-up-btn" aria-label="Move Module ${idx + 1} up" ${idx === 0 ? 'disabled' : ''}>↑</button>
                    </form>
                    <form method="POST" action="/teach/${opts.courseId}/modules/reorder" class="reorder-module-form" style="display:inline-flex; gap: 4px;">
                      <input type="hidden" name="moduleId" value="${m.id}" />
                      <input type="hidden" name="direction" value="down" />
                      <button type="submit" class="btn btn-secondary btn-compact move-module-down-btn" aria-label="Move Module ${idx + 1} down" ${idx === opts.modules.length - 1 ? 'disabled' : ''}>↓</button>
                    </form>
                    <a href="/teach/${opts.courseId}/content?type=module&id=${m.id}" class="font-medium text-primary">Module ${idx + 1}: ${m.title.replace(/^Module\s+\d+\s*:\s*/i, '')}</a>
                  </div>
                  <a href="/teach/${opts.courseId}/content?type=module&id=${m.id}" class="module-row-stats text-secondary text-sm flex items-center gap-2">
                    <span>${m.lessons.length} ${m.lessons.length === 1 ? 'lesson' : 'lessons'}</span>
                    <span class="meta-separator">·</span>
                    <span>${m.lessons.reduce((a, l) => a + l.steps.length, 0)} steps</span>
                    <span class="text-muted ml-1">→</span>
                  </a>
                </div>
              `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
  } else if (selectedType === 'module') {
    const mod = opts.modules.find((m) => m.id === selectedId);
    if (mod) {
      editorContent = `
        <div class="builder-center-pane">
          <header class="pane-header">
            <div class="breadcrumbs"><a href="/teach/${opts.courseId}/content">Course</a> / Module</div>
            <h1 class="page-title">${mod.title}</h1>
          </header>

          <form method="POST" action="/teach/${opts.courseId}/modules/${mod.id}/rename" class="rename-form">
            <div class="form-group">
              <label for="module-rename-input" class="field-label">Rename module</label>
              <div class="input-with-button">
                <input id="module-rename-input" type="text" name="title" class="text-input" value="${mod.title}" required />
                <button type="submit" class="btn btn-secondary">Rename</button>
              </div>
            </div>
          </form>

          <form method="POST" action="/teach/${opts.courseId}/modules/${mod.id}/delete" data-confirm-delete="Delete this module and all its lessons?">
            <button type="submit" class="btn btn-destructive btn-compact">Delete module</button>
          </form>
          <hr class="section-divider" />

          <section class="module-lessons-section">
            <h2 class="section-title">Lessons in this module</h2>
            <div class="lessons-list">
              ${mod.lessons
                .map(
                  (l, idx) => `
                  <div class="card lesson-card">
                    <div class="card-header flex items-center justify-between">
                      <h4>${idx + 1}. ${l.title}</h4>
                      <div class="flex gap-1 items-center">
                        <form method="POST" action="/teach/${opts.courseId}/modules/${mod.id}/lessons/reorder" class="reorder-lesson-form" style="display:inline-flex; gap: 4px;">
                          <input type="hidden" name="lessonId" value="${l.id}" />
                          <input type="hidden" name="direction" value="up" />
                          <button type="submit" class="btn btn-secondary btn-compact move-lesson-up-btn" aria-label="Move lesson ${l.title} up" ${idx === 0 ? 'disabled' : ''}>↑</button>
                        </form>
                        <form method="POST" action="/teach/${opts.courseId}/modules/${mod.id}/lessons/reorder" class="reorder-lesson-form" style="display:inline-flex; gap: 4px;">
                          <input type="hidden" name="lessonId" value="${l.id}" />
                          <input type="hidden" name="direction" value="down" />
                          <button type="submit" class="btn btn-secondary btn-compact move-lesson-down-btn" aria-label="Move lesson ${l.title} down" ${idx === mod.lessons.length - 1 ? 'disabled' : ''}>↓</button>
                        </form>
                        <a href="/teach/${opts.courseId}/content?type=lesson&id=${l.id}" class="btn btn-secondary btn-compact">Open lesson</a>
                      </div>
                    </div>
                    <div class="card-body">
                      <p class="text-secondary">${l.description || 'No description provided.'}</p>
                      <p class="text-sm text-secondary">${l.steps.length} of 20 steps used</p>
                    </div>
                  </div>
                `
                )
                .join('')}
            </div>

            <div class="add-lesson-box mt-4">
              <h3>+ Add lesson to ${mod.title}</h3>
              <form method="POST" action="/teach/${opts.courseId}/modules/${mod.id}/lessons" class="add-lesson-form">
                <div class="form-group">
                  <label for="new-lesson-title" class="field-label">Lesson title</label>
                  <input id="new-lesson-title" type="text" name="title" class="text-input" placeholder="e.g. Variables and Memory" required />
                </div>
                <div class="form-group">
                  <label for="new-lesson-desc" class="field-label">Lesson description (optional)</label>
                  <input id="new-lesson-desc" type="text" name="description" class="text-input" placeholder="Brief summary of learning goals" />
                </div>
                <button type="submit" class="btn btn-primary">+ Create lesson</button>
              </form>
            </div>
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

      editorContent = `
        <div class="builder-center-pane">
          <header class="pane-header">
            <div class="breadcrumbs">
              <a href="/teach/${opts.courseId}/content">Course</a> /
              <a href="/teach/${opts.courseId}/content?type=module&id=${targetModule.id}">${targetModule.title}</a> / Lesson
            </div>
            <h1 class="page-title">${targetLesson.title}</h1>
            <p class="text-secondary">${targetLesson.description || ''}</p>
          </header>

          <form method="POST" action="/teach/${opts.courseId}/lessons/${targetLesson.id}/rename" class="rename-form">
            <label for="lesson-rename-input" class="field-label">Lesson title</label>
            <div class="input-with-button">
              <input id="lesson-rename-input" type="text" name="title" class="text-input" value="${targetLesson.title}" required />
              <input type="hidden" name="description" value="${targetLesson.description || ''}" />
              <button type="submit" class="btn btn-secondary btn-compact">Rename</button>
            </div>
          </form>
          <form method="POST" action="/teach/${opts.courseId}/lessons/${targetLesson.id}/delete" data-confirm-delete="Delete this lesson and all its steps?">
            <button type="submit" class="btn btn-destructive btn-compact">Delete lesson</button>
          </form>
          <section class="lesson-steps-section">
            <div class="section-header-row">
              <h2 class="section-title">Steps (${stepCount} of 20)</h2>
              ${!canAddStep ? '<span class="status-badge badge-warning">20 of 20 steps limit reached</span>' : ''}
            </div>

            <div class="steps-table-wrapper">
              <table class="data-table steps-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>Title</th>
                    <th>Required</th>
                    <th>Duration</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${targetLesson.steps
                    .map((s, idx) => {
                      const editUrl =
                        s.type === 'theory'
                          ? `/teach/${opts.courseId}/content/theory/${s.id}`
                          : s.type === 'video'
                          ? `/teach/${opts.courseId}/content/video/${s.id}`
                          : s.type === 'quiz'
                          ? `/teach/${opts.courseId}/content/quiz/${s.id}`
                          : `/teach/${opts.courseId}/content/python/${s.id}`;

                      return `
                        <tr>
                          <td>${idx + 1}</td>
                          <td><span class="step-type-badge badge-${s.type}">${s.type}</span></td>
                          <td><a href="${editUrl}"><strong>${s.title}</strong></a></td>
                          <td>${s.isRequired ? 'Yes' : 'Optional'}</td>
                          <td>${s.estimatedDurationMinutes} min</td>
                          <td class="action-cell">
                            <form method="POST" action="/teach/${opts.courseId}/lessons/${targetLesson.id}/steps/reorder" class="reorder-step-form" style="display:inline-flex; gap: 2px;">
                              <input type="hidden" name="stepId" value="${s.id}" />
                              <input type="hidden" name="direction" value="up" />
                              <button type="submit" class="btn btn-secondary btn-compact move-step-up-btn" aria-label="Move ${s.title} up" ${idx === 0 ? 'disabled' : ''}>↑</button>
                            </form>
                            <form method="POST" action="/teach/${opts.courseId}/lessons/${targetLesson.id}/steps/reorder" class="reorder-step-form" style="display:inline-flex; gap: 2px;">
                              <input type="hidden" name="stepId" value="${s.id}" />
                              <input type="hidden" name="direction" value="down" />
                              <button type="submit" class="btn btn-secondary btn-compact move-step-down-btn" aria-label="Move ${s.title} down" ${idx === targetLesson.steps.length - 1 ? 'disabled' : ''}>↓</button>
                            </form>
                            <a href="${editUrl}" class="btn btn-secondary btn-compact">Edit</a>
                            <a href="/teach/${opts.courseId}/preview?stepId=${s.id}" class="btn btn-secondary btn-compact">Preview</a>
                            <form method="POST" action="/teach/${opts.courseId}/steps/${s.id}/duplicate" style="display:inline;">
                              <button type="submit" class="btn btn-secondary btn-compact" ${!canAddStep ? 'disabled' : ''}>Duplicate</button>
                            </form>
                            <form method="POST" action="/teach/${opts.courseId}/steps/${s.id}/delete" data-confirm-delete="Delete this step?" style="display:inline;">
                              <button type="submit" class="btn btn-destructive btn-compact">Delete</button>
                            </form>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>

            ${
              canAddStep
                ? `
                  <div class="add-step-box mt-4">
                    <h3 class="box-title">Add step</h3>
                    <form method="POST" action="/teach/${opts.courseId}/lessons/${targetLesson.id}/steps" class="add-step-form">
                      <div class="form-row">
                        <div class="form-group col-half">
                          <label for="step-title-input" class="field-label">Step title</label>
                          <input id="step-title-input" type="text" name="title" class="text-input" placeholder="e.g. Variable Scope" required />
                        </div>
                        <div class="form-group col-half">
                          <label for="step-type-select" class="field-label">Step type</label>
                          <select id="step-type-select" name="type" class="select-input">
                            <option value="theory">Theory (Markdown)</option>
                            <option value="video">Video (Approved provider)</option>
                            <option value="quiz">Quiz (Single or Multiple Choice)</option>
                            <option value="python">Python Exercise (Coding)</option>
                          </select>
                        </div>
                      </div>
                      <button type="submit" class="btn btn-primary">+ Add step</button>
                    </form>
                  </div>
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

  const remoteUpdateHtml = opts.remoteUpdate
    ? `
      <aside class="remote-update-strip" role="status" aria-live="polite" aria-label="Remote update notice" style="margin-bottom: 1rem; padding: 0.75rem 1rem; background-color: var(--bg-surface); border: 1px solid var(--border-default); border-left: 4px solid var(--accent); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span aria-hidden="true">🤖</span>
          <span>
            Updated through <strong>${opts.remoteUpdate.agentName}</strong> · ${opts.remoteUpdate.timestampText || 'just now'}
            <span class="text-secondary" style="font-size: 0.8125rem;">(Revision ${opts.remoteUpdate.newRevision})</span>
            ${opts.remoteUpdate.hasLocalEdits ? '<span class="text-warning" style="display: block; font-size: 0.8125rem;">Unsaved local changes preserved. Review differences before replacing.</span>' : ''}
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
    saveStatusText: opts.saveStatusText || 'Saved',
    activeTab: 'content',
    treeContent,
    modules: opts.modules,
    selectedType: opts.selectedType,
    selectedId: opts.selectedId,
    editorContent: `${remoteUpdateHtml}${editorContent}`,
    inspectorContent,
  });
}
