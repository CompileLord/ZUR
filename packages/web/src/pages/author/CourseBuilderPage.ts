import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';

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
}

export function renderCourseBuilderPage(opts: CourseBuilderPageOptions): string {
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
          const limitNotice = stepCount >= 20 ? ' (20/20 max)' : ` (${stepCount}/20)`;

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
                    <span class="step-type-badge badge-${st.type}">${typeLabel}</span>
                    <a href="/teach/${opts.courseId}/content?type=step&id=${st.id}" class="tree-label">${st.title}</a>
                  </div>
                  <div class="tree-node-actions">
                    <a href="${editHref}" class="btn-icon" aria-label="Edit ${st.title}">✏️</a>
                    <a href="/teach/${opts.courseId}/preview/${st.id}" class="btn-icon" aria-label="Preview ${st.title}">👁️</a>
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
              <strong>Module ${mIdx + 1}: ${mod.title}</strong>
            </a>
          </div>
          <ul class="tree-children" role="group">
            ${lessonItemsHtml}
          </ul>
        </li>
      `;
    })
    .join('');

  const treeContent = `
    <div class="builder-tree-container">
      <div class="tree-header">
        <h2 class="tree-title">Structure</h2>
        <span class="text-secondary text-sm">${opts.modules.reduce((acc, m) => acc + m.lessons.reduce((lAcc, l) => lAcc + l.steps.length, 0), 0)} steps</span>
      </div>

      <ul class="tree-root" role="tree" aria-label="Course Content Tree">
        <li class="tree-item ${selectedType === 'course' ? 'selected' : ''}" role="treeitem" aria-selected="${selectedType === 'course'}">
          <a href="/teach/${opts.courseId}/content" class="tree-label">
            <strong>${opts.courseTitle} (Overview)</strong>
          </a>
        </li>
        ${treeItemsHtml}
      </ul>

      <div class="tree-footer">
        <form method="POST" action="/teach/${opts.courseId}/modules">
          <div class="input-with-button">
            <input type="text" name="title" class="text-input input-compact" placeholder="New module title..." required />
            <button type="submit" class="btn btn-secondary btn-compact">+ Add module</button>
          </div>
        </form>
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
        <header class="pane-header">
          <h1 class="page-title">${opts.courseTitle}</h1>
          <p class="text-secondary">Course overview and structure management.</p>
        </header>

        <div class="stats-overview-bar">
          <div class="stat-box"><strong>${opts.modules.length}</strong> Modules</div>
          <div class="stat-box"><strong>${totalLessons}</strong> Lessons</div>
          <div class="stat-box"><strong>${totalSteps}</strong> Steps</div>
        </div>

        <div class="builder-modules-list mt-4">
          <h2 class="section-title">Modules in this course</h2>
          ${opts.modules
            .map(
              (m, idx) => `
              <div class="card module-overview-card">
                <div class="card-header">
                  <h3>Module ${idx + 1}: ${m.title}</h3>
                  <div class="card-actions">
                    <a href="/teach/${opts.courseId}/content?type=module&id=${m.id}" class="btn btn-secondary btn-compact">Manage</a>
                  </div>
                </div>
                <div class="card-body">
                  <p class="text-secondary">${m.lessons.length} lessons · ${m.lessons.reduce((a, l) => a + l.steps.length, 0)} steps</p>
                </div>
              </div>
            `
            )
            .join('')}
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

          <hr class="section-divider" />

          <section class="module-lessons-section">
            <h2 class="section-title">Lessons in this module</h2>
            <div class="lessons-list">
              ${mod.lessons
                .map(
                  (l, idx) => `
                  <div class="card lesson-card">
                    <div class="card-header">
                      <h4>${idx + 1}. ${l.title}</h4>
                      <a href="/teach/${opts.courseId}/content?type=lesson&id=${l.id}" class="btn btn-secondary btn-compact">Open lesson</a>
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
                            <a href="${editUrl}" class="btn btn-secondary btn-compact">Edit</a>
                            <a href="/teach/${opts.courseId}/preview/${s.id}" class="btn btn-secondary btn-compact">Preview</a>
                            <form method="POST" action="/teach/${opts.courseId}/steps/${s.id}/duplicate" style="display:inline;">
                              <button type="submit" class="btn btn-secondary btn-compact" ${!canAddStep ? 'disabled' : ''}>Duplicate</button>
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
    }
  }

  return renderAuthorWorkspaceShell({
    courseId: opts.courseId,
    courseTitle: opts.courseTitle,
    publicationState: opts.publicationState,
    hasUnpublishedChanges: opts.hasUnpublishedChanges,
    saveStatusText: opts.saveStatusText || 'Saved',
    activeTab: 'content',
    treeContent,
    editorContent,
  });
}
