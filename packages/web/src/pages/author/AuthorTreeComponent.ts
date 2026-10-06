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

export interface RenderAuthorTreeOptions {
  courseId: string;
  courseTitle: string;
  modules: ModuleSummary[];
  selectedType?: 'course' | 'module' | 'lesson' | 'step';
  selectedId?: string;
  isEditor?: boolean;
}

export function renderAuthorTree(opts: RenderAuthorTreeOptions): string {
  const selectedType = opts.selectedType || 'course';
  const selectedId = opts.selectedId || opts.courseId;

  const totalStepsCount = opts.modules.reduce(
    (acc, m) => acc + m.lessons.reduce((lAcc, l) => lAcc + l.steps.length, 0),
    0
  );

  const treeItemsHtml = opts.modules
    .map((mod, mIdx) => {
      const isModSelected = selectedType === 'module' && selectedId === mod.id;
      const cleanModTitle = mod.title.replace(/^Module\s+\d+\s*:\s*/i, '');

      const lessonItemsHtml = mod.lessons
        .map((les, lIdx) => {
          const isLesSelected = selectedType === 'lesson' && selectedId === les.id;
          const stepCount = les.steps.length;
          const cleanLessonTitle = les.title.replace(/^Lesson\s+\d+\s*:\s*/i, '');

          const stepsHtml = les.steps
            .map((st) => {
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
                  ? `/teach/${encodeURIComponent(opts.courseId)}/content/theory/${encodeURIComponent(st.id)}`
                  : st.type === 'video'
                  ? `/teach/${encodeURIComponent(opts.courseId)}/content/video/${encodeURIComponent(st.id)}`
                  : st.type === 'quiz'
                  ? `/teach/${encodeURIComponent(opts.courseId)}/content/quiz/${encodeURIComponent(st.id)}`
                  : `/teach/${encodeURIComponent(opts.courseId)}/content/python/${encodeURIComponent(st.id)}`;

              return `
                <li class="tree-item tree-step ${isStSelected ? 'selected' : ''}" role="treeitem" aria-selected="${isStSelected}">
                  <div class="tree-node-content">
                    <span class="tree-type-icon step-type-${st.type}" aria-label="${typeLabel}" title="${typeLabel}">
                      ${renderIcon(iconName, { size: 14 })}
                    </span>
                    <a href="${editHref}" class="tree-label" title="${st.title}">${st.title}</a>
                    <div class="tree-node-actions">
                      <a href="${editHref}" class="btn-icon" aria-label="Edit ${st.title}" title="Edit">${renderIcon('edit', { size: 12 })}</a>
                      <a href="/teach/${encodeURIComponent(opts.courseId)}/preview?stepId=${encodeURIComponent(st.id)}" class="btn-icon" aria-label="Preview ${st.title}" title="Preview">${renderIcon('eye', { size: 12 })}</a>
                    </div>
                  </div>
                </li>
              `;
            })
            .join('');

          return `
            <li class="tree-item tree-lesson ${isLesSelected ? 'selected' : ''}" role="treeitem" aria-selected="${isLesSelected}">
              <div class="tree-node-header">
                <a href="/teach/${encodeURIComponent(opts.courseId)}/content?type=lesson&id=${encodeURIComponent(les.id)}" class="tree-label">
                  <strong>${lIdx + 1}. ${cleanLessonTitle}</strong>
                  <span class="step-count-label text-secondary text-xs">${stepCount} steps</span>
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
            <a href="/teach/${encodeURIComponent(opts.courseId)}/content?type=module&id=${encodeURIComponent(mod.id)}" class="tree-label">
              <strong>Module ${mIdx + 1}: ${cleanModTitle}</strong>
            </a>
          </div>
          <ul class="tree-children" role="group">
            ${lessonItemsHtml}
          </ul>
        </li>
      `;
    })
    .join('');

  return `
    <div class="builder-tree-container">
      <div class="tree-header flex items-center justify-between pb-2 mb-2 border-b border-subtle">
        <h2 class="tree-title text-sm font-semibold m-0">Course Outline</h2>
        <span class="text-secondary text-xs font-medium">${totalStepsCount} steps</span>
      </div>

      <ul class="tree-root" role="tree" aria-label="Course Content Tree">
        <li class="tree-item tree-course ${selectedType === 'course' ? 'selected' : ''}" role="treeitem" aria-selected="${selectedType === 'course'}">
          <a href="/teach/${encodeURIComponent(opts.courseId)}/content" class="tree-label">
            <strong>${opts.courseTitle}</strong>
          </a>
        </li>
        ${treeItemsHtml}
      </ul>

      <div class="tree-footer mt-auto pt-2 border-t border-subtle">
        <details class="add-module-disclosure">
          <summary class="btn btn-secondary btn-compact w-full text-center cursor-pointer list-none">+ Add module</summary>
          <form method="POST" action="/teach/${encodeURIComponent(opts.courseId)}/modules" class="mt-2">
            <div class="input-with-button flex gap-1">
              <input type="text" name="title" class="text-input input-compact flex-1 text-xs" placeholder="Module title..." required />
              <button type="submit" class="btn btn-primary btn-compact text-xs">Save</button>
            </div>
          </form>
        </details>
      </div>
    </div>
  `;
}
