import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderMarkdownToHtml, PYTHON_RUNTIME_LABEL } from 'zur-shared';
import { renderLearningWorkspaceShell, type CourseModuleItem, type TaskSquareItem } from '../../components/shells/LearningWorkspaceShell.ts';
import { deriveEmbedUrl } from './VideoEditorPage.ts';
import { authorStyles } from './AuthorStyles.ts';
import { escapeHtml } from '../../components/escape-html.ts';

export interface AuthorPreviewPageOptions {
  courseId: string;
  courseTitle: string;
  stepId: string;
  stepTitle: string;
  stepType: 'theory' | 'video' | 'quiz' | 'python';
  stepOrdinalText?: string;
  lessonTitle?: string;
  content: any; // Step-specific sanitized payload
  returnEditorUrl: string;
  previousStepUrl?: string | null;
  nextStepUrl?: string | null;
  modules?: any[];
}

export function renderAuthorPreviewPage(opts: AuthorPreviewPageOptions): string {
  opts = safeTemplateData(opts, new Set(['markdown']));

  // Top persistent preview banner (design §12 P26) with accessible light/dark theme contrast
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
  let hasAuthoredH1 = false;

  if (opts.stepType === 'theory') {
    const markdown = opts.content?.markdown || '';
    // Preserve authored markdown verbatim without destructive regex.
    // Make heading hierarchy deliberate: if markdown already starts with an H1,
    // suppress repeating the stepTitle as an outer H1.
    hasAuthoredH1 = /^\s*#\s+/m.test(markdown);

    let htmlContent = renderMarkdownToHtml(markdown);
    htmlContent = htmlContent.replace(
      /<pre><code class="language-([^"]*)">([\s\S]*?)<\/code><\/pre>/g,
      (_, lang, code) => `
        <div class="code-block my-3 rounded-md overflow-hidden border border-subtle bg-surface" data-language="${lang}">
          <div class="code-block-header flex justify-between items-center px-3 py-1.5 bg-hover border-b border-subtle text-xs text-secondary">
            <span class="code-lang-badge font-mono">${lang || 'python'}</span>
            <button type="button" class="btn btn-ghost btn-compact code-block-copy text-xs" aria-label="Copy code">Copy</button>
          </div>
          <pre class="p-3 m-0 overflow-x-auto"><code class="language-${lang} font-mono text-sm">${code}</code></pre>
        </div>
      `
    );

    const titleHeading = hasAuthoredH1
      ? ''
      : `<h1 id="step-title" class="step-title text-2xl font-bold mb-3">${opts.stepTitle}</h1>`;

    stepViewHtml = `
      <article class="theory-step-content" role="article" aria-label="${opts.stepTitle}">
        <header class="step-header mb-4">
          <div class="step-ordinal text-secondary text-sm">${opts.stepOrdinalText || 'Reading'}</div>
          ${titleHeading}
        </header>

        <div class="rendered-markdown-content rich-text-body mt-2">
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
        <header class="step-header mb-4">
          <div class="step-ordinal text-secondary text-sm">${opts.stepOrdinalText || 'Video Step'}</div>
          <h1 id="step-title" class="step-title text-2xl font-bold mb-3">${opts.stepTitle}</h1>
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
        <header class="step-header mb-4">
          <div class="step-ordinal text-secondary text-sm">${opts.stepOrdinalText || 'Quiz Checkpoint'}</div>
          <h1 id="step-title" class="step-title text-2xl font-bold mb-3">${opts.stepTitle}</h1>
        </header>

        <div class="quiz-question-box card p-4 mt-4">
          <p class="quiz-prompt font-semibold text-lg">${prompt}</p>

          <fieldset class="quiz-choices-fieldset mt-4">
            <legend class="visually-hidden">Answer choices</legend>
            <div class="quiz-options-list">
              ${options
                .map(
                  (opt: any, idx: number) => `
                  <label class="quiz-option-choice card p-3 mb-2 flex items-center gap-2 cursor-pointer" for="opt-${opt.id}">
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

          <div class="quiz-action-bar mt-4 flex items-center gap-3">
            <button type="button" class="btn btn-secondary btn-compact" data-action="submit-preview-quiz" id="preview-quiz-submit-btn">Preview selection</button>
            <span class="text-xs text-muted">Interaction preview only — grading disabled</span>
          </div>
          <div id="preview-quiz-feedback" class="quiz-feedback-box mt-3 text-xs" aria-live="polite"></div>
        </div>
      </article>
    `;
  } else if (opts.stepType === 'python') {
    const problemStatement = opts.content?.problemStatement || '';
    const inputFormat = opts.content?.inputFormat || '';
    const outputFormat = opts.content?.outputFormat || '';
    const constraints = opts.content?.constraints || '';
    const starterCode = opts.content?.starterCode || '';
    const hints = opts.content?.hints || [];
    const publicTests = opts.content?.publicTests || [];
    const lineCount = (starterCode || '').split('\n').length;
    const lineNumbers = Array.from({ length: Math.max(lineCount, 15) }, (_, i) => i + 1).join('\n');

    stepViewHtml = `
      <div class="learning-workspace-paired-layout" style="display: contents;" role="region" aria-label="Python Exercise Workspace">
        <!-- Problem Pane -->
        <aside class="problem-pane p-4 overflow-y-auto" style="min-width: 0; border-right: 1px solid var(--border-subtle);" role="region" aria-label="Problem Instructions">
          <div class="step-ordinal text-secondary text-sm">${opts.stepOrdinalText || 'Python Exercise'}</div>
          <h1 class="problem-title text-xl font-bold mt-1">${opts.stepTitle}</h1>

          <div class="problem-section mt-4">
            <h2 class="section-title text-base font-semibold">Problem Statement</h2>
            <p class="text-secondary mt-1">${problemStatement}</p>
          </div>

          <div class="problem-section mt-3">
            <h2 class="section-title text-base font-semibold">Input &amp; Output</h2>
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
                        <pre>${escapeHtml(pt.stdin || '(empty)')}</pre>
                        <span class="text-secondary mt-1">Expected Output:</span>
                        <pre>${escapeHtml(pt.expectedStdout || '')}</pre>
                      </div>
                    `
                    )
                    .join('')}
                </div>
              `
              : ''
          }

          ${
            hints.length > 0
              ? `
                <div class="problem-section mt-4">
                  <h2 class="section-title text-base font-semibold">Hints</h2>
                  <div class="hints-container flex flex-col gap-2 mt-2">
                    ${hints.map((hint: string, hIdx: number) => `
                      <details class="hint-accordion card p-2 text-xs">
                        <summary class="cursor-pointer font-medium text-secondary">Hint ${hIdx + 1}</summary>
                        <p class="mt-1 text-primary">${escapeHtml(hint)}</p>
                      </details>
                    `).join('')}
                  </div>
                </div>
              `
              : ''
          }
        </aside>

        <div class="workspace-splitter" aria-hidden="true"></div>
        <!-- Editor Pane -->
        <div class="editor-pane flex-1 flex flex-col" style="min-width: 0;">
          <div class="editor-toolbar mb-2 flex justify-between items-center">
            <div class="flex items-center gap-2">
              <span class="editor-filename font-mono text-xs font-semibold">main.py</span>
              <span class="text-muted">·</span>
              <span class="text-secondary text-xs font-mono">${PYTHON_RUNTIME_LABEL}</span>
            </div>
            <div class="editor-actions flex items-center gap-2">
              <button type="button" class="btn btn-secondary btn-compact" id="preview-run-samples-btn" disabled title="Execution unavailable in preview" aria-disabled="true">Run samples</button>
              <button type="button" class="btn btn-primary btn-compact" id="preview-submit-btn" disabled title="Execution unavailable in preview" aria-disabled="true">Submit solution</button>

            </div>
          </div>
          <div class="code-editor-area flex flex-1 border border-subtle rounded-md overflow-hidden bg-surface">
            <div class="code-editor-line-numbers p-3 font-mono text-xs text-muted select-none border-r border-subtle bg-hover" style="white-space: pre; line-height: 1.5;">${lineNumbers}</div>
            <textarea class="code-editor-input textarea-input font-mono flex-1 p-3 text-xs leading-relaxed border-0 rounded-none bg-transparent" rows="18" aria-label="Python Solution Code" readonly>${starterCode}</textarea>
          </div>
          <div class="workspace-results-region p-3 bg-surface border-t border-subtle text-xs text-secondary font-mono" id="preview-run-results">
            <span class="text-muted">Preview notice:</span> Execution unavailable in preview.
          </div>
        </div>
      </div>
    `;
  }

  // Build real learner workspace sidebar & task strip data
  const courseModules: CourseModuleItem[] | undefined = opts.modules?.map((m: any, mIdx: number) => ({
    id: m.id,
    title: m.title.replace(/^Module\s+\d+\s*:\s*/i, ''),
    lessons: (m.lessons || []).map((l: any, lIdx: number) => ({
      id: l.id,
      title: l.title.replace(/^Lesson\s+\d+\s*:\s*/i, ''),
      completedCount: 0,
      totalCount: l.steps?.length || 0,
      isCurrent: l.steps?.some((s: any) => s.id === opts.stepId),
      href: `/teach/${encodeURIComponent(opts.courseId)}/preview?stepId=${encodeURIComponent(l.steps?.[0]?.id || '')}`,
    })),
  }));

  let currentLesson: any = null;
  if (opts.modules) {
    for (const m of opts.modules) {
      for (const l of m.lessons || []) {
        if (l.steps?.some((s: any) => s.id === opts.stepId)) {
          currentLesson = l;
          break;
        }
      }
      if (currentLesson) break;
    }
  }

  const lessonTitle = opts.lessonTitle || currentLesson?.title?.replace(/^Lesson\s+\d+\s*:\s*/i, '') || 'Lesson 1';

  const taskSquares: TaskSquareItem[] = currentLesson?.steps
    ? currentLesson.steps.map((st: any, idx: number) => ({
        id: st.id,
        ordinal: idx + 1,
        title: st.title,
        type: st.type,
        isCurrent: st.id === opts.stepId,
        isCompleted: false,
        href: `/teach/${encodeURIComponent(opts.courseId)}/preview?stepId=${encodeURIComponent(st.id)}`,
      }))
    : [
        {
          id: opts.stepId,
          ordinal: 1,
          title: hasAuthoredH1 ? (opts.stepOrdinalText || 'Step 1') : opts.stepTitle,
          type: opts.stepType,
          isCurrent: true,
          isCompleted: false,
          href: `/teach/${encodeURIComponent(opts.courseId)}/preview?stepId=${encodeURIComponent(opts.stepId)}`,
        },
      ];

  const allSteps = opts.modules?.flatMap((m: any) => (m.lessons || []).flatMap((l: any) => l.steps || [])) || [];
  const currentIndex = allSteps.findIndex((step: any) => step.id === opts.stepId);
  const previewUrl = (step: any) => step ? `/teach/${encodeURIComponent(opts.courseId)}/preview?stepId=${encodeURIComponent(step.id)}` : null;
  const previousStepUrl = opts.previousStepUrl ?? (currentIndex > 0 ? previewUrl(allSteps[currentIndex - 1]) : null);
  const nextStepUrl = opts.nextStepUrl ?? (currentIndex >= 0 ? previewUrl(allSteps[currentIndex + 1]) : null);

  const learnerShellHtml = renderLearningWorkspaceShell({
    courseTitle: opts.courseTitle,
    courseOverviewUrl: `/teach/${encodeURIComponent(opts.courseId)}/content`,
    lessonTitle,
    stepTitle: hasAuthoredH1 ? (opts.stepOrdinalText || 'Step 1') : opts.stepTitle,
    stepOrdinalText: opts.stepOrdinalText || 'Step 1',
    courseProgressText: 'Preview mode (read-only)',
    courseProgressPercentage: 0,
    modules: courseModules,
    taskSquares,
    isPythonWorkspace: opts.stepType === 'python',
    workspaceContent: stepViewHtml,
    previousStepUrl,
    nextStepUrl,
    taskActions: opts.stepType === 'python'
      ? `<span class="text-xs text-muted">Read-only preview</span>`
      : undefined,
  });

  return `
    <style id="author-preview-styles">${authorStyles}</style>
    <div class="shell-student-preview">
      ${previewBanner}
      ${learnerShellHtml}
    </div>
  `;
}

export function initAuthorPreviewInteractions(container?: HTMLElement | Document | null): void {
  const root = container || (typeof document !== 'undefined' ? document : null);
  if (!root) return;

  const sidebar = root.querySelector('.learning-course-sidebar');
  const sidebarButtons = root.querySelectorAll<HTMLButtonElement>('.outline-toggle-btn, .sidebar-collapse-toggle');
  sidebarButtons.forEach(btn => btn.addEventListener('click', () => {
    const collapsed = sidebar?.classList.toggle('collapsed') || false;
    if (sidebar instanceof HTMLElement) sidebar.inert = collapsed;
    sidebarButtons.forEach(button => {
      button.setAttribute('aria-expanded', String(!collapsed));
      button.setAttribute('aria-label', collapsed ? 'Show modules' : 'Hide modules');
      button.setAttribute('title', collapsed ? 'Show modules' : 'Hide modules');
    });
  }));

  const quizBtn = root.querySelector('[data-action="submit-preview-quiz"]');
  quizBtn?.addEventListener('click', (event) => {
    const btn = event.currentTarget as HTMLElement;
    const box = btn.closest('.quiz-question-box');
    const checked = box?.querySelector<HTMLInputElement>('input[name="quiz_choice"]:checked');
    let fb = root.querySelector('#preview-quiz-feedback') as HTMLElement | null;
    if (!fb) {
      fb = document.createElement('div');
      fb.id = 'preview-quiz-feedback';
      fb.className = 'quiz-feedback-box mt-3 p-2 bg-surface border border-subtle rounded text-xs';
      box?.appendChild(fb);
    }
    if (checked) {
      const label = checked.closest('label')?.querySelector('.option-text')?.textContent?.trim() || checked.value;
      fb.className = 'quiz-feedback-box mt-3 p-2 bg-surface border border-subtle rounded text-xs text-secondary';
      fb.textContent = `Interaction preview: choice ${label} selected (preview mode: no correctness check or progress recorded).`;
    } else {
      fb.className = 'quiz-feedback-box mt-3 p-2 bg-surface border border-subtle rounded text-xs text-warning';
      fb.textContent = 'Interaction preview: select an option above to preview selection state.';
    }
  });

  root.querySelectorAll<HTMLButtonElement>('.code-block-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.closest('.code-block')?.querySelector('code')?.innerText || '';
      const orig = btn.textContent;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(code);
        btn.textContent = 'Copied!';
      } catch {
        btn.textContent = 'Copy failed';
      }
      setTimeout(() => {
        btn.textContent = orig;
      }, 2000);
    });
  });
}
