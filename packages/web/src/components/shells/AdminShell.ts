import { escapeHtml } from '../escape-html.ts';
import { renderIcon, type IconName } from '../common/icons.ts';
import { initials } from '../../utils/formatters.ts';
import { adminStyles } from '../../pages/admin/admin-styles.ts';

export interface AdminShellOptions {
  activePath: string;
  adminUser: { displayName: string; email: string; capabilities?: ('student' | 'author' | 'admin')[] };
  headerTitle: string;
  content: string;
}

export function renderAdminShell(opts: AdminShellOptions): string {
  const navItems: Array<{ label: string; path: string; icon: IconName }> = [
    { label: 'Overview', path: '/admin', icon: 'activity' },
    { label: 'Users', path: '/admin/users', icon: 'users' },
    { label: 'Courses', path: '/admin/courses', icon: 'book' },
    { label: 'Categories', path: '/admin/categories', icon: 'folder' },
    { label: 'Reports', path: '/admin/reports', icon: 'alert-triangle' },
    { label: 'Media', path: '/admin/media', icon: 'image' },
    { label: 'Execution', path: '/admin/execution', icon: 'cpu' },
    { label: 'Audit', path: '/admin/audit', icon: 'history' },
  ];

  const navHtml = navItems
    .map((item) => {
      const isActive =
        item.path === '/admin'
          ? opts.activePath === '/admin'
          : opts.activePath === item.path ||
            opts.activePath.startsWith(`${item.path}/`) ||
            opts.activePath.startsWith(`${item.path}?`);
      return `
      <a href="${item.path}" class="admin-nav-item ${isActive ? 'active' : ''}" ${isActive ? 'aria-current="page"' : ''}>
        <span class="nav-indicator" aria-hidden="true"></span>
        <span class="nav-icon" aria-hidden="true">${renderIcon(item.icon, { size: 16 })}</span>
        <span class="nav-label">${item.label}</span>
      </a>
    `;
    })
    .join('');

  const canTeach = Boolean(opts.adminUser.capabilities?.includes('author'));
  const modeLinks: Array<{ id: string; href: string; label: string; aria?: string }> = [
    { id: 'learn', href: '/learn', label: 'Learn' },
    ...(canTeach ? [{ id: 'teach', href: '/teach', label: 'Teach' }] : []),
    { id: 'admin', href: '/admin', label: 'Admin', aria: 'Administration' },
  ];
  const modeSwitchHtml = `
        <div class="mode-switch-container">
          <label class="mode-switch-label">Mode</label>
          <div class="mode-switch" role="radiogroup" aria-label="Application Mode">
            ${modeLinks.map((m) => `<a href="${m.href}" class="mode-btn ${m.id === 'admin' ? 'active' : ''}" role="radio" aria-checked="${m.id === 'admin'}"${m.aria ? ` aria-label="${m.aria}"` : ''}>${m.label}</a>`).join('')}
          </div>
        </div>`;

  return `
    <style id="admin-styles">${adminStyles}</style>
    <div class="shell-admin">
      <aside class="admin-sidebar" role="navigation" aria-label="Administration Navigation">
        <div class="admin-sidebar-header">
          <a href="/" class="wordmark" aria-label="ZUR Home">
            <span class="wordmark-citron"></span>
            <span class="wordmark-text">ZUR</span>
          </a>
          <span class="admin-quiet-badge" title="Administration">Admin<span class="sr-only">istration</span></span>
        </div>

        ${modeSwitchHtml}

        <nav class="admin-nav-list" aria-label="Administrative areas">
          ${navHtml}
        </nav>

        <div class="admin-sidebar-footer">
          <div class="admin-account-block" role="region" aria-label="Administrator Account">
            <div class="admin-account-info">
              <div class="user-avatar" aria-hidden="true">${initials(opts.adminUser.displayName)}</div>
              <div class="admin-account-details">
                <span class="admin-account-name">${escapeHtml(opts.adminUser.displayName)}</span>
                <span class="admin-account-role">Acting Admin</span>
              </div>
            </div>
          </div>
          <a href="/learn" class="admin-return-link" aria-label="Return to app">
            ${renderIcon('arrow-left', { size: 14 })}
            <span>Return to app</span>
          </a>
        </div>
      </aside>

      <div class="admin-main-area">
        <header class="admin-location-header" role="banner">
          <nav class="admin-location-context" aria-label="Breadcrumb">
            <span class="admin-location-quiet">Admin</span>
            <span class="admin-location-sep" aria-hidden="true">/</span>
            <span class="admin-location-current" aria-current="location">${escapeHtml(opts.headerTitle)}</span>
          </nav>
        </header>

        <main id="main-content" class="admin-main admin-content-body" role="main">
          ${opts.content}
        </main>
      </div>
    </div>
  `;
}
