import { renderIcon, type IconName } from '../../components/common/icons.ts';
import { stepEditHref } from './AuthorTreeModel.ts';
import { escapeHtmlOnce } from '../../utils/escape-html.ts';
import type { StepSummary, RenderAuthorTreeOptions } from './AuthorTreeModel.ts';

export { stepEditHref } from './AuthorTreeModel.ts';
export type { StepSummary, LessonSummary, ModuleSummary, RenderAuthorTreeOptions } from './AuthorTreeModel.ts';
export { initAuthorTree, applyInvalidStepDots, fetchInvalidStepIds } from './AuthorTreeInteractions.ts';
export type { AuthorTreeInitOptions } from './AuthorTreeInteractions.ts';

const STEP_LABEL: Record<StepSummary['type'], string> = { theory: 'Theory', video: 'Video', quiz: 'Quiz', python: 'Python' };
const STEP_ICON: Record<StepSummary['type'], IconName> = { theory: 'file-text', video: 'video', quiz: 'list-checks', python: 'code' };

function rowMenuButton(label: string): string {
  return `<button type="button" class="tree-row-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${label}" title="Actions (Alt+Up / Alt+Down to move)">${renderIcon('more-horizontal', { size: 14 })}</button>`;
}

const GRIP = `<span class="tree-grip" aria-hidden="true">${renderIcon('grip-vertical', { size: 12 })}</span>`;

export function renderAuthorTree(opts: RenderAuthorTreeOptions): string {
  const selectedType = opts.selectedType || 'course';
  const selectedId = opts.selectedId || opts.courseId;
  const invalid = new Set(opts.invalidStepIds || []);
  const cid = encodeURIComponent(opts.courseId);
  // Titles are author-controlled; escape them once here whatever the caller did.
  const courseTitle = escapeHtmlOnce(opts.courseTitle);
  const modules = opts.modules.map((m) => ({ ...m, title: escapeHtmlOnce(m.title), lessons: m.lessons.map((l) => ({
    ...l, title: escapeHtmlOnce(l.title), steps: l.steps.map((st) => ({ ...st, title: escapeHtmlOnce(st.title) })),
  })) }));

  const totalStepsCount = modules.reduce(
    (acc, m) => acc + m.lessons.reduce((lAcc, l) => lAcc + l.steps.length, 0),
    0
  );

  const treeItemsHtml = modules
    .map((mod, mIdx) => {
      const isModSelected = selectedType === 'module' && selectedId === mod.id;
      const cleanModTitle = mod.title.replace(/^Module\s+\d+\s*:\s*/i, '');
      const modLabel = `Module ${mIdx + 1}: ${cleanModTitle}`;

      const lessonItemsHtml = mod.lessons
        .map((les, lIdx) => {
          const isLesSelected = selectedType === 'lesson' && selectedId === les.id;
          const stepCount = les.steps.length;
          const cleanLessonTitle = les.title.replace(/^Lesson\s+\d+\s*:\s*/i, '');
          const lessonLabel = `${lIdx + 1}. ${cleanLessonTitle}`;

          const stepsHtml = les.steps
            .map((st) => {
              const isStSelected = selectedType === 'step' && selectedId === st.id;
              const typeLabel = STEP_LABEL[st.type];
              const editHref = stepEditHref(opts.courseId, st.type, st.id);
              return `
                <li class="tree-item tree-step ${isStSelected ? 'selected' : ''}" role="treeitem" aria-selected="${isStSelected}" data-reorder="step" data-id="${st.id}" data-parent="${les.id}">
                  <div class="tree-node-content" draggable="true">
                    ${GRIP}
                    <span class="tree-type-icon step-type-${st.type}" aria-label="${typeLabel}" title="${typeLabel}">
                      ${renderIcon(STEP_ICON[st.type], { size: 14 })}
                    </span>
                    <a href="${editHref}" class="tree-label" title="${st.title}">${st.title}</a>
                    ${invalid.has(st.id) ? '<span class="tree-invalid-dot" role="img" aria-label="Needs fixes before publishing" title="Needs fixes before publishing"></span>' : ''}
                    <div class="tree-node-actions">
                      <a href="/teach/${cid}/preview?stepId=${encodeURIComponent(st.id)}" class="btn-icon" aria-label="Preview ${st.title}" title="Preview">${renderIcon('eye', { size: 12 })}</a>
                      ${rowMenuButton(st.title)}
                    </div>
                  </div>
                </li>
              `;
            })
            .join('');

          const canAdd = stepCount < 20;
          return `
            <li class="tree-item tree-lesson ${isLesSelected ? 'selected' : ''}" role="treeitem" aria-selected="${isLesSelected}" data-reorder="lesson" data-id="${les.id}" data-parent="${mod.id}">
              <div class="tree-node-header" draggable="true">
                ${GRIP}
                <a href="/teach/${cid}/content?type=lesson&id=${encodeURIComponent(les.id)}" class="tree-label" title="${lessonLabel}">
                  <strong>${lessonLabel}</strong>
                  <span class="step-count-label text-secondary text-xs">${stepCount}<span class="sr-only"> steps (${stepCount} of 20)</span></span>
                </a>
                ${rowMenuButton(cleanLessonTitle)}
              </div>
              <ul class="tree-children" role="group" data-reorder-scope="lesson-${les.id}">
                ${stepsHtml}
                ${canAdd ? `
                <li class="tree-add-step" role="none">
                  <button type="button" class="tree-add-step-btn" aria-expanded="false" data-lesson-id="${les.id}">+ Add step</button>
                  <form class="tree-add-step-form" data-add-step-lesson="${les.id}" hidden>
                    <input type="text" name="title" class="text-input input-compact" placeholder="Step title" aria-label="New step title" required maxlength="200" />
                    <div class="tree-type-picker" role="radiogroup" aria-label="Step type">
                      ${(['theory', 'video', 'quiz', 'python'] as const).map((t, i) => `<label class="tree-type-chip step-type-${t}"><input type="radio" name="type" value="${t}" ${i === 0 ? 'checked' : ''} /><span>${renderIcon(STEP_ICON[t], { size: 12 })}${STEP_LABEL[t]}</span></label>`).join('')}
                    </div>
                    <div class="tree-add-step-actions">
                      <button type="submit" class="btn btn-primary btn-compact">Add</button>
                      <button type="button" class="btn btn-ghost btn-compact" data-add-step-cancel>Cancel</button>
                    </div>
                  </form>
                </li>` : ''}
              </ul>
            </li>
          `;
        })
        .join('');

      return `
        <li class="tree-item tree-module ${isModSelected ? 'selected' : ''}" role="treeitem" aria-selected="${isModSelected}" data-reorder="module" data-id="${mod.id}" data-parent="${opts.courseId}">
          <div class="tree-node-header" draggable="true">
            ${GRIP}
            <a href="/teach/${cid}/content?type=module&id=${encodeURIComponent(mod.id)}" class="tree-label" title="${modLabel}">
              <strong>${modLabel}</strong>
            </a>
            ${rowMenuButton(cleanModTitle)}
          </div>
          <ul class="tree-children" role="group" data-reorder-scope="module-${mod.id}">
            ${lessonItemsHtml}
          </ul>
        </li>
      `;
    })
    .join('');

  return `
    <div class="builder-tree-container">
      <div class="tree-header">
        <h2 class="tree-title">${opts.title || 'Course Outline'}</h2>
        <span class="text-secondary text-xs font-medium">${totalStepsCount} ${totalStepsCount === 1 ? 'step' : 'steps'}</span>
      </div>

      <ul class="tree-root" role="tree" aria-label="Course Content Tree" data-reorder-scope="tree-modules">
        <li class="tree-item tree-course ${selectedType === 'course' ? 'selected' : ''}" role="treeitem" aria-selected="${selectedType === 'course'}">
          <a href="/teach/${cid}/content" class="tree-label" title="${courseTitle}">
            <strong>${courseTitle}</strong>
          </a>
        </li>
        ${treeItemsHtml}
      </ul>

      <div class="tree-footer">
        <details class="add-module-disclosure">
          <summary class="btn btn-secondary btn-compact w-full text-center cursor-pointer list-none">+ Add module</summary>
          <form method="POST" action="/teach/${cid}/modules" class="mt-2">
            <div class="input-with-button flex gap-1">
              <input type="text" name="title" class="text-input input-compact flex-1 text-xs" placeholder="Module title..." aria-label="New module title" required />
              <button type="submit" class="btn btn-primary btn-compact text-xs">Save</button>
            </div>
          </form>
        </details>
      </div>
    </div>
  `;
}
