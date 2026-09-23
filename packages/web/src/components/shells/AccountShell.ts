export interface AccountShellOptions {
  title: string;
  subtitle?: string;
  formContent: string;
  bottomLinks?: Array<{ text: string; href: string }>;
}

export function renderAccountShell(opts: AccountShellOptions): string {
  const bottomLinksHtml = (opts.bottomLinks || [
    { text: 'Help', href: '/help' },
    { text: 'Privacy', href: '/privacy' },
    { text: 'Terms', href: '/terms' },
  ])
    .map((l) => `<a href="${l.href}" class="account-link">${l.text}</a>`)
    .join(' · ');

  return `
    <div class="shell-account">
      <div class="account-container">
        <div class="account-header">
          <a href="/" class="wordmark" aria-label="ZUR Home">
            <span class="wordmark-citron"></span>
            <span class="wordmark-text">ZUR</span>
          </a>
        </div>

        <div class="account-card" role="region" aria-label="${opts.title}">
          <h1 class="account-title">${opts.title}</h1>
          ${opts.subtitle ? `<p class="account-subtitle">${opts.subtitle}</p>` : ''}
          <div class="account-form-body">
            ${opts.formContent}
          </div>
        </div>

        <div class="account-footer">
          ${bottomLinksHtml}
        </div>
      </div>
    </div>
  `;
}
