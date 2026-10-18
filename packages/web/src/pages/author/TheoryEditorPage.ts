import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';
import { renderMarkdownToHtml } from 'zur-shared';
import { renderIcon } from '../../components/common/icons.ts';
import type { ModuleSummary } from './AuthorTreeComponent.ts';

export interface TheoryEditorPageOptions {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  stepId: string;
  stepTitle: string;
  markdown: string;
  revision: number;
  isRequired: boolean;
  estimatedDurationMinutes: number;
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'conflict';
  saveMessage?: string;
  errorMessage?: string;
  treeContent?: string;
  modules?: ModuleSummary[];
}

export function renderTheoryEditorPage(opts: TheoryEditorPageOptions): string {
  const rawMarkdown = opts.markdown;
  opts = safeTemplateData(opts);
  const saveStatusText =
    opts.saveStatus === 'saving'
      ? 'Saving...'
      : opts.saveStatus === 'unsaved'
      ? 'Unsaved edits (offline)'
      : opts.saveStatus === 'conflict'
      ? 'Draft conflict'
      : undefined;

  const previewHtml = renderMarkdownToHtml(rawMarkdown || '');

  const editorContent = `
    <div class="theory-editor-container editor-wide" data-view="split">
      <header class="editor-header">
        <div class="title-input-row">
          <label for="step-title-input" class="visually-hidden">Step title</label>
          <input
            id="step-title-input"
            type="text"
            class="text-input step-title-input"
            value="${opts.stepTitle}"
            placeholder="Step title..."
            oninput="this.closest('.shell-author')?.classList.add('is-dirty')"
            required
          />
        </div>
      </header>

      ${opts.errorMessage ? `<div class="alert alert-danger mt-2" role="alert">${opts.errorMessage}</div>` : ''}
      ${opts.saveStatus === 'conflict' ? `<div class="alert alert-danger mt-2" role="alert">Version conflict: this step has been modified remotely. Review changes before saving.</div>` : ''}
      ${opts.saveMessage ? `<div class="alert alert-info mt-2" role="status">${opts.saveMessage}</div>` : ''}

      <div class="theory-toolbar-row mt-3">
        <div class="markdown-toolbar flex flex-wrap gap-1" role="toolbar" aria-label="Text Formatting">
          <button type="button" class="btn btn-secondary btn-compact" data-format="bold" aria-label="Bold" title="Bold (Ctrl+B)"><strong>B</strong></button>
          <button type="button" class="btn btn-secondary btn-compact" data-format="italic" aria-label="Italic" title="Italic (Ctrl+I)"><em>I</em></button>
          <button type="button" class="btn btn-secondary btn-compact" data-format="heading" aria-label="Heading" title="Heading">H</button>
          <button type="button" class="btn btn-secondary btn-compact" data-format="code" aria-label="Code block" title="Code block">&lt;/&gt;</button>
          <button type="button" class="btn btn-secondary btn-compact" data-format="list" aria-label="Bullet list" title="Bullet list">${renderIcon('list', { size: 14 })}</button>
          <button type="button" class="btn btn-secondary btn-compact" data-format="table" aria-label="Table" title="Table">${renderIcon('table', { size: 14 })}</button>
          <button type="button" class="btn btn-secondary btn-compact" data-format="callout" aria-label="Callout" title="Callout (Note/Tip)">${renderIcon('callout', { size: 14 })}</button>
          <button type="button" class="btn btn-secondary btn-compact" data-action="open-asset-modal" aria-label="Upload image" title="Upload image (PNG, JPEG or WebP, up to 10 MB)">${renderIcon('image', { size: 14 })} Upload image</button>
        </div>
        <div class="segmented-control theory-view-toggle" role="group" aria-label="Editor view">
          <button type="button" class="segmented-control-btn" data-view="edit" aria-pressed="false">Edit</button>
          <button type="button" class="segmented-control-btn active" data-view="split" aria-pressed="true">Split</button>
          <button type="button" class="segmented-control-btn" data-view="preview" aria-pressed="false">Preview</button>
        </div>
      </div>

      <div class="theory-split mt-2">
        <div class="theory-edit-pane">
          <label for="theory-markdown-input" class="visually-hidden">Theory Content (Markdown)</label>
          <textarea
            id="theory-markdown-input"
            class="textarea-input theory-markdown-textarea w-full font-mono text-sm leading-relaxed"
            rows="18"
            placeholder="Write explanation in Markdown..."
            aria-describedby="markdown-help"
            oninput="this.closest('.shell-author')?.classList.add('is-dirty')"
          >${opts.markdown}</textarea>
          <div class="flex items-center justify-between text-xs text-muted mt-1.5" id="markdown-help">
            <span>Supports standard Markdown, tables, and callouts</span>
            <a href="https://commonmark.org/help/" target="_blank" rel="noopener" class="text-secondary hover:underline">Markdown help ↗</a>
          </div>
        </div>

        <div class="theory-preview-pane" role="region" aria-label="Theory Preview" aria-live="off">
          <div class="rendered-markdown-content rich-text-body">
            ${previewHtml}
          </div>
        </div>
      </div>
    </div>
  `;

  const inspectorContent = `
    <div class="inspector-box p-3">
      <details class="inspector-collapsible" open>
        <summary class="inspector-title">Step settings</summary>

        <div class="form-group mt-3">
          <label for="step-duration" class="field-label">Estimated duration</label>
          <div class="input-with-unit">
            <input
              id="step-duration"
              type="number"
              min="1"
              max="120"
              class="text-input input-compact"
              value="${opts.estimatedDurationMinutes}"
              oninput="this.closest('.shell-author')?.classList.add('is-dirty')"
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
              onchange="this.closest('.shell-author')?.classList.add('is-dirty')"
            />
            <span class="switch-track" aria-hidden="true"></span>
            <span>Required step for course completion</span>
          </label>
        </div>
      </details>
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

const FORMATS: Record<string, { wrap?: [string, string, string]; line?: string; block?: string }> = {
  bold: { wrap: ['**', '**', 'bold text'] },
  italic: { wrap: ['*', '*', 'italic text'] },
  code: { wrap: ['\n```python\n', '\n```\n', 'code'] },
  heading: { line: '## ' },
  list: { line: '- ' },
  table: { block: '\n| Column A | Column B |\n| --- | --- |\n| Value | Value |\n' },
  callout: { block: '\n> **Note**\n> Write the callout text here.\n' },
};

export function applyMarkdownFormat(area: HTMLTextAreaElement, format: string): void {
  const spec = FORMATS[format];
  if (!spec) return;
  const { selectionStart: start, selectionEnd: end, value } = area;
  let next = value;
  let caretStart = start;
  let caretEnd = end;
  if (spec.wrap) {
    const [open, close, placeholder] = spec.wrap;
    const selected = value.slice(start, end) || placeholder;
    next = value.slice(0, start) + open + selected + close + value.slice(end);
    caretStart = start + open.length;
    caretEnd = caretStart + selected.length;
  } else if (spec.line) {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    next = value.slice(0, lineStart) + spec.line + value.slice(lineStart);
    caretStart = caretEnd = end + spec.line.length;
  } else if (spec.block) {
    next = value.slice(0, start) + spec.block + value.slice(end);
    caretStart = caretEnd = start + spec.block.length;
  }
  area.value = next;
  area.focus();
  area.setSelectionRange(caretStart, caretEnd);
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

export function initTheoryEditor(
  root: HTMLElement,
  render: (markdown: string) => string,
  afterRender?: () => void,
): void {
  const container = root.querySelector<HTMLElement>('.theory-editor-container');
  const area = root.querySelector<HTMLTextAreaElement>('#theory-markdown-input');
  const preview = root.querySelector<HTMLElement>('.rendered-markdown-content');
  if (!container || !area || !preview) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    preview.innerHTML = render(area.value);
    afterRender?.();
  };
  area.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 150);
  });

  const setView = (view: string) => {
    container.dataset.view = view;
    root.querySelectorAll<HTMLElement>('.theory-view-toggle [data-view]').forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (view !== 'edit') refresh();
  };
  root.querySelectorAll<HTMLElement>('.theory-view-toggle [data-view]').forEach((b) =>
    b.addEventListener('click', () => setView(b.dataset.view || 'split')));
  if (window.matchMedia && window.matchMedia('(max-width: 1100px)').matches) setView('edit');

  root.querySelectorAll<HTMLElement>('.markdown-toolbar [data-format]').forEach((b) =>
    b.addEventListener('click', () => applyMarkdownFormat(area, b.dataset.format || '')));
  area.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'b' || key === 'i') {
      e.preventDefault();
      applyMarkdownFormat(area, key === 'b' ? 'bold' : 'italic');
    }
  });
}
