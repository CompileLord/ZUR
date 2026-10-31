import { type UserPreferences } from 'zur-shared';
import { renderAppShell } from '../../components/shells/index.ts';
import { renderProgressLine } from '../../components/common/index.ts';
import { renderProfileSettingsPage } from '../../pages/settings/ProfileSettingsPage.ts';
import { renderAppearanceSettingsPage } from '../../pages/settings/AppearanceSettingsPage.ts';
import { renderSecuritySettingsPage } from '../../pages/settings/SecuritySettingsPage.ts';
import { renderPrivacySettingsPage } from '../../pages/settings/PrivacySettingsPage.ts';
import { type RouteContext } from '../context.ts';
import { loadS2Page } from '../navigation.ts';
import { renderAiConnectionsSettings, renderAiConnectionSetupPage } from './ai-connections-controller.ts';
import {
  attachProfileListeners,
  attachAppearanceListeners,
  attachSecurityListeners,
  attachPrivacyListeners,
} from './settings-listeners.ts';
import { appEl, authClient } from '../state.ts';

export function renderSettingsRoute(ctx: RouteContext): void {
  const { route, params, currentUser, path } = ctx;
  if (['P09', 'P10', 'P11', 'P21'].includes(route.pageId)) { void loadS2Page(route.pageId, params, path); return; }
  // Authenticated Application & Settings Pages (P09-P11, P17-P20)
  const user = currentUser || {
    id: 'user-guest',
    displayName: 'Guest Learner',
    email: 'guest@zur.internal',
    emailVerified: false,
    capabilities: ['student' as const],
    accountStatus: 'active' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let content = '';

  if (route.pageId === 'P17') {
    // Profile Settings
    appEl.innerHTML = renderAppShell({
      activePath: path,
      user,
      headerTitle: 'Settings',
      content: renderProfileSettingsPage({ user }),
    });
    attachProfileListeners();
  } else if (route.pageId === 'P18') {
    // Appearance Settings: load saved preferences so a reload shows persisted values.
    const savedTheme = (localStorage.getItem('zur_theme_preference') as 'dark' | 'light' | 'system') || 'dark';
    const resolvedSystem = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    const appearancePath = window.location.pathname + window.location.search;
    const drawAppearance = (saved: Partial<UserPreferences> | null, error?: string) => {
      appEl.innerHTML = renderAppShell({
        activePath: path,
        user,
        headerTitle: 'Settings',
        content: renderAppearanceSettingsPage({
          preferences: {
            userId: user.id,
            theme: savedTheme,
            editorFontSize: (saved?.editorFontSize ?? 14) as UserPreferences['editorFontSize'],
            indentationSpaces: (saved?.indentationSpaces ?? 4) as UserPreferences['indentationSpaces'],
            updatedAt: saved?.updatedAt || new Date().toISOString(),
          },
          resolvedSystemTheme: resolvedSystem,
          error,
          isAuthor: user.capabilities.includes('author'),
        }),
      });
      attachAppearanceListeners();
    };
    void (async () => {
      let savedPrefs: UserPreferences | null = null;
      let loadError: string | undefined;
      try { savedPrefs = await authClient.getAppearance(); } catch (e: any) { loadError = `Could not load your saved preferences. ${e?.message || ''}`.trim(); }
      if (window.location.pathname + window.location.search !== appearancePath) return;
      drawAppearance(savedPrefs, loadError);
    })();
  } else if (route.pageId === 'P19') {
    // Security Settings
    appEl.innerHTML = renderAppShell({
      activePath: path,
      user,
      headerTitle: 'Settings',
      content: renderSecuritySettingsPage({ user }),
    });
    attachSecurityListeners();
  } else if (route.pageId === 'P20') {
    // Privacy Settings
    appEl.innerHTML = renderAppShell({
      activePath: path,
      user,
      headerTitle: 'Settings',
      content: renderPrivacySettingsPage({ isAuthor: user.capabilities.includes('author') }),
    });
    attachPrivacyListeners();
    const privacyPath=window.location.pathname+window.location.search;
    void authClient.getPrivacyStatus().then((status)=>{
      if(window.location.pathname+window.location.search!==privacyPath)return;
      appEl.innerHTML=renderAppShell({activePath:path,user,headerTitle:'Settings',content:renderPrivacySettingsPage({ ...status, isAuthor: user.capabilities.includes('author') })});
      attachPrivacyListeners();
    }).catch((error:any)=>{
      if(window.location.pathname+window.location.search!==privacyPath)return;
      const region=document.getElementById('privacy-error');if(region){region.className='form-error mb-6 p-3 border border-danger rounded';region.textContent=error.message||'Could not load request status.';}
    });
  } else if (route.pageId === 'P43') {
    // AI Connections (P43)
    void renderAiConnectionsSettings(path, user);
  } else if (route.pageId === 'P44') {
    // MCP Client Setup (P44)
    const connectionId = params.connectionId || '';
    void renderAiConnectionSetupPage(path, user, connectionId);
  } else {

    // Default Student Dashboard (P09)
    content = `
          <div class="dashboard-resume-panel card p-6 mb-8 border border-subtle bg-surface rounded-lg">
            <span class="text-xs uppercase text-muted font-semibold tracking-wide">Continue learning</span>
            <h2 class="text-xl font-semibold mt-1 mb-2">Python foundations</h2>
            <p class="text-sm text-secondary mb-4">Lesson 1: Naming and Values · Step 4: Echoing Numbers</p>
            <div class="mb-4">
              ${renderProgressLine({ satisfiedRequiredCount: 3, totalRequiredCount: 4 })}
            </div>
            <a href="/learn/enr-ada/steps/step-4-python-echo" class="btn btn-primary">Resume step</a>
          </div>
        `;

    appEl.innerHTML = renderAppShell({
      activePath: path,
      user,
      currentMode: path.startsWith('/teach') ? 'teach' : 'learn',
      headerTitle: route.title,
      content,
    });
  }
  return;
}
