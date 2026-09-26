export interface AdminShellOptions {
  activePath: string;
  adminUser: { displayName: string; email: string };
  headerTitle: string;
  content: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}

export function renderAdminShell(opts: AdminShellOptions): string {
  const navItems = [
    { label: 'Overview', path: '/admin' },
    { label: 'Users', path: '/admin/users' },
    { label: 'Courses', path: '/admin/courses' },
    { label: 'Categories', path: '/admin/categories' },
    { label: 'Reports', path: '/admin/reports' },
    { label: 'Media', path: '/admin/media' },
    { label: 'Execution', path: '/admin/execution' },
    { label: 'Audit', path: '/admin/audit' },
  ];

  const navHtml = navItems
    .map(
      (item) => `
      <a href="${item.path}" class="admin-nav-item ${opts.activePath === item.path || (item.path !== '/admin' && opts.activePath.startsWith(`${item.path}/`)) ? 'active' : ''}">
        <span class="nav-indicator"></span>
        <span class="nav-label">${item.label}</span>
      </a>
    `
    )
    .join('');

  return `
    <div class="shell-admin">
      <aside class="admin-sidebar" role="navigation" aria-label="Administration Navigation">
        <div class="admin-sidebar-header">
          <div class="admin-brand">
            <span class="wordmark-citron"></span>
            <span class="wordmark-text">ZUR</span>
          </div>
          <span class="admin-badge">Administration</span>
        </div>

        <nav class="admin-nav-list">
          ${navHtml}
        </nav>

        <div class="admin-sidebar-footer">
          <div class="admin-actor-card">
            <span class="admin-actor-label">Acting Admin</span>
            <span class="admin-actor-name">${escapeHtml(opts.adminUser.displayName)}</span>
          </div>
          <a href="/learn" class="admin-return-link">← Return to App</a>
        </div>
      </aside>

      <div class="admin-main-area">
        <header class="admin-location-header" role="banner">
          <h1 class="admin-title">${escapeHtml(opts.headerTitle)}</h1>
        </header>

        <main id="main-content" class="admin-content-body" role="main">
          ${opts.content}
        </main>
      </div>
    </div>
  `;
}
