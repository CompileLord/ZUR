import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';
import { renderMarkdownToHtml } from 'zur-shared';
import { renderIcon } from '../../components/common/icons.ts';

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
  treeContent?: string;
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
    <div class="theory-editor-container" style="max-width: 800px; margin: 0 auto; padding: 1.5rem 1rem;">
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

      ${opts.saveMessage ? `<div class="alert alert-info mt-2" role="status">${opts.saveMessage}</div>` : ''}

      <!-- Modest formatting toolbar (design §12 P23) -->
      <div class="markdown-toolbar mt-3 flex flex-wrap gap-1 p-2 bg-surface border border-subtle rounded-md" role="toolbar" aria-label="Text Formatting">
        <button type="button" class="btn btn-secondary btn-compact" data-format="bold" aria-label="Bold"><strong>B</strong></button>
        <button type="button" class="btn btn-secondary btn-compact" data-format="italic" aria-label="Italic"><em>I</em></button>
        <button type="button" class="btn btn-secondary btn-compact" data-format="heading" aria-label="Heading">H</button>
        <button type="button" class="btn btn-secondary btn-compact" data-format="code" aria-label="Code block">&lt;/&gt;</button>
        <button type="button" class="btn btn-secondary btn-compact" data-format="list" aria-label="Bullet list" title="Bullet list">${renderIcon('list', { size: 14 })}</button>
        <button type="button" class="btn btn-secondary btn-compact" data-format="table" aria-label="Table" title="Table">${renderIcon('table', { size: 14 })}</button>
        <button type="button" class="btn btn-secondary btn-compact" data-format="callout" aria-label="Callout" title="Callout">${renderIcon('callout', { size: 14 })}</button>
        <button type="button" class="btn btn-secondary btn-compact" data-format="image" aria-label="Insert image" title="Insert image">${renderIcon('image', { size: 14 })}</button>
      </div>

      <div class="theory-tabs mt-3" role="tablist">
        <button type="button" class="tab-btn active" role="tab" aria-selected="true" data-tab="edit">Edit</button>
        <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="preview">Preview</button>
      </div>

      <div class="theory-edit-pane mt-2">
        <label for="theory-markdown-input" class="visually-hidden">Theory Content (Markdown)</label>
        <textarea
          id="theory-markdown-input"
          class="textarea-input theory-markdown-textarea w-full font-mono text-sm leading-relaxed"
          rows="18"
          placeholder="Write explanation in Markdown..."
          aria-describedby="markdown-help"
        >${opts.markdown}</textarea>
        <p id="markdown-help" class="field-hint text-xs text-muted mt-1.5">Supports standard Markdown, tables, code blocks, callouts (> [!NOTE]), and images.</p>
      </div>

      <div class="theory-preview-pane mt-2" style="display:none;" role="region" aria-label="Theory Preview">
        <div class="rendered-markdown-content rich-text-body p-4 bg-surface border border-subtle rounded-md">
          ${previewHtml}
        </div>
      </div>
    </div>
  `;

  const inspectorContent = `
    <div class="inspector-box p-3">
      <h3 class="inspector-title">Step settings</h3>

      <div class="form-group mt-3">
        <label for="step-duration" class="field-label">Estimated duration</label>
        <div class="input-with-unit flex items-center">
          <input
            id="step-duration"
            type="number"
            min="1"
            max="120"
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

      <hr class="section-divider mt-4" />

      <h4 class="text-sm font-semibold text-secondary">Asset tools</h4>
      <p class="text-secondary text-xs mt-1">Upload PNG, JPEG, or WebP images up to 10 MB.</p>
      <button type="button" class="btn btn-secondary btn-compact mt-2" data-action="open-asset-modal">Upload asset</button>
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
