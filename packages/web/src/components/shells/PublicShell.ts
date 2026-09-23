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
            <a href="/help">Help</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
          <div class="footer-theme-selector">
            <label for="theme-select" class="form-hint">Theme</label>
            <select id="theme-select" class="theme-select form-input" aria-label="Theme preference">
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
