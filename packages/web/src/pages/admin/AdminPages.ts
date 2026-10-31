import { renderAdminShell } from '../../components/shells/AdminShell.ts';
import { renderAdminOverviewContent } from './AdminOverviewPage.ts';
import { renderAdminUsersContent, renderAdminUserDetailContent } from './AdminUsersPage.ts';
import { renderAdminCoursesContent, renderAdminCourseDetailContent } from './AdminCoursesPage.ts';
import { renderAdminCategoriesContent } from './AdminCategoriesPage.ts';
import { renderAdminReportsContent, renderAdminReportDetailContent } from './AdminReportsPage.ts';
import { renderAdminMediaContent } from './AdminMediaPage.ts';
import { renderAdminExecutionContent } from './AdminExecutionPage.ts';
import { renderAdminAuditContent, renderAdminAuditDetailContent } from './AdminAuditPage.ts';

import { escapeAdmin } from './admin-page-helpers.ts';
export { escapeAdmin, renderActionDialog } from './admin-page-helpers.ts';
export type { ActionDialogOptions, TableCol } from './admin-page-helpers.ts';

export function renderAdminPageContent(
  path: string,
  data: any,
  error?: string,
  adminUser?: { displayName: string; email: string; capabilities?: ('student' | 'author' | 'admin')[] }
): { title: string; content: string } {
  const route = path.split('?')[0];
  const title =
    route === '/admin'
      ? 'Platform status'
      : route.startsWith('/admin/users')
      ? 'Users'
      : route.startsWith('/admin/courses')
      ? 'Courses'
      : route.startsWith('/admin/categories')
      ? 'Categories'
      : route.startsWith('/admin/reports')
      ? 'Reports'
      : route.startsWith('/admin/media')
      ? 'Media'
      : route.startsWith('/admin/execution')
      ? 'Execution'
      : 'Audit';

  const err = error
    ? `<div class="alert alert-danger" role="alert">${escapeAdmin(error)} <button class="btn btn-secondary btn-compact" type="button" data-admin-retry>Retry</button></div>`
    : '';

  let content = `<section class="admin-page-content"><p class="text-secondary">Loading operational records…</p></section>`;

  if (data) {
    if (route === '/admin') {
      content = renderAdminOverviewContent(data);
    } else if (route === '/admin/users') {
      content = renderAdminUsersContent(path, data);
    } else if (route.startsWith('/admin/users/')) {
      content = renderAdminUserDetailContent(data);
    } else if (route === '/admin/courses') {
      content = renderAdminCoursesContent(path, data);
    } else if (route.startsWith('/admin/courses/')) {
      content = renderAdminCourseDetailContent(path, data);
    } else if (route === '/admin/categories') {
      content = renderAdminCategoriesContent(data);
    } else if (route === '/admin/reports') {
      content = renderAdminReportsContent(path, data);
    } else if (route.startsWith('/admin/reports/')) {
      content = renderAdminReportDetailContent(data);
    } else if (route === '/admin/media') {
      content = renderAdminMediaContent(path, data);
    } else if (route === '/admin/execution') {
      content = renderAdminExecutionContent(path, data);
    } else if (route === '/admin/audit') {
      content = renderAdminAuditContent(path, data);
    } else if (route.startsWith('/admin/audit/')) {
      content = renderAdminAuditDetailContent(data);
    }
  }

  return {
    title,
    content: `<div class="admin-page-content">${err}${content}</div>`,
  };
}

export function renderAdminPage(
  path: string,
  data: any,
  error?: string,
  adminUser: { displayName: string; email: string; capabilities?: ('student' | 'author' | 'admin')[] } = { displayName: 'Administrator', email: '' }
): string {
  const { title, content } = renderAdminPageContent(path, data, error, adminUser);
  return renderAdminShell({
    activePath: path.split('?')[0],
    adminUser,
    headerTitle: title,
    content,
  });
}
