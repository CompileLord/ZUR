import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';

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
  const saveStatusText =
    opts.saveStatus === 'saving'
      ? 'Saving...'
      : opts.saveStatus === 'unsaved'
      ? 'Unsaved edits (offline)'
      : opts.saveStatus === 'conflict'
      ? 'Draft conflict'
      : 'Saved';

  const isSingleChoice = opts.quizType === 'single_choice';
  const canAddOption = opts.options.length < 8;
  const canRemoveOption = opts.options.length > 2;

  const optionsHtml = opts.options
    .map((opt, idx) => {
      const inputType = isSingleChoice ? 'radio' : 'checkbox';
      const inputName = isSingleChoice ? 'correctOption' : `correctOption_${opt.id}`;

      return `
        <div class="quiz-option-row card p-3 mb-2" data-option-id="${opt.id}">
          <div class="option-header-row">
            <span class="option-letter">Option ${String.fromCharCode(65 + idx)}</span>
            <label class="correct-answer-label">
              <input
                type="${inputType}"
                name="${inputName}"
                value="${opt.id}"
                ${opt.isCorrect ? 'checked' : ''}
                aria-label="Mark Option ${String.fromCharCode(65 + idx)} as correct answer"
              />
              <span class="correct-text">Correct answer</span>
            </label>
          </div>
          <div class="option-body-row mt-2">
            <input
              type="text"
              class="text-input option-text-input"
              value="${opt.text}"
              placeholder="Enter answer choice text..."
              required
            />
            <button
              type="button"
              class="btn btn-secondary btn-compact text-danger remove-option-btn"
              data-option-id="${opt.id}"
              ${!canRemoveOption ? 'disabled' : ''}
              aria-label="Remove option ${String.fromCharCode(65 + idx)}"
            >Remove</button>
          </div>
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
        <select id="quiz-type-select" class="select-input" style="max-width: 300px;">
          <option value="single_choice" ${isSingleChoice ? 'selected' : ''}>Single choice (One correct answer)</option>
          <option value="multiple_choice" ${!isSingleChoice ? 'selected' : ''}>Multiple choice (Multiple correct answers)</option>
        </select>
        <p class="field-hint">
          ${
            isSingleChoice
              ? 'Single choice requires exactly 1 correct answer.'
              : 'Multiple choice requires at least 1 correct and at least 1 incorrect answer.'
          }
        </p>
      </div>

      <div class="quiz-options-section mt-4">
        <div class="section-header-row">
          <h2 class="section-title text-base font-semibold">Answer choices (${opts.options.length} of 8)</h2>
          ${!canAddOption ? '<span class="status-badge badge-warning">Max 8 options</span>' : ''}
        </div>

        <div class="options-container mt-2">
          ${optionsHtml}
        </div>

        ${
          canAddOption
            ? `
              <div class="mt-3">
                <button type="button" class="btn btn-secondary btn-compact" data-action="add-option">+ Add option</button>
              </div>
            `
            : ''
        }
      </div>

      <div class="form-group mt-5">
        <label for="quiz-explanation-input" class="field-label">Post-pass explanation</label>
        <textarea
          id="quiz-explanation-input"
          class="textarea-input"
          rows="3"
          placeholder="Explain why the correct answer is right..."
          aria-describedby="explanation-hint"
        >${opts.explanation}</textarea>
        <p id="explanation-hint" class="field-hint">Shown after a correct answer.</p>
      </div>
    </div>
  `;

  const inspectorContent = `
    <div class="inspector-box p-3">
      <h3 class="inspector-title">Quiz settings</h3>

      <div class="form-group mt-3">
        <label for="step-duration" class="field-label">Duration</label>
        <div class="input-with-unit">
          <input
            id="step-duration"
            type="number"
            min="1"
            max="60"
            class="text-input input-compact"
            value="${opts.estimatedDurationMinutes}"
          />
          <span class="unit-text">min</span>
        </div>
      </div>

      <div class="form-group mt-3">
        <label class="checkbox-label">
          <input
            id="step-required"
            type="checkbox"
            ${opts.isRequired ? 'checked' : ''}
          />
          <span>Required step for course completion</span>
        </label>
      </div>

      <div class="action-row mt-4">
        <a href="/teach/${opts.courseId}/preview/${opts.stepId}" class="btn btn-secondary btn-compact w-full">Preview as student</a>
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
