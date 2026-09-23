export interface ToastProps {
  id: string;
  message: string;
  type?: 'success' | 'warning' | 'info' | 'danger';
}

export function renderToast(props: ToastProps): string {
  const type = props.type || 'success';
  const iconMap = {
    success: '✓',
    warning: '⚠',
    danger: '✕',
    info: 'ℹ',
  };

  return `
    <div id="${props.id}" class="toast toast-${type}" role="status" aria-live="polite">
      <span class="toast-icon" aria-hidden="true">${iconMap[type]}</span>
      <span class="toast-message">${props.message}</span>
    </div>
  `;
}

export interface ErrorPanelProps {
  title: string;
  message: string;
  whatRemainsSaved?: string;
  nextActionText?: string;
  nextActionHref?: string;
  supportReference?: string;
}

export function renderErrorPanel(props: ErrorPanelProps): string {
  return `
    <div class="error-panel" role="alert">
      <h3 class="error-panel-title">${props.title}</h3>
      <p class="error-panel-body">${props.message}</p>
      ${props.whatRemainsSaved ? `
        <p class="error-panel-saved text-muted"><strong>Preserved:</strong> ${props.whatRemainsSaved}</p>
      ` : ''}
      <div class="error-panel-actions mt-3">
        ${props.nextActionText && props.nextActionHref ? `
          <a href="${props.nextActionHref}" class="btn btn-secondary btn-compact">${props.nextActionText}</a>
        ` : ''}
        ${props.supportReference ? `
          <span class="support-ref text-muted text-sm ml-3">Reference: <code>${props.supportReference}</code></span>
        ` : ''}
      </div>
    </div>
  `;
}

export interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

export function renderCodeBlock(props: CodeBlockProps): string {
  return `
    <div class="code-block" data-language="${props.language || 'python'}">
      <button type="button" class="btn btn-ghost btn-compact code-block-copy" aria-label="Copy code to clipboard">
        Copy
      </button>
      <pre><code>${escapeHtml(props.code)}</code></pre>
    </div>
  `;
}

export interface ReportFormProps {
  courseId: string;
  versionNumber?: number;
  stepId?: string;
  stepTitle?: string;
}

export function renderReportForm(props: ReportFormProps): string {
  return `
    <form class="report-form" action="/api/reports" method="POST">
      <input type="hidden" name="courseId" value="${props.courseId}">
      ${props.versionNumber ? `<input type="hidden" name="versionNumber" value="${props.versionNumber}">` : ''}
      ${props.stepId ? `<input type="hidden" name="stepId" value="${props.stepId}">` : ''}

      <div class="form-group">
        <label for="report-type" class="form-label">Issue Type</label>
        <select id="report-type" name="type" class="form-input" required>
          <option value="broken_exercise">Broken exercise or test case</option>
          <option value="inappropriate_content">Inappropriate course content</option>
          <option value="other">Other issue</option>
        </select>
      </div>

      <div class="form-group">
        <label for="report-desc" class="form-label">Description</label>
        <textarea id="report-desc" name="description" class="form-input" rows="4" placeholder="Briefly describe what happened..." required></textarea>
      </div>

      <div class="form-group">
        <label class="form-label flex items-center gap-2">
          <input type="checkbox" name="includeCode" value="true" checked>
          <span>Include my current editor code with this report</span>
        </label>
      </div>

      <div class="form-actions flex justify-end gap-3">
        <button type="submit" class="btn btn-primary">Send report</button>
      </div>
    </form>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
