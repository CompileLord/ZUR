import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';
import type { ModuleSummary } from './AuthorTreeComponent.ts';

export interface VideoEditorPageOptions {
  courseId: string;
  courseTitle: string;
  publicationState: 'draft' | 'published' | 'archived';
  hasUnpublishedChanges: boolean;
  stepId: string;
  stepTitle: string;
  videoUrl: string;
  provider: 'youtube' | 'vimeo' | 'loom';
  transcript: string;
  captionVerified: boolean;
  revision: number;
  isRequired: boolean;
  estimatedDurationMinutes: number;
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'conflict';
  saveMessage?: string;
  treeContent?: string;
  modules?: ModuleSummary[];
}

export function deriveEmbedUrl(videoUrl: string): { embedUrl: string | null; provider: 'youtube' | 'vimeo' | 'loom' | null } {
  if (!videoUrl) return { embedUrl: null, provider: null };

  // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube-nocookie.com/embed/ID, youtube.com/embed/ID
  const ytMatch = videoUrl.match(/(?:(?:youtube\.com|youtube-nocookie\.com)\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch) {
    return {
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`,
      provider: 'youtube',
    };
  }

  // Vimeo: vimeo.com/ID
  const vimeoMatch = videoUrl.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|)(\d+)/i);
  if (vimeoMatch) {
    const id = vimeoMatch[3] || vimeoMatch[1];
    return {
      embedUrl: `https://player.vimeo.com/video/${id}`,
      provider: 'vimeo',
    };
  }

  // Loom: loom.com/share/ID
  const loomMatch = videoUrl.match(/loom\.com\/share\/([a-zA-Z0-9]+)/i);
  if (loomMatch) {
    return {
      embedUrl: `https://www.loom.com/embed/${loomMatch[1]}`,
      provider: 'loom',
    };
  }

  return { embedUrl: null, provider: null };
}

export function renderVideoEditorPage(opts: VideoEditorPageOptions): string {
  opts = safeTemplateData(opts);
  const saveStatusText =
    opts.saveStatus === 'saving'
      ? 'Saving...'
      : opts.saveStatus === 'unsaved'
      ? 'Unsaved edits (offline)'
      : opts.saveStatus === 'conflict'
      ? 'Draft conflict'
      : 'Saved';

  const { embedUrl, provider } = deriveEmbedUrl(opts.videoUrl);

  const previewBlock = embedUrl
    ? `
      <div class="video-preview-wrapper responsive-embed">
        <iframe
          src="${embedUrl}"
          title="${opts.stepTitle || 'Video preview'}"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    `
    : `
      <div class="video-preview-placeholder card p-4 text-center">
        <span class="placeholder-icon">🎬</span>
        <p class="text-secondary mt-2">Enter an approved YouTube, Vimeo, or Loom URL above to preview the embedded player.</p>
      </div>
    `;

  const editorContent = `
    <div class="video-editor-container" style="max-width: 860px; margin: 0 auto; padding: 1.5rem 1rem;">
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

      ${opts.saveMessage ? `<div class="alert alert-info mt-2" role="status">${opts.saveMessage}</div>` : ''}

      <div class="form-group mt-3">
        <label for="video-url-input" class="field-label">Video URL <span class="sr-only">Approved video URL</span></label>
        <input
          id="video-url-input"
          type="url"
          class="text-input w-full"
          value="${opts.videoUrl}"
          placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/... or https://loom.com/share/..."
          aria-describedby="video-provider-hint"
          required
        />
        <p id="video-provider-hint" class="field-hint text-xs text-muted mt-1">
          Supported providers: <strong>YouTube</strong>, <strong>Vimeo</strong>, and <strong>Loom</strong>.
        </p>
      </div>

      <div class="video-preview-section mt-4">
        <h2 class="section-title text-sm font-semibold mb-2">Player Preview</h2>
        ${previewBlock}
      </div>

      <div class="form-group mt-4">
        <label for="video-transcript-input" class="field-label" aria-label="Transcript or verified captions">Transcript</label>
        <textarea
          id="video-transcript-input"
          class="textarea-input w-full"
          rows="6"
          placeholder="Paste or edit the video transcript here..."
          aria-describedby="transcript-hint"
        >${opts.transcript}</textarea>
        <p id="transcript-hint" class="field-hint text-xs text-muted mt-1">Add a transcript for learners who cannot play the video.<span class="sr-only"> Ensures WCAG 2.2 AA accessibility and provides an alternative text stream if video playback fails.</span></p>
      </div>
    </div>
  `;

  const inspectorContent = `
    <div class="inspector-box p-3">
      <h3 class="inspector-title">Video step settings</h3>

      <div class="form-group mt-3">
        <label for="step-duration" class="field-label">Duration</label>
        <div class="input-with-unit">
          <input
            id="step-duration"
            type="number"
            min="1"
            max="180"
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

      <div class="form-group mt-3">
        <label class="checkbox-label">
          <input
            id="caption-verified"
            type="checkbox"
            ${opts.captionVerified ? 'checked' : ''}
          />
          <span>Captions verified accurate</span>
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
