import { escapeHtml } from '../escape-html.ts';

export interface TreeStepNode {
  id: string;
  title: string;
  type: 'theory' | 'video' | 'quiz' | 'python';
  isSelected?: boolean;
}

export interface TreeLessonNode {
  id: string;
  title: string;
  steps: TreeStepNode[];
  isExpanded?: boolean;
  isSelected?: boolean;
}

export interface TreeModuleNode {
  id: string;
  title: string;
  lessons: TreeLessonNode[];
  isExpanded?: boolean;
  isSelected?: boolean;
}

export interface ContentTreeProps {
  courseTitle: string;
  modules: TreeModuleNode[];
  selectedId?: string;
}

export function renderContentTree(props: ContentTreeProps): string {
  const modulesHtml = props.modules
    .map((mod, modIdx) => {
      const lessonsHtml = mod.lessons
        .map((les, lesIdx) => {
          const stepsHtml = les.steps
            .map((step, stepIdx) => {
              const isSelected = step.id === props.selectedId || step.isSelected;
              return `
                <li
                  class="tree-node step-node ${isSelected ? 'selected' : ''}"
                  role="treeitem"
                  aria-selected="${Boolean(isSelected)}"
                  data-id="${escapeHtml(step.id)}"
                  data-type="step"
                  tabindex="${isSelected ? 0 : -1}"
                >
                  <div class="tree-node-row indent-2">
                    <span class="tree-type-tag">${step.type}</span>
                    <span class="tree-node-title">${escapeHtml(step.title)}</span>
                    <div class="tree-node-actions">
                      <button type="button" class="btn-icon btn-compact" aria-label="Move ${escapeHtml(step.title)}">⋮</button>
                    </div>
                  </div>
                </li>
              `;
            })
            .join('');

          const isLesSelected = les.id === props.selectedId || les.isSelected;
          return `
            <li
              class="tree-node lesson-node ${isLesSelected ? 'selected' : ''}"
              role="treeitem"
              aria-expanded="${les.isExpanded !== false}"
              aria-selected="${Boolean(isLesSelected)}"
              data-id="${escapeHtml(les.id)}"
              data-type="lesson"
            >
              <div class="tree-node-row indent-1">
                <button type="button" class="tree-disclosure-btn" aria-label="Toggle lesson ${escapeHtml(les.title)}">▼</button>
                <span class="tree-node-title">${escapeHtml(les.title)}</span>
                <span class="tree-node-count">(${les.steps.length})</span>
                <div class="tree-node-actions">
                  <button type="button" class="btn-icon btn-compact" aria-label="Move ${escapeHtml(les.title)}">⋮</button>
                </div>
              </div>
              <ul class="tree-children" role="group">
                ${stepsHtml}
              </ul>
            </li>
          `;
        })
        .join('');

      const isModSelected = mod.id === props.selectedId || mod.isSelected;
      return `
        <li
          class="tree-node module-node ${isModSelected ? 'selected' : ''}"
          role="treeitem"
          aria-expanded="${mod.isExpanded !== false}"
          aria-selected="${Boolean(isModSelected)}"
            data-id="${escapeHtml(mod.id)}"
          data-type="module"
        >
          <div class="tree-node-row indent-0">
            <button type="button" class="tree-disclosure-btn" aria-label="Toggle module ${escapeHtml(mod.title)}">▼</button>
            <span class="tree-node-title font-semibold">${escapeHtml(mod.title)}</span>
            <div class="tree-node-actions">
              <button type="button" class="btn-icon btn-compact" aria-label="Module options">⋮</button>
            </div>
          </div>
          <ul class="tree-children" role="group">
            ${lessonsHtml}
          </ul>
        </li>
      `;
    })
    .join('');

  return `
    <div class="content-tree-container" role="region" aria-label="Course Structure Tree">
      <div class="tree-header">
        <span class="tree-course-heading">${escapeHtml(props.courseTitle)}</span>
      </div>
      <ul class="content-tree-root" role="tree" aria-label="${escapeHtml(props.courseTitle)} outline">
        ${modulesHtml}
      </ul>
      <div class="tree-footer">
        <button type="button" class="btn btn-secondary btn-compact w-full">+ Add module</button>
      </div>
    </div>
  `;
}
