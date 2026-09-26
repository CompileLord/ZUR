import { renderLearningWorkspaceShell } from '../../components/shells/LearningWorkspaceShell.ts';
import { escapeHtml } from '../../components/escape-html.ts';

export interface QuizOptionItem {
  id: string;
  text: string;
}

export interface QuizStepPageOptions {
  courseTitle: string;
  courseOverviewUrl: string;
  lessonTitle: string;
  stepTitle: string;
  stepOrdinalText: string;
  isRequired: boolean;
  estimatedDurationMinutes: number;
  quizType: 'single_choice' | 'multiple_choice';
  prompt: string;
  options: QuizOptionItem[];
  enrollmentId: string;
  stepId: string;
  isCompleted: boolean;
  selectedOptionIds?: string[];
  feedback?: {
    isPassed: boolean;
    verdict: string;
    explanation?: string;
    correctOptionIds?: string[];
  } | null;
  outlineContent?: string;
  previousStepUrl?: string | null;
  nextStepUrl?: string | null;
}

export function renderQuizStepPage(opts: QuizStepPageOptions): string {
  const isMultiple = opts.quizType === 'multiple_choice';
  const inputType = isMultiple ? 'checkbox' : 'radio';
  const selectedSet = new Set(opts.selectedOptionIds || []);
  const correctSet = new Set(opts.feedback?.correctOptionIds || []);
  const isEvaluated = Boolean(opts.feedback);
  const isPassed = opts.feedback?.isPassed ?? opts.isCompleted;

  let feedbackPanelHtml = '';
  if (isEvaluated) {
    if (opts.feedback?.isPassed) {
      feedbackPanelHtml = `
        <div class="quiz-feedback-strip success" role="alert">
          <div class="feedback-header">
            <span class="status-badge success">Correct</span>
            <span class="feedback-title">All answers correct!</span>
          </div>
          ${
            opts.feedback.explanation
              ? `<div class="feedback-explanation"><p>${escapeHtml(opts.feedback.explanation)}</p></div>`
              : ''
          }
        </div>
      `;
    } else {
      feedbackPanelHtml = `
        <div class="quiz-feedback-strip failure" role="alert">
          <div class="feedback-header">
            <span class="status-badge danger">Incorrect</span>
            <span class="feedback-title">That answer isn't correct yet. Try again.</span>
          </div>
        </div>
      `;
    }
  }

  let practiceBannerHtml = '';
  if (opts.isCompleted && !isEvaluated) {
    practiceBannerHtml = `
      <div class="practice-notice" role="note">
        <span>Step completed ✓ — You can practice without affecting your completed status.</span>
      </div>
    `;
  }

  const workspaceContent = `
    <article class="quiz-step-content" role="region" aria-label="Quiz Assessment">
      <div class="reading-meta-bar">
        <span class="step-ordinal">${opts.stepOrdinalText}</span>
        <span>·</span>
        <span>Quiz assessment</span>
        <span>·</span>
        <span>${opts.isRequired ? 'Required' : 'Optional'}</span>
        <span>·</span>
        <span>~${opts.estimatedDurationMinutes}m</span>
      </div>

      <h1 class="quiz-title">${escapeHtml(opts.stepTitle)}</h1>

      ${practiceBannerHtml}

      <div class="quiz-prompt-block">
        <p class="quiz-prompt-text">${escapeHtml(opts.prompt)}</p>
        ${
          isMultiple
            ? '<span class="multi-select-hint">Select all correct answers</span>'
            : ''
        }
      </div>

      <form
        method="POST"
        action="/api/steps/${encodeURIComponent(opts.stepId)}/quiz/submit"
        class="quiz-form"
        data-enrollment-id="${escapeHtml(opts.enrollmentId)}"
      >
        <input type="hidden" name="enrollmentId" value="${escapeHtml(opts.enrollmentId)}" />
        <div class="quiz-options-group" role="group" aria-label="Answer options">
          ${opts.options.map((opt, idx) => {
            const isSelected = selectedSet.has(opt.id);
            const isCorrect = correctSet.has(opt.id);

            let optionClass = 'quiz-option-row';
            if (isSelected) optionClass += ' selected';
            if (isEvaluated && opts.feedback?.isPassed && isCorrect) optionClass += ' correct';

            return `
              <label class="${optionClass}">
                <input
                  type="${inputType}"
                  name="selectedOptionIds"
                  value="${escapeHtml(opt.id)}"
                  ${isSelected ? 'checked' : ''}
                  class="quiz-input-control"
                />
                <span class="option-indicator" aria-hidden="true"></span>
                <span class="option-text">${escapeHtml(opt.text)}</span>
              </label>
            `;
          }).join('')}
        </div>

        ${feedbackPanelHtml}

        <footer class="step-navigation-footer">
          <div class="footer-left">
            ${
              opts.previousStepUrl
                ? `<a href="${opts.previousStepUrl}" class="btn btn-secondary btn-compact">Previous</a>`
                : ''
            }
          </div>

          <div class="footer-center">
            <a href="/help" class="report-issue-link">
              Report issue
            </a>
          </div>

          <div class="footer-right">
            ${
              isPassed && opts.nextStepUrl
                ? `<a href="${opts.nextStepUrl}" class="btn btn-primary btn-compact">Next step →</a>`
                : isPassed && opts.courseOverviewUrl
                ? `<a href="${opts.courseOverviewUrl}" class="btn btn-secondary btn-compact">Course overview</a>`
                : ''
            }
            <button
              type="submit"
              class="btn btn-primary check-answer-btn"
            >
              ${isPassed ? 'Check again' : 'Check answer'}
            </button>
          </div>
        </footer>
      </form>
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
