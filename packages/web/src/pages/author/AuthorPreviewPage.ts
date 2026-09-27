import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderMarkdownToHtml } from 'zur-shared';
import { deriveEmbedUrl } from './VideoEditorPage.ts';

export interface AuthorPreviewPageOptions {
  courseId: string;
  courseTitle: string;
  stepId: string;
  stepTitle: string;
  stepType: 'theory' | 'video' | 'quiz' | 'python';
  stepOrdinalText?: string;
  content: any; // Step-specific sanitized payload
  returnEditorUrl: string;
  previousStepUrl?: string | null;
  nextStepUrl?: string | null;
}

export function renderAuthorPreviewPage(opts: AuthorPreviewPageOptions): string {
  opts = safeTemplateData(opts, new Set(['markdown']));
  // Top persistent preview banner (design §12 P26)
  const previewBanner = `
    <aside class="author-preview-banner" role="status" aria-label="Student Preview Status">
      <div class="banner-inner container">
        <div class="banner-left">
          <span class="preview-tag">STUDENT PREVIEW</span>
          <span class="preview-text">Preview — your actions won't affect student progress or analytics.</span>
        </div>
        <div class="banner-right">
          <a href="${opts.returnEditorUrl}" class="btn btn-secondary btn-compact">← Back to editor</a>
        </div>
      </div>
    </aside>
  `;

  let stepViewHtml = '';

  if (opts.stepType === 'theory') {
    const markdown = opts.content?.markdown || '';
    const htmlContent = renderMarkdownToHtml(markdown);

    stepViewHtml = `
      <article class="learning-step-reading" role="article" aria-labelledby="step-title">
        <header class="step-header">
          <div class="step-ordinal text-secondary">${opts.stepOrdinalText || 'Theory Step'}</div>
          <h1 id="step-title" class="step-title">${opts.stepTitle}</h1>
        </header>

        <div class="rendered-markdown-content rich-text-body mt-4">
          ${htmlContent}
        </div>
      </article>
    `;
  } else if (opts.stepType === 'video') {
    const videoUrl = opts.content?.videoUrl || '';
    const transcript = opts.content?.transcript || '';
    const { embedUrl } = deriveEmbedUrl(videoUrl);

    stepViewHtml = `
      <article class="learning-step-video" role="article" aria-labelledby="step-title">
        <header class="step-header">
          <div class="step-ordinal text-secondary">${opts.stepOrdinalText || 'Video Step'}</div>
          <h1 id="step-title" class="step-title">${opts.stepTitle}</h1>
        </header>

        <div class="video-container mt-4">
          ${
            embedUrl
              ? `
                <div class="responsive-embed">
                  <iframe
                    src="${embedUrl}"
                    title="${opts.stepTitle}"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                  ></iframe>
                </div>
              `
              : '<div class="alert alert-info">Video not configured yet.</div>'
          }
        </div>

        ${
          transcript
            ? `
              <section class="transcript-section mt-4" aria-labelledby="transcript-heading">
                <h2 id="transcript-heading" class="section-title text-base font-semibold">Transcript</h2>
                <div class="transcript-box card p-3 mt-2 text-secondary whitespace-pre-line">
                  ${transcript}
                </div>
              </section>
            `
            : ''
        }
      </article>
    `;
  } else if (opts.stepType === 'quiz') {
    const prompt = opts.content?.prompt || '';
    const options = opts.content?.options || [];
    const isSingle = opts.content?.quizType === 'single_choice';

    stepViewHtml = `
      <article class="learning-step-quiz" role="article" aria-labelledby="step-title">
        <header class="step-header">
          <div class="step-ordinal text-secondary">${opts.stepOrdinalText || 'Quiz Checkpoint'}</div>
          <h1 id="step-title" class="step-title">${opts.stepTitle}</h1>
        </header>

        <div class="quiz-question-box card p-4 mt-4">
          <p class="quiz-prompt font-semibold text-lg">${prompt}</p>

          <fieldset class="quiz-choices-fieldset mt-4">
            <legend class="visually-hidden">Answer choices</legend>
            <div class="quiz-options-list">
              ${options
                .map(
                  (opt: any, idx: number) => `
                  <label class="quiz-option-choice card p-3 mb-2" for="opt-${opt.id}">
                    <input
                      type="${isSingle ? 'radio' : 'checkbox'}"
                      id="opt-${opt.id}"
                      name="quiz_choice"
                      value="${opt.id}"
                    />
                    <span class="option-text">${String.fromCharCode(65 + idx)}. ${opt.text}</span>
                  </label>
                `
                )
                .join('')}
            </div>
          </fieldset>

          <div class="quiz-action-bar mt-4">
            <button type="button" class="btn btn-primary" data-action="submit-preview-quiz">Submit answer</button>
          </div>
        </div>
      </article>
    `;
  } else if (opts.stepType === 'python') {
    const problemStatement = opts.content?.problemStatement || '';
    const inputFormat = opts.content?.inputFormat || '';
    const outputFormat = opts.content?.outputFormat || '';
    const constraints = opts.content?.constraints || '';
    const starterCode = opts.content?.starterCode || '';
    const publicTests = opts.content?.publicTests || [];

    stepViewHtml = `
      <div class="learning-workspace-paired-layout" role="region" aria-label="Python Exercise Workspace">
        <!-- Problem Pane -->
        <aside class="problem-pane p-4" role="region" aria-label="Problem Instructions">
          <div class="step-ordinal text-secondary text-sm">${opts.stepOrdinalText || 'Python Exercise'}</div>
          <h1 class="problem-title text-xl font-bold mt-1">${opts.stepTitle}</h1>

          <div class="problem-section mt-4">
            <h2 class="section-title text-base font-semibold">Problem Statement</h2>
            <p class="text-secondary mt-1">${problemStatement}</p>
          </div>

          <div class="problem-section mt-3">
            <h2 class="section-title text-base font-semibold">Input & Output</h2>
            <p class="text-secondary text-sm"><strong>Input:</strong> ${inputFormat}</p>
            <p class="text-secondary text-sm"><strong>Output:</strong> ${outputFormat}</p>
          </div>

          <div class="problem-section mt-3">
            <h2 class="section-title text-base font-semibold">Constraints</h2>
            <code class="code-snippet">${constraints}</code>
          </div>

          ${
            publicTests.length > 0
              ? `
                <div class="problem-section mt-4">
                  <h2 class="section-title text-base font-semibold">Sample Test Cases</h2>
                  ${publicTests
                    .map(
                      (pt: any, idx: number) => `
                      <div class="test-comparison-block card p-2 mb-2 font-mono text-xs">
                        <span class="text-secondary">Input ${idx + 1}:</span>
                        <pre>${pt.stdin || '(empty)'}</pre>
                        <span class="text-secondary mt-1">Expected Output:</span>
                        <pre>${pt.expectedStdout}</pre>
                      </div>
                    `
                    )
                    .join('')}
                </div>
              `
              : ''
          }
        </aside>

        <!-- Editor Pane -->
        <div class="editor-pane p-4">
          <div class="editor-toolbar mb-2">
            <span class="text-secondary text-sm">Python 3.12</span>
            <div class="editor-actions">
              <button type="button" class="btn btn-secondary btn-compact" data-action="run-samples">Run samples</button>
              <button type="button" class="btn btn-primary btn-compact" data-action="submit-solution">Submit solution</button>
            </div>
          </div>
          <textarea class="code-editor textarea-input font-mono" rows="18" aria-label="Python Solution Code">${starterCode}</textarea>
        </div>
      </div>
    `;
  }

  return `
    <div class="shell-student-preview">
      ${previewBanner}

      <main id="main-content" class="preview-main-content container py-4" role="main">
        ${stepViewHtml}

        <footer class="preview-step-footer mt-5 pt-3 border-t">
          <div class="footer-navigation-row">
            ${opts.previousStepUrl ? `<a href="${opts.previousStepUrl}" class="btn btn-secondary">← Previous step</a>` : '<div></div>'}
            ${opts.nextStepUrl ? `<a href="${opts.nextStepUrl}" class="btn btn-primary">Next step →</a>` : '<div></div>'}
          </div>
        </footer>
      </main>
    </div>
  `;
}
