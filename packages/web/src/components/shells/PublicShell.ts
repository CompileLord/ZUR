import { renderIcon } from '../common/icons.ts';

export interface PublicShellOptions {
  activePath?: string;
  user?: { displayName: string; email: string } | null;
  content: string;
}

export function renderPublicShell(opts: PublicShellOptions): string {
  const isSignedIn = Boolean(opts.user);
  const primaryAuthAction = isSignedIn
    ? `<a href="/learn" class="btn btn-primary btn-compact">Continue learning</a>`
    : `<a href="/sign-in" class="btn btn-secondary btn-compact">Sign in</a>`;

  return `
    <div class="shell-public">
      <header class="public-header" role="banner">
        <div class="container-landing header-inner">
          <div class="header-left">
            <a href="/" class="wordmark" aria-label="ZUR Home">
              <span class="wordmark-citron"></span>
              <span class="wordmark-text">ZUR</span>
            </a>
            <nav class="public-nav" aria-label="Main Navigation">
              <a href="/courses" class="nav-link ${opts.activePath === '/courses' ? 'active' : ''}">Courses</a>
              <a href="/#teaching" class="nav-link">For teachers</a>
              <a href="/help" class="nav-link ${opts.activePath === '/help' ? 'active' : ''}">Help</a>
            </nav>
          </div>
          <div class="header-right">
            ${primaryAuthAction}
          </div>
        </div>
      </header>

      <main id="main-content" class="public-main" role="main">
        ${opts.content}
      </main>

      <footer class="public-footer" role="contentinfo">
        <div class="container-landing footer-inner">
          <div class="footer-links">
            <a href="/help" class="${opts.activePath === '/help' ? 'active' : ''}">Help</a>
            <a href="/privacy" class="${opts.activePath === '/privacy' ? 'active' : ''}">Privacy</a>
            <a href="/terms" class="${opts.activePath === '/terms' ? 'active' : ''}">Terms</a>
          </div>
          <div class="footer-theme-selector" role="group" aria-label="Theme preference">
            <span class="footer-theme-label text-xs text-muted" id="footer-theme-heading">Theme</span>
            <div class="theme-segmented-control" role="radiogroup" aria-labelledby="footer-theme-heading">
              <button
                type="button"
                class="theme-segment-btn"
                data-theme-value="light"
                role="radio"
                aria-checked="false"
                aria-label="Light theme"
                title="Light theme"
              >
                ${renderIcon('sun', { size: 14 })}
                <span class="theme-segment-text">Light</span>
              </button>
              <button
                type="button"
                class="theme-segment-btn"
                data-theme-value="dark"
                role="radio"
                aria-checked="false"
                aria-label="Dark theme"
                title="Dark theme"
              >
                ${renderIcon('moon', { size: 14 })}
                <span class="theme-segment-text">Dark</span>
              </button>
              <button
                type="button"
                class="theme-segment-btn"
                data-theme-value="system"
                role="radio"
                aria-checked="false"
                aria-label="System theme"
                title="System theme"
              >
                ${renderIcon('monitor', { size: 14 })}
                <span class="theme-segment-text">System</span>
              </button>
            </div>
            <select id="theme-select" class="sr-only" aria-hidden="true" tabindex="-1">
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
      </footer>
    </div>
  `;
}
