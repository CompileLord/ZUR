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

  let videoPlayerHtml = '';
  if (derived.embedUrl) {
    videoPlayerHtml = `
      <div class="video-player-container">
        <div class="video-aspect-frame">
          <iframe
            src="${derived.embedUrl}"
            class="video-embed-iframe"
            title="${escapeHtml(opts.stepTitle)}"
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          ></iframe>
        </div>
      </div>
      <div class="video-fallback-banner" data-video-fallback hidden role="status">
        <p class="fallback-title">Video player unavailable</p>
        <p class="fallback-message">The player did not load. The lesson transcript remains available below.</p>
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

      <footer class="step-navigation-footer">
        <div class="footer-left">
          ${
            opts.previousStepUrl
              ? `<a href="${opts.previousStepUrl}" class="btn btn-secondary btn-compact">Previous</a>`
              : ''
          }
        </div>

        <div class="footer-center">
            <a href="/help/report?stepId=${encodeURIComponent(opts.stepId)}&amp;enrollmentId=${encodeURIComponent(opts.enrollmentId)}" class="report-issue-link">
            Report issue
          </a>
        </div>

        <div class="footer-right">
          ${
            opts.isCompleted
              ? `
                <span class="status-badge success">Completed ✓</span>
                ${
                  opts.nextStepUrl
                    ? `<a href="${opts.nextStepUrl}" class="btn btn-primary btn-compact">Next step →</a>`
                    : `<a href="${opts.courseOverviewUrl}" class="btn btn-secondary btn-compact">Course overview</a>`
                }
              `
              : `
                <form method="POST" action="/api/enrollments/${opts.enrollmentId}/steps/${opts.stepId}/complete" class="complete-step-form">
                  <button type="submit" class="btn btn-primary">
                    Mark complete and continue
                  </button>
                </form>
              `
          }
        </div>
      </footer>
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
    nextStepUrl: opts.nextStepUrl,
  });
}
