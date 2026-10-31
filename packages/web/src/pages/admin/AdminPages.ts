import { renderAdminShell } from '../../components/shells/AdminShell.ts';
import { renderAdminOverviewContent } from './AdminOverviewPage.ts';
import { renderAdminUsersContent, renderAdminUserDetailContent } from './AdminUsersPage.ts';
import { renderAdminCoursesContent, renderAdminCourseDetailContent } from './AdminCoursesPage.ts';
import { renderAdminCategoriesContent } from './AdminCategoriesPage.ts';
import { renderAdminReportsContent, renderAdminReportDetailContent } from './AdminReportsPage.ts';
import { renderAdminMediaContent } from './AdminMediaPage.ts';
import { renderAdminExecutionContent } from './AdminExecutionPage.ts';
import { renderAdminAuditContent, renderAdminAuditDetailContent } from './AdminAuditPage.ts';

import { renderIcon } from '../../components/common/icons.ts';
import { escapeAdmin } from './admin-page-helpers.ts';
export { escapeAdmin, renderActionDialog } from './admin-page-helpers.ts';
export type { ActionDialogOptions, TableCol } from './admin-page-helpers.ts';

export interface AdminLoadError {
  message: string;
  status?: number;
}

const NOT_FOUND_SUBJECTS: [string, string, string][] = [
  ['/admin/users/', 'User', '/admin/users'],
  ['/admin/courses/', 'Course', '/admin/courses'],
  ['/admin/reports/', 'Report', '/admin/reports'],
  ['/admin/audit/', 'Audit event', '/admin/audit'],
];

function renderNotFound(route: string): string {
  const [, subject, listPath] = NOT_FOUND_SUBJECTS.find(([prefix]) => route.startsWith(prefix)) || ['', 'Page', '/admin'];
  const listName = subject === 'Page' ? 'platform status' : `${subject.toLowerCase()}s`;
  return `<section class="admin-page-content">
    <div class="admin-page-header"><h1 class="page-title">${subject} not found</h1></div>
    <p class="text-secondary">This ${subject.toLowerCase()} isn't available. The link may be out of date, or it may have been removed.</p>
    <p class="mt-4"><a href="${listPath}" class="btn btn-secondary btn-compact">Back to ${listName}</a></p>
  </section>`;
}

export function renderAdminPageContent(
  path: string,
  data: any,
  error?: string | AdminLoadError,
  adminUser?: { displayName: string; email: string; capabilities?: ('student' | 'author' | 'admin')[] },
  notice?: string
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

  const failure = typeof error === 'string' ? { message: error } : error;
  if (failure?.status === 404) {
    return { title, content: `<div class="admin-page-content">${renderNotFound(route)}</div>` };
  }
  const err = failure
    ? `<div class="admin-page-header"><h1 class="page-title">${title}</h1></div><div class="alert alert-danger" role="alert">${escapeAdmin(failure.message)} <button class="btn btn-secondary btn-compact" type="button" data-admin-retry>Retry</button></div>`
    : '';

  let content = failure ? '' : `<section class="admin-page-content"><p class="text-secondary">Loading operational records…</p></section>`;

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
    content: `<div class="admin-page-content">${notice ? `<p class="admin-flash" role="status">${renderIcon('check', { size: 16 })} ${escapeAdmin(notice)}</p>` : ''}${err}${content}</div>`,
  };
}

export function renderAdminPage(
  path: string,
  data: any,
  error?: string | AdminLoadError,
  adminUser: { displayName: string; email: string; capabilities?: ('student' | 'author' | 'admin')[] } = { displayName: 'Administrator', email: '' },
  notice?: string
): string {
  const { title, content } = renderAdminPageContent(path, data, error, adminUser, notice);
  return renderAdminShell({
    activePath: path.split('?')[0],
    adminUser,
    headerTitle: title,
    content,
  });
}
