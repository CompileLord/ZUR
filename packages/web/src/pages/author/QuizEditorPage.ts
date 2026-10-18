import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';
import { renderIcon } from '../../components/common/icons.ts';

import type { ModuleSummary } from './AuthorTreeComponent.ts';

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
  modules?: ModuleSummary[];
}


export function renderQuizOptionRow(o: { id: string; text: string; isCorrect: boolean; letter: string; inputType: string; inputName: string; canRemove: boolean }): string {
  return `
        <div class="quiz-option-row" data-option-id="${o.id}">
          <span class="drag-handle" role="button" tabindex="0" draggable="true" aria-label="Reorder option ${o.letter}. Press Alt+Up or Alt+Down to move." title="Drag to reorder (or Alt+Up / Alt+Down)">
            ${renderIcon('grip-vertical', { size: 16 })}
          </span>
          <span class="option-letter" aria-hidden="true">${o.letter}</span>
          <input
            type="text"
            class="text-input option-text-input"
            value="${o.text}"
            placeholder="Enter answer choice text..."
            required
          />
          <label class="correct-toggle" title="Mark as correct answer">
            <input
              type="${o.inputType}"
              name="${o.inputName}"
              value="${o.id}"
              class="correct-input"
              ${o.isCorrect ? 'checked' : ''}
              aria-label="Mark Option ${o.letter} as correct answer"
            />
            <span class="correct-toggle-face" aria-hidden="true">${renderIcon('check', { size: 14 })} Correct</span><span class="sr-only">Correct answer</span>
          </label>
          <button
            type="button"
            class="btn btn-ghost btn-compact text-danger remove-option-btn"
            data-option-id="${o.id}"
            ${!o.canRemove ? 'disabled' : ''}
            aria-label="Remove option ${o.letter}"
            title="Remove option"
          >
            ${renderIcon('trash', { size: 14 })}
            <span class="sr-only">Remove</span>
          </button>
        </div>
      `;
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

      const letter = String.fromCharCode(65 + idx);
      return renderQuizOptionRow({ id: opt.id, text: opt.text, isCorrect: opt.isCorrect, letter, inputType, inputName, canRemove: canRemoveOption });
    })
    .join('');

  const editorContent = `
    <div class="quiz-editor-container editor-wide editor-narrow">
      <header class="editor-header">
        <div class="title-input-row">
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
      ${opts.saveStatus === 'conflict' ? `<div class="alert alert-danger mt-2" role="alert">Version conflict: this step has been modified remotely. Review changes before saving.</div>` : ''}
      ${opts.saveMessage ? `<div class="alert alert-info mt-2" role="status">${opts.saveMessage}</div>` : ''}

      <div class="form-group mt-4">
        <label for="quiz-prompt-input" class="field-label">Question prompt</label>
        <textarea
          id="quiz-prompt-input"
          class="textarea-input w-full"
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
        <div class="section-header-row flex justify-between items-center mb-1">
          <h2 class="section-title text-sm font-semibold">Answer choices <span class="option-counter" id="option-counter" aria-live="polite">Answers ${opts.options.length} / 8 (min 2)</span></h2>
          ${!canAddOption ? '<span class="status-badge warning text-xs">Max 8 options</span>' : ''}
        </div>
        <p class="text-xs text-secondary mb-2">${isSingleChoice ? 'Select the correct answer choice below.' : 'Select all correct answer choices below.'}</p>

        <div class="options-container mt-2">
          ${optionsHtml}
        </div>

        ${
          canAddOption
            ? `
              <div class="mt-2 mb-4">
                <button type="button" class="btn btn-secondary btn-compact text-secondary" data-action="add-option">+ Add option</button>
              </div>
            `
            : ''
        }
      </div>

      <details class="explanation-accordion mt-4"${opts.explanation ? ' open' : ''}>
        <summary class="field-label">Post-pass explanation</summary>
        <div class="form-group mt-2">
        <textarea
          id="quiz-explanation-input"
          class="textarea-input w-full text-sm"
          rows="3"
          placeholder="Explain why the correct answer is right..."
          aria-describedby="explanation-hint"
        >${opts.explanation}</textarea>
        <p id="explanation-hint" class="field-hint text-xs text-muted mt-1.5">Shown after a correct answer.</p>
        </div>
      </details>
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
        <label class="switch-label">
          <input
            id="step-required"
            type="checkbox"
            class="switch-input"
            ${opts.isRequired ? 'checked' : ''}
          />
          <span class="switch-track" aria-hidden="true"></span>
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
    modules: opts.modules,
    selectedType: 'step',
    selectedId: opts.stepId,
    editorContent,
    inspectorContent,
  });
}

export function initQuizEditor(root: HTMLElement): void {
  const container = root.querySelector<HTMLElement>('.options-container');
  if (!container) return;
  const rows = () => Array.from(container.querySelectorAll<HTMLElement>('.quiz-option-row'));
  const markDirty = () => root.querySelector('.shell-author')?.classList.add('is-dirty');
  const typeInput = () => ((root.querySelector('#quiz-type-select') as HTMLSelectElement | null)?.value === 'multiple_choice' ? 'checkbox' : 'radio');

  const refresh = () => {
    const list = rows();
    list.forEach((row, i) => {
      const letter = String.fromCharCode(65 + i);
      const l = row.querySelector('.option-letter');
      if (l) l.textContent = letter;
      row.querySelector('.correct-input')?.setAttribute('aria-label', `Mark Option ${letter} as correct answer`);
      row.querySelector('.drag-handle')?.setAttribute('aria-label', `Reorder option ${letter}. Press Alt+Up or Alt+Down to move.`);
      const rm = row.querySelector<HTMLButtonElement>('.remove-option-btn');
      if (rm) { rm.disabled = list.length <= 2; rm.setAttribute('aria-label', `Remove option ${letter}`); }
    });
    const counter = root.querySelector('#option-counter');
    if (counter) counter.textContent = `Answers ${list.length} / 8 (min 2)`;
    const add = root.querySelector<HTMLButtonElement>('[data-action="add-option"]');
    if (add) add.disabled = list.length >= 8;
  };

  root.querySelector('[data-action="add-option"]')?.addEventListener('click', () => {
    if (rows().length >= 8) return;
    const id = crypto.randomUUID();
    const multi = typeInput() === 'checkbox';
    const wrap = document.createElement('div');
    wrap.innerHTML = renderQuizOptionRow({ id, text: '', isCorrect: false, letter: '', inputType: typeInput(), inputName: multi ? `correctOption_${id}` : 'correctOption', canRemove: true }).trim();
    const row = wrap.firstElementChild as HTMLElement;
    container.append(row);
    refresh();
    markDirty();
    row.querySelector<HTMLInputElement>('.option-text-input')?.focus();
  });

  container.addEventListener('click', (event) => {
    const button = (event.target as Element).closest('.remove-option-btn');
    if (button && rows().length > 2) { button.closest('.quiz-option-row')?.remove(); refresh(); markDirty(); }
  });

  let dragged: HTMLElement | null = null;
  container.addEventListener('dragstart', (e) => {
    const row = (e.target as Element).closest<HTMLElement>('.quiz-option-row');
    if (!row || !(e.target as Element).closest('.drag-handle')) { e.preventDefault(); return; }
    dragged = row;
    row.classList.add('is-dragging');
    e.dataTransfer?.setData('text/plain', row.dataset.optionId || '');
  });
  container.addEventListener('dragover', (e) => {
    if (!dragged) return;
    e.preventDefault();
    const over = (e.target as Element).closest<HTMLElement>('.quiz-option-row');
    if (!over || over === dragged) return;
    const after = e.clientY > over.getBoundingClientRect().top + over.offsetHeight / 2;
    container.insertBefore(dragged, after ? over.nextSibling : over);
  });
  container.addEventListener('dragend', () => { dragged?.classList.remove('is-dragging'); dragged = null; refresh(); markDirty(); });
  container.addEventListener('keydown', (e) => {
    const handle = (e.target as Element).closest<HTMLElement>('.drag-handle');
    if (!handle || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const row = handle.closest<HTMLElement>('.quiz-option-row')!;
    const sibling = e.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
    if (!sibling) return;
    if (e.key === 'ArrowUp') container.insertBefore(row, sibling); else container.insertBefore(sibling, row);
    refresh();
    markDirty();
    handle.focus();
  });

  root.querySelector('#quiz-type-select')?.addEventListener('change', () => {
    const multi = typeInput() === 'checkbox';
    container.querySelectorAll<HTMLInputElement>('.correct-input').forEach((input) => { input.type = multi ? 'checkbox' : 'radio'; input.name = multi ? `correctOption_${input.value}` : 'correctOption'; });
  });
}
