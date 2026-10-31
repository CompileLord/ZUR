import { getSafeReturnDestination } from '../../router/routes.ts';
import { navigateTo } from '../navigation.ts';
import { authClient, appEl } from '../state.ts';
import { initTheme } from '../theme.ts';

export async function loadAdminPage(path: string, displayName: string, email: string): Promise<void> {
  const adminActor = { displayName, email, capabilities: authClient.getUser()?.capabilities };
  const isShellMounted = Boolean(appEl.querySelector('.shell-admin'));
  const activeBasePath = path.split('?')[0];
  if (isShellMounted) {
    appEl.querySelectorAll<HTMLAnchorElement>('.admin-nav-item').forEach((link) => {
      const href = link.getAttribute('href');
      const isActive =
        href === '/admin'
          ? activeBasePath === '/admin'
          : Boolean(href && (activeBasePath === href || activeBasePath.startsWith(`${href}/`)));
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  const headers: Record<string, string> = {};
  const api = async (url: string) => {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 401) {
        authClient.clearSession();
        const returnTo = getSafeReturnDestination(window.location.pathname + window.location.search);
        navigateTo(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Admin request failed (${res.status})`);
    }
    return res.json();
  };
  try {
    const search = new URL(path,window.location.origin).search;
    let data:any;
    if(path.split('?')[0]==='/admin') data=await api('/api/admin/operations');
    else if(path.split('?')[0]==='/admin/users') data=await api(`/api/admin/users${search}`);
    else if(path.startsWith('/admin/users/')) {
      const userId=decodeURIComponent(path.split('?')[0].split('/')[3]);
      data=await api(`/api/admin/users/${encodeURIComponent(userId)}`);
      const grant=new URL(path,window.location.origin).searchParams.get('supportAccess');
      if(grant) data.supportRecords=await api(`/api/admin/support-access/${encodeURIComponent(grant)}/records`);
    }
    else if(path.split('?')[0]==='/admin/courses') data=await api(`/api/admin/courses${search}`);
    else if(path.startsWith('/admin/courses/')) data=await api(`/api/admin/courses/${encodeURIComponent(path.split('?')[0].split('/')[3])}`);
    else if(path.split('?')[0]==='/admin/categories') data=await api('/api/admin/categories');
    else if(path.split('?')[0]==='/admin/reports') data=await api(`/api/admin/reports${search}`);
    else if(path.startsWith('/admin/reports/')) data=await api(`/api/admin/reports/${encodeURIComponent(path.split('?')[0].split('/')[3])}`);
    else if(path.split('?')[0]==='/admin/media') data=await api(`/api/admin/media${search}`);
    else if(path.split('?')[0]==='/admin/execution') { const [overview,jobs]=await Promise.all([api('/api/admin/operations'),api(`/api/admin/execution/jobs${search}`)]);data={overview,jobs}; }
    else if(path.startsWith('/admin/audit/')) data=await api(`/api/admin/audit/${encodeURIComponent(path.split('?')[0].split('/')[3])}`);
    else if(path.split('?')[0]==='/admin/audit') data=await api(`/api/admin/audit${search}`);
    else data={};
    if(window.location.pathname+window.location.search!==path&&window.location.pathname!==path.split('?')[0])return;
    const { renderAdminPage, renderAdminPageContent } = await import('../../pages/admin/AdminPages.ts');
    if (appEl.querySelector('.shell-admin')) {
      const { title, content } = renderAdminPageContent(path, data, undefined, adminActor);
      const adminMain = appEl.querySelector('.admin-main') || appEl.querySelector('.admin-content-body');
      if (adminMain) {
        adminMain.innerHTML = content;
      }
      const topbarTitle = appEl.querySelector('.admin-location-current');
      if (topbarTitle) {
        topbarTitle.textContent = title;
      }
      document.title = `${title} · ZUR`;
    } else {
      appEl.innerHTML = renderAdminPage(path, data, undefined, adminActor);
      const { title } = renderAdminPageContent(path, data, undefined, adminActor);
      document.title = `${title} · ZUR`;
      initTheme();
    }
  } catch(error:any) {
    if(window.location.pathname+window.location.search!==path&&window.location.pathname!==path.split('?')[0])return;
    const { renderAdminPage, renderAdminPageContent } = await import('../../pages/admin/AdminPages.ts');
    if (appEl.querySelector('.shell-admin')) {
      const { title, content } = renderAdminPageContent(path, null, error.message, adminActor);
      const adminMain = appEl.querySelector('.admin-main') || appEl.querySelector('.admin-content-body');
      if (adminMain) {
        adminMain.innerHTML = content;
      }
      const topbarTitle = appEl.querySelector('.admin-location-current');
      if (topbarTitle) {
        topbarTitle.textContent = title;
      }
      document.title = `${title} · ZUR`;
    } else {
      appEl.innerHTML = renderAdminPage(path, null, error.message, adminActor);
      const { title } = renderAdminPageContent(path, null, error.message, adminActor);
      document.title = `${title} · ZUR`;
      initTheme();
    }
  }
}
