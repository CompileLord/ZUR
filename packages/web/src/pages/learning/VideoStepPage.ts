import { renderLearningWorkspaceShell } from '../../components/shells/LearningWorkspaceShell.ts';
import { deriveEmbedUrl, escapeHtml } from 'zur-shared';

export interface VideoStepPageOptions {
  courseTitle: string;
  courseOverviewUrl: string;
  lessonTitle: string;
  stepTitle: string;
  stepOrdinalText: string;
  isRequired: boolean;
  estimatedDurationMinutes: number;
  videoUrl: string;
  transcript?: string;
  captionVerified?: boolean;
  enrollmentId: string;
  stepId: string;
  isCompleted: boolean;
  outlineContent?: string;
  previousStepUrl?: string | null;
  nextStepUrl?: string | null;
}

export function renderVideoStepPage(opts: VideoStepPageOptions): string {
  const derived = deriveEmbedUrl(opts.videoUrl);
  const continueUrl = opts.nextStepUrl || opts.courseOverviewUrl;
  const taskActions = `
    <a href="/help/report?stepId=${encodeURIComponent(opts.stepId)}&amp;enrollmentId=${encodeURIComponent(opts.enrollmentId)}" class="report-issue-link">Report issue</a>
    ${opts.isCompleted
      ? `<a href="${escapeHtml(continueUrl)}" class="btn btn-primary btn-compact">Continue</a>`
      : `<form method="POST" action="/api/enrollments/${encodeURIComponent(opts.enrollmentId)}/steps/${encodeURIComponent(opts.stepId)}/complete" class="complete-step-form"><button type="submit" class="btn btn-primary">Mark complete and continue</button></form>`}
  `;

  let videoPlayerHtml = '';
  if (derived.embedUrl) {
    const embedUrl = new URL(derived.embedUrl);
    if (derived.provider === 'youtube') embedUrl.searchParams.set('enablejsapi', '1');
    if (derived.provider === 'vimeo') {
      embedUrl.searchParams.set('api', '1');
      embedUrl.searchParams.set('player_id', 'zur-lesson-video');
    }
    videoPlayerHtml = `
      <div class="video-player-container">
        <div class="video-aspect-frame">
          <iframe
            src="${escapeHtml(embedUrl.toString())}"
            data-provider="${derived.provider}"
            id="lesson-video-player"
            class="video-embed-iframe"
            title="${escapeHtml(opts.stepTitle)}"
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          ></iframe>
        </div>
      </div>
      <div class="video-fallback-banner" data-video-fallback hidden role="status">
          <p class="fallback-title">Video player unavailable?</p>
          <p class="fallback-message">If the player did not load, retry it here. The lesson transcript remains available below.</p>
        <button type="button" class="btn btn-secondary" data-video-retry>Retry video</button>
      </div>
    `;
  } else {
    videoPlayerHtml = `
      <div class="video-fallback-banner" role="alert">
        <p class="fallback-title">Video player unavailable</p>
        <p class="fallback-message">
          The video stream could not be loaded from the authorized provider. You can read the lesson transcript below.
        </p>
      </div>
    `;
  }

  let transcriptHtml = '';
  if (opts.transcript) {
    transcriptHtml = `
      <details class="transcript-accordion" open>
        <summary class="transcript-summary">
          <span class="summary-text">Transcript</span>
          ${opts.captionVerified ? '<span class="status-badge success">Verified</span>' : ''}
        </summary>
        <div class="transcript-content">
          <p>${escapeHtml(opts.transcript)}</p>
        </div>
      </details>
    `;
  }

  const workspaceContent = `
    <article class="video-step-content" role="region" aria-label="Video Lesson">
      <div class="reading-meta-bar">
        <span class="step-ordinal">${opts.stepOrdinalText}</span>
        <span>·</span>
        <span>Video lesson</span>
        <span>·</span>
        <span>${opts.isRequired ? 'Required' : 'Optional'}</span>
        <span>·</span>
        <span>~${opts.estimatedDurationMinutes}m</span>
      </div>

      <h1 class="video-title">${escapeHtml(opts.stepTitle)}</h1>

      ${videoPlayerHtml}
      ${transcriptHtml}

    </article>
  `;

  return renderLearningWorkspaceShell({
    courseTitle: opts.courseTitle,
    courseOverviewUrl: opts.courseOverviewUrl,
    lessonTitle: opts.lessonTitle,
    stepTitle: opts.stepTitle,
    stepOrdinalText: opts.stepOrdinalText,
    isPythonWorkspace: false,
    outlineContent: opts.outlineContent || '<p class="outline-empty">Outline available</p>',
    workspaceContent,
    previousStepUrl: opts.previousStepUrl,
    taskActions,
  });
}
