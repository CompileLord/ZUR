import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';
import { renderIcon } from '../../components/common/icons.ts';

export interface QuizOptionItem {
  id: string;
  text: string;
  isCorrect?: boolean;
}

export interface QuizEditorPageOptions {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  stepId: string;
  stepTitle: string;
  quizType: 'single_choice' | 'multiple_choice';
  prompt: string;
  options: QuizOptionItem[];
  explanation: string;
  revision: number;
  isRequired: boolean;
  estimatedDurationMinutes: number;
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'conflict';
  saveMessage?: string;
  errorMessage?: string;
  treeContent?: string;
}

export function renderQuizEditorPage(opts: QuizEditorPageOptions): string {
  opts = safeTemplateData(opts);
  const saveStatusText =
    opts.saveStatus === 'saving'
      ? 'Saving...'
      : opts.saveStatus === 'unsaved'
      ? 'Unsaved edits (offline)'
      : opts.saveStatus === 'conflict'
      ? 'Draft conflict'
      : undefined;

  const isSingleChoice = opts.quizType === 'single_choice';
  const canAddOption = opts.options.length < 8;
  const canRemoveOption = opts.options.length > 2;

  const optionsHtml = opts.options
    .map((opt, idx) => {
      const inputType = isSingleChoice ? 'radio' : 'checkbox';
      const inputName = isSingleChoice ? 'correctOption' : `correctOption_${opt.id}`;

      return `
        <div class="quiz-option-row flex items-center gap-2 p-2.5 mb-2 bg-surface border border-subtle rounded-md" data-option-id="${opt.id}">
          <span class="drag-handle text-muted cursor-grab flex-shrink-0" aria-hidden="true" title="Reorder option">
            ${renderIcon('grip-vertical', { size: 14 })}
          </span>
          <label class="correct-answer-label flex items-center gap-1.5 cursor-pointer flex-shrink-0" title="Mark as correct answer">
            <input
              type="${inputType}"
              name="${inputName}"
              value="${opt.id}"
              ${opt.isCorrect ? 'checked' : ''}
              aria-label="Mark Option ${String.fromCharCode(65 + idx)} as correct answer"
            />
            <span class="correct-text text-xs text-secondary font-medium">Correct answer</span>
          </label>
          <span class="option-letter font-mono text-xs font-semibold text-muted w-4 text-center flex-shrink-0">${String.fromCharCode(65 + idx)}</span>
          <input
            type="text"
            class="text-input option-text-input flex-1 text-sm"
            value="${opt.text}"
            placeholder="Enter answer choice text..."
            required
          />
          <button
            type="button"
            class="btn btn-ghost btn-compact text-danger remove-option-btn p-1.5 flex-shrink-0"
            data-option-id="${opt.id}"
            ${!canRemoveOption ? 'disabled' : ''}
            aria-label="Remove option ${String.fromCharCode(65 + idx)}"
            title="Remove option"
          >
            ${renderIcon('trash', { size: 14 })}
            <span class="sr-only">Remove</span>
          </button>
        </div>
      `;
    })
    .join('');

  const editorContent = `
    <div class="quiz-editor-container" style="max-width: 800px; margin: 0 auto; padding: 1.5rem 1rem;">
      <header class="editor-header">
        <div class="breadcrumbs">
          <a href="/teach/${opts.courseId}/content">← Back to Course Builder</a>
        </div>
        <div class="title-input-row mt-2">
          <label for="step-title-input" class="visually-hidden">Step title</label>
          <input
            id="step-title-input"
            type="text"
            class="text-input step-title-input"
            value="${opts.stepTitle}"
            placeholder="Step title..."
            required
          />
        </div>
      </header>

      ${opts.errorMessage ? `<div class="alert alert-danger mt-2" role="alert">${opts.errorMessage}</div>` : ''}
      ${opts.saveMessage ? `<div class="alert alert-info mt-2" role="status">${opts.saveMessage}</div>` : ''}

      <div class="form-group mt-4">
        <label for="quiz-prompt-input" class="field-label">Question prompt</label>
        <textarea
          id="quiz-prompt-input"
          class="textarea-input"
          rows="4"
          placeholder="State the question clearly..."
          required
        >${opts.prompt}</textarea>
      </div>

      <div class="form-group mt-3">
        <label for="quiz-type-select" class="field-label">Question type</label>
        <div class="segmented-control inline-flex mb-1.5" role="radiogroup" aria-label="Question type">
          <label class="segmented-control-btn ${isSingleChoice ? 'active' : ''} cursor-pointer px-3 py-1 text-xs font-medium rounded" onclick="const sel = document.getElementById('quiz-type-select'); if (sel) { sel.value='single_choice'; sel.dispatchEvent(new Event('change')); this.parentElement.querySelectorAll('.segmented-control-btn').forEach(b => b.classList.remove('active')); this.classList.add('active'); }">
            <input type="radio" name="quizType" value="single_choice" class="sr-only" ${isSingleChoice ? 'checked' : ''} />
            <span>Single choice</span>
          </label>
          <label class="segmented-control-btn ${!isSingleChoice ? 'active' : ''} cursor-pointer px-3 py-1 text-xs font-medium rounded" onclick="const sel = document.getElementById('quiz-type-select'); if (sel) { sel.value='multiple_choice'; sel.dispatchEvent(new Event('change')); this.parentElement.querySelectorAll('.segmented-control-btn').forEach(b => b.classList.remove('active')); this.classList.add('active'); }">
            <input type="radio" name="quizType" value="multiple_choice" class="sr-only" ${!isSingleChoice ? 'checked' : ''} />
            <span>Multiple choice</span>
          </label>
        </div>
        <select id="quiz-type-select" class="select-input sr-only" aria-hidden="true" style="max-width: 300px;">
          <option value="single_choice" ${isSingleChoice ? 'selected' : ''}>Single choice (One correct answer)</option>
          <option value="multiple_choice" ${!isSingleChoice ? 'selected' : ''}>Multiple choice (Multiple correct answers)</option>
        </select>
        <p class="field-hint text-xs text-muted">
          ${
            isSingleChoice
              ? 'Single choice requires exactly 1 correct answer.'
              : 'Multiple choice requires at least 1 correct and at least 1 incorrect answer.'
          }
        </p>
      </div>

      <div class="quiz-options-section mt-4">
        <div class="section-header-row flex justify-between items-center mb-2">
          <h2 class="section-title text-base font-semibold">Answer choices (${opts.options.length} of 8)</h2>
          ${!canAddOption ? '<span class="status-badge warning">Max 8 options</span>' : ''}
        </div>

        <div class="options-container mt-2">
          ${optionsHtml}
        </div>

        ${
          canAddOption
            ? `
              <div class="mt-3">
                <button type="button" class="btn btn-ghost btn-compact text-secondary" data-action="add-option">+ Add option</button>
              </div>
            `
            : ''
        }
      </div>

      <div class="form-group mt-5">
        <label for="quiz-explanation-input" class="field-label">Post-pass explanation</label>
        <textarea
          id="quiz-explanation-input"
          class="textarea-input w-full text-sm"
          rows="3"
          placeholder="Explain why the correct answer is right..."
          aria-describedby="explanation-hint"
        >${opts.explanation}</textarea>
        <p id="explanation-hint" class="field-hint text-xs text-muted mt-1.5">Shown after a correct answer.</p>
      </div>
    </div>
  `;

  const inspectorContent = `
    <div class="inspector-box p-3">
      <h3 class="inspector-title">Quiz settings</h3>

      <div class="form-group mt-3">
        <label for="step-duration" class="field-label">Duration</label>
        <div class="input-with-unit flex items-center">
          <input
            id="step-duration"
            type="number"
            min="1"
            max="60"
            class="text-input input-compact"
            value="${opts.estimatedDurationMinutes}"
          />
          <span class="unit-text text-xs text-muted ml-1.5">min</span>
        </div>
      </div>

      <div class="form-group mt-3">
        <label class="checkbox-label flex items-center gap-2 text-sm text-secondary">
          <input
            id="step-required"
            type="checkbox"
            ${opts.isRequired ? 'checked' : ''}
          />
          <span>Required step for course completion</span>
        </label>
      </div>
    </div>
  `;

  return renderAuthorWorkspaceShell({
    courseId: opts.courseId,
    courseTitle: opts.courseTitle,
    publicationState: opts.publicationState,
    hasUnpublishedChanges: opts.hasUnpublishedChanges,
    saveStatusText,
    activeTab: 'content',
    treeContent: opts.treeContent,
    editorContent,
    inspectorContent,
  });
}
