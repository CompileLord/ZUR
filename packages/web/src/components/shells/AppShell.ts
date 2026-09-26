import { escapeHtml } from '../escape-html.ts';

export interface AppShellOptions {
  activePath: string;
  user: {
    displayName: string;
    email: string;
    capabilities: ('student' | 'author' | 'admin')[];
  };
  currentMode?: 'learn' | 'teach';
  headerTitle: string;
  headerActions?: string;
  content: string;
}

export function renderAppShell(opts: AppShellOptions): string {
  const isAuthor = opts.user.capabilities.includes('author');
  const isAdmin = opts.user.capabilities.includes('admin');
  const mode = opts.currentMode || 'learn';

  let navItemsHtml = '';
  if (mode === 'learn') {
    navItemsHtml = `
      <a href="/learn" class="app-nav-item ${opts.activePath === '/learn' ? 'active' : ''}">
        <span class="nav-indicator"></span>
        <span class="nav-label">Continue</span>
      </a>
      <a href="/learn/courses" class="app-nav-item ${opts.activePath === '/learn/courses' ? 'active' : ''}">
        <span class="nav-indicator"></span>
        <span class="nav-label">My courses</span>
      </a>
      <a href="/courses" class="app-nav-item ${opts.activePath === '/courses' ? 'active' : ''}">
        <span class="nav-indicator"></span>
        <span class="nav-label">Explore</span>
      </a>
    `;
  } else {
    // Teach mode
    navItemsHtml = `
      <a href="/teach" class="app-nav-item ${opts.activePath === '/teach' ? 'active' : ''}">
        <span class="nav-indicator"></span>
        <span class="nav-label">Your courses</span>
      </a>
      <a href="/settings/ai-connections" class="app-nav-item ${opts.activePath === '/settings/ai-connections' ? 'active' : ''}">
        <span class="nav-indicator"></span>
        <span class="nav-label">AI connections</span>
      </a>
    `;
  }

  const modeSwitchHtml = isAuthor
    ? `
      <div class="mode-switch-container">
        <label class="mode-switch-label">Mode</label>
        <div class="mode-switch" role="radiogroup" aria-label="Application Mode">
          <a href="/learn" class="mode-btn ${mode === 'learn' ? 'active' : ''}" role="radio" aria-checked="${mode === 'learn'}">Learn</a>
          <a href="/teach" class="mode-btn ${mode === 'teach' ? 'active' : ''}" role="radio" aria-checked="${mode === 'teach'}">Teach</a>
        </div>
      </div>
    `
    : '';

  const adminLinkHtml = isAdmin
    ? `<a href="/admin" class="app-nav-item admin-nav-link ${opts.activePath.startsWith('/admin') ? 'active' : ''}">
        <span class="nav-indicator"></span>
        <span class="nav-label">Administration</span>
       </a>`
    : '';

  return `
    <div class="shell-app">
      <aside class="app-sidebar" role="navigation" aria-label="Application Navigation">
        <div class="sidebar-header">
          <a href="/" class="wordmark" aria-label="ZUR Home">
            <span class="wordmark-citron"></span>
            <span class="wordmark-text">ZUR</span>
          </a>
        </div>

        ${modeSwitchHtml}

        <nav class="sidebar-nav">
          ${navItemsHtml}
          ${adminLinkHtml}
        </nav>

        <div class="sidebar-footer">
          <a href="/help" class="app-nav-item secondary-nav-link">
            <span class="nav-label">Help</span>
          </a>
          <div class="user-account-menu" role="region" aria-label="Account Menu">
            <span class="user-display-name">${escapeHtml(opts.user.displayName)}</span>
            <div class="user-menu-links">
              <a href="/settings/profile" class="user-menu-link">Settings</a>
              <a href="/sign-out" class="user-menu-link text-danger">Sign out</a>
            </div>
          </div>
        </div>
      </aside>

      <div class="app-main-area">
        <header class="app-location-header" role="banner">
          <h1 class="location-title">${escapeHtml(opts.headerTitle)}</h1>
          <div class="location-actions">
            ${opts.headerActions || ''}
          </div>
        </header>

        <main id="main-content" class="app-content-body" role="main">
          ${opts.content}
        </main>
      </div>
    </div>
  `;
}
