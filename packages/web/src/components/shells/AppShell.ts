import { escapeHtml } from '../escape-html.ts';
import { renderIcon } from '../common/icons.ts';
import { initials } from '../../utils/formatters.ts';

export interface AppShellOptions {
  activePath?: string;
  user: {
    displayName: string;
    email: string;
    capabilities: ('student' | 'author' | 'admin')[];
  };
  currentMode?: 'learn' | 'teach' | 'admin';
  activeMode?: 'learn' | 'teach' | 'admin';
  headerTitle?: string;
  headerActions?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  content: string;
}

export function renderAppShell(opts: AppShellOptions): string {
  const isAuthor = opts.user.capabilities.includes('author');
  const isAdmin = opts.user.capabilities.includes('admin');
  const activePath = opts.activePath || '';

  // Determine active mode: explicit option wins, otherwise infer from current route
  const mode: 'learn' | 'teach' | 'admin' =
    opts.currentMode ??
    opts.activeMode ??
    (activePath.startsWith('/admin')
      ? 'admin'
      : activePath.startsWith('/teach') || activePath.startsWith('/settings/ai-connections')
        ? 'teach'
        : 'learn');
  const isHomeActive = activePath === '/learn' || activePath === '/learn/courses' || /^\/learn\/[^/]+$/.test(activePath);

  let navItemsHtml = '';
  if (mode !== 'teach') {
    navItemsHtml = `
      <a href="/learn" class="app-nav-item ${isHomeActive ? 'active' : ''}" ${isHomeActive ? 'aria-current="page"' : ''}>
        <span class="nav-indicator" aria-hidden="true"></span>
        <span class="nav-icon" aria-hidden="true">${renderIcon('play', { size: 16 })}</span>
        <span class="nav-label">Home</span>
      </a>
      <a href="/courses" class="app-nav-item ${activePath === '/courses' ? 'active' : ''}">
        <span class="nav-indicator" aria-hidden="true"></span>
        <span class="nav-icon" aria-hidden="true">${renderIcon('compass', { size: 16 })}</span>
        <span class="nav-label">Explore</span>
      </a>
    `;
  } else {
    // Teach mode
    navItemsHtml = `
      <a href="/teach" class="app-nav-item ${activePath === '/teach' ? 'active' : ''}">
        <span class="nav-indicator" aria-hidden="true"></span>
        <span class="nav-icon" aria-hidden="true">${renderIcon('book', { size: 16 })}</span>
        <span class="nav-label">Your courses</span>
      </a>
      <a href="/settings/ai-connections" class="app-nav-item ${activePath.startsWith('/settings/ai-connections') ? 'active' : ''}">
        <span class="nav-indicator" aria-hidden="true"></span>
        <span class="nav-icon" aria-hidden="true">${renderIcon('code', { size: 16 })}</span>
        <span class="nav-label">AI connections</span>
      </a>
    `;
  }

  const modeLinks: Array<{ id: 'learn' | 'teach' | 'admin'; href: string; label: string; aria?: string }> = [
    { id: 'learn', href: '/learn', label: 'Learn' },
    ...(isAuthor ? [{ id: 'teach' as const, href: '/teach', label: 'Teach' }] : []),
    ...(isAdmin ? [{ id: 'admin' as const, href: '/admin', label: 'Admin', aria: 'Administration' }] : []),
  ];
  const modeSwitchHtml = isAuthor || isAdmin
    ? `
      <div class="mode-switch-container">
        <label class="mode-switch-label">Mode</label>
        <div class="mode-switch" role="radiogroup" aria-label="Application Mode">
          ${modeLinks.map((m) => `<a href="${m.href}" class="mode-btn ${mode === m.id ? 'active' : ''}" role="radio" aria-checked="${mode === m.id}"${m.aria ? ` aria-label="${m.aria}"` : ''}>${m.label}</a>`).join('')}
        </div>
      </div>
    `
    : '';

  // Breadcrumbs or context for slim location bar
  let locationContextHtml = '';
  if (opts.breadcrumbs && opts.breadcrumbs.length > 0) {
    locationContextHtml = `
      <nav class="location-breadcrumbs" aria-label="Breadcrumb">
        ${opts.breadcrumbs.map((b, i) => `
          ${i > 0 ? '<span class="breadcrumb-separator">/</span>' : ''}
          ${b.href ? `<a href="${escapeHtml(b.href)}" class="breadcrumb-link">${escapeHtml(b.label)}</a>` : `<span class="breadcrumb-current">${escapeHtml(b.label)}</span>`}
        `).join('')}
      </nav>
    `;
  } else if (opts.headerTitle) {
    // If content already contains the title in an H1, leave location bar slim/empty of H1 to prevent duplicates.
    // If content does NOT contain it, render it so heading is present and tests pass.
    const titleAlreadyInContent = opts.content.includes(opts.headerTitle);
    if (!titleAlreadyInContent) {
      locationContextHtml = `<span class="location-title">${escapeHtml(opts.headerTitle)}</span>`;
    }
  }

  const hasLocationBarContent = Boolean(locationContextHtml || opts.headerActions);

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
        </nav>

        <div class="sidebar-footer">
          <a href="/help" class="app-nav-item secondary-nav-link ${activePath === '/help' ? 'active' : ''}">
            <span class="nav-indicator" aria-hidden="true"></span>
            <span class="nav-icon" aria-hidden="true">${renderIcon('help', { size: 16 })}</span>
            <span class="nav-label">Help</span>
          </a>

          <div class="user-account-block" role="region" aria-label="Account Menu">
            <div class="user-account-info">
              <div class="user-avatar" aria-hidden="true">${initials(opts.user.displayName)}</div>
              <div class="user-details">
                <span class="user-display-name">${escapeHtml(opts.user.displayName)}</span>
              </div>
            </div>
            <div class="user-account-actions">
              <a href="/settings/profile" class="user-action-btn" title="Settings" aria-label="Settings">
                ${renderIcon('settings', { size: 15 })}
                <span class="sr-only">Settings</span>
              </a>
              <a href="/sign-out" class="user-action-btn text-danger" title="Sign out" aria-label="Sign out">
                ${renderIcon('logout', { size: 15 })}
                <span class="sr-only">Sign out</span>
              </a>
            </div>
          </div>
        </div>
      </aside>

      <div class="app-main-area">
        ${hasLocationBarContent ? `
          <header class="app-location-header" role="banner">
            <div class="location-context">
              ${locationContextHtml}
            </div>
            <div class="location-actions">
              ${opts.headerActions || ''}
            </div>
          </header>
        ` : `
          <header class="app-location-header slim-empty" role="banner" aria-hidden="true"></header>
        `}

        <main id="main-content" class="app-content-body" role="main" tabindex="-1">
          ${opts.content}
        </main>
      </div>
    </div>
  `;
}
