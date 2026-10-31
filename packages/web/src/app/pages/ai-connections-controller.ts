import { renderAppShell } from '../../components/shells/index.ts';
import { copyTextToClipboard } from '../../pages/settings/ai-connections-enhancer.ts';
import { type CompatibleClient } from '../../pages/settings/McpClientSetupDialog.ts';
import { renderSafeDenialPage } from '../../pages/status/SafeDenialPage.ts';
import { escapeHtml } from '../helpers.ts';
import { showRouteFailure, showRouteLoading } from '../route-loading.ts';
import { authClient, appEl } from '../state.ts';
import { initTheme } from '../theme.ts';

export async function renderAiConnectionsSettings(path: string, user: NonNullable<ReturnType<typeof authClient.getUser>>, state: { showCreateModal?: boolean; revealedToken?: any; revokingToken?: any; replacingToken?: any; error?: string; successMessage?: string } = {}): Promise<void> {
  const { renderAiConnectionsPage } = await import('../../pages/settings/AiConnectionsPage.ts');
  if (!user.capabilities.includes('author')) {
    appEl.innerHTML = renderAppShell({ activePath: path.split('?')[0], user, headerTitle: 'AI connections', content: renderAiConnectionsPage({ user, tokens: [] }) });
    return;
  }
  try {
    const response = await authClient.fetchApi(`/api/author/tokens?status=${encodeURIComponent(new URLSearchParams(path.split('?')[1] || '').get('filter') || 'all')}`);
    const tokens = response.tokens || [];
    let courses: any[] = [];
    try {
      const coursesRes = await authClient.fetchApi('/api/author/courses?limit=100');
      courses = (coursesRes.courses || []).map((c: any) => ({ id: c.id, title: c.title }));
    } catch {
      courses = [];
    }
    const render = () => {
      appEl.innerHTML = renderAppShell({ activePath: path.split('?')[0], user, headerTitle: 'AI connections', content: renderAiConnectionsPage({ user, tokens, courses, activeFilter: (new URLSearchParams(path.split('?')[1] || '').get('filter') || 'all') as any, ...state }) });
      const createButton = document.getElementById('btn-open-create-token') || document.getElementById('btn-empty-create-token');
      createButton?.addEventListener('click', () => { state = { showCreateModal: true }; render(); });
      document.querySelectorAll<HTMLElement>('[data-dialog-action="cancel"]').forEach((button) => button.addEventListener('click', () => { state = {}; render(); }));
      document.querySelectorAll<HTMLInputElement>('input[name="courseScopeType"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          const container = document.getElementById('selected-courses-container') || document.getElementById('replace-selected-courses-container');
          if (container) {
            if (radio.value === 'selected') container.classList.remove('hidden');
            else container.classList.add('hidden');
          }
        });
      });
      const createForm = document.getElementById('create-token-form') as HTMLFormElement | null;
      createForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        void (async () => {
          const form = new FormData(createForm);
          const allScopes = [...createForm.querySelectorAll<HTMLInputElement>('input[name="scopes"]')];
          const preset = String(form.get('preset'));
          const presetScopes: Record<string, string[]> = {
            draft_authoring: ['courses:read', 'courses:create', 'content:write', 'media:write', 'exercises:validate'],
            read_only: ['courses:read'],
            full_course_control: ['courses:read', 'courses:create', 'content:write', 'media:write', 'exercises:validate', 'content:delete', 'courses:publish', 'courses:manage'],
          };
          const scopes = preset === 'custom' ? allScopes.filter((input) => input.checked).map((input) => input.value) : (presetScopes[preset] || []);
          const courseRestrictions = form.get('courseScopeType') === 'selected' ? [...createForm.querySelectorAll<HTMLInputElement>('input[name="selectedCourses"]:checked')].map((input) => input.value) : null;
          try {
            const created = await authClient.fetchApi('/api/author/tokens', { method: 'POST', body: JSON.stringify({ label: form.get('label'), password: form.get('password'), scopes, courseRestrictions, expiryDays: Number(form.get('expiryDays')) }) });
            state = { revealedToken: { id: created.token.id, rawToken: created.rawToken, label: created.token.label, scopes: created.token.scopes, courseRestrictions: created.token.courseRestrictions, expiresAt: created.token.expiresAt }, successMessage: 'Connection created successfully.' };
            await renderAiConnectionsSettings(path, user, state);
          } catch (error: any) {
            state = { showCreateModal: true, error: error.message || 'The token could not be created.' };
            await renderAiConnectionsSettings(path, user, state);
          }
        })();
      });
      const replaceForm = document.getElementById('replace-token-form') as HTMLFormElement | null;
      replaceForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        void (async () => {
          const form = new FormData(replaceForm);
          const tokenId = replaceForm.dataset.tokenId;
          const scopes = [...replaceForm.querySelectorAll<HTMLInputElement>('input[name="scopes"]:checked')].map((input) => input.value);
          const courseScopeType = form.get('courseScopeType');
          const courseRestrictions = courseScopeType === 'selected'
            ? [...replaceForm.querySelectorAll<HTMLInputElement>('input[name="selectedCourses"]:checked')].map((input) => input.value)
            : (courseScopeType === 'all' ? null : undefined);
          try {
            const replaced = await authClient.fetchApi(`/api/author/tokens/${encodeURIComponent(tokenId || '')}/replace`, {
              method: 'POST',
              body: JSON.stringify({
                label: form.get('label'),
                password: form.get('password'),
                scopes,
                ...(courseRestrictions !== undefined ? { courseRestrictions } : {}),
                expiryDays: Number(form.get('expiryDays')) || 30,
              }),
            });
            state = {
              revealedToken: {
                id: replaced.token.id,
                rawToken: replaced.rawToken,
                label: replaced.token.label,
                scopes: replaced.token.scopes,
                courseRestrictions: replaced.token.courseRestrictions,
                expiresAt: replaced.token.expiresAt,
              },
              successMessage: 'Connection replaced successfully.',
            };
            await renderAiConnectionsSettings(path, user, state);
          } catch (error: any) {
            state = {
              replacingToken: tokens.find((item: any) => item.id === tokenId),
              error: error.message || 'The token could not be replaced.',
            };
            await renderAiConnectionsSettings(path, user, state);
          }
        })();
      });
      document.querySelectorAll<HTMLButtonElement>('[data-action="revoke-token"]').forEach((button) => button.addEventListener('click', () => {
        state = { revokingToken: tokens.find((item: any) => item.id === button.dataset.tokenId) };
        render();
      }));
      document.querySelectorAll<HTMLButtonElement>('[data-action="replace-token"]').forEach((button) => button.addEventListener('click', () => {
        state = { replacingToken: tokens.find((item: any) => item.id === button.dataset.tokenId) };
        render();
      }));
      document.getElementById('btn-confirm-revoke')?.addEventListener('click', (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        void authClient.fetchApi(`/api/author/tokens/${encodeURIComponent(button.dataset.tokenId || '')}`, { method: 'DELETE' })
          .then(() => renderAiConnectionsSettings(path, user, { successMessage: 'Connection revoked.' }))
          .catch((error: any) => renderAiConnectionsSettings(path, user, { error: error.message || 'The connection could not be revoked.' }));
      });
      document.getElementById('btn-toggle-secret-visibility')?.addEventListener('click', (event) => {
        const input = document.getElementById('revealed-token-value') as HTMLInputElement | null;
        const button = event.currentTarget as HTMLButtonElement;
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        button.textContent = input.type === 'password' ? 'Reveal' : 'Hide';
      });
      document.getElementById('btn-copy-token')?.addEventListener('click', () => {
        const input = document.getElementById('revealed-token-value') as HTMLInputElement | null;
        const announcement = document.getElementById('copy-announcement');
        if (!input || !navigator.clipboard?.writeText) { if (announcement) announcement.textContent = 'Clipboard access is unavailable. Select and copy the token manually.'; return; }
        void navigator.clipboard.writeText(input.value).then(() => { if (announcement) announcement.textContent = 'Token copied. Store it in a secure client configuration.'; });
      });
    };
    render();
  } catch (error: any) {
    showRouteFailure(error.message || 'Could not load AI connections.', path);
  }
}

export async function renderAiConnectionSetupPage(
  path: string,
  user: NonNullable<ReturnType<typeof authClient.getUser>>,
  connectionId: string
): Promise<void> {
  const isCurrent = () => window.location.pathname + window.location.search === path;
  if (!connectionId) {
    appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
    initTheme();
    return;
  }

  showRouteLoading('Connection setup');
  let tokenData: any;
  try {
    const fetched = await authClient.fetchApi(`/api/author/tokens/${encodeURIComponent(connectionId)}`);
    if (!fetched || !fetched.id) {
      throw new Error("This connection isn't available.");
    }
    tokenData = fetched;
  } catch (error: any) {
    if (!isCurrent()) return;
    if (error.statusCode === 404 || error.status === 404) {
      appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
    } else if (error.statusCode === 403 || error.status === 403) {
      appEl.innerHTML = renderSafeDenialPage({ type: 'access-denied' });
    } else {
      showRouteFailure(error.message || 'We could not load this AI connection setup. Retry when the service is available.', path);
    }
    initTheme();
    return;
  }

  if (!isCurrent()) return;

  const searchParams = new URLSearchParams(window.location.search);
  const rawClient = searchParams.get('client');
  let currentClient: CompatibleClient =
    rawClient === 'generic' ? 'generic' :
    rawClient === 'oauth_client' ? 'oauth_client' :
    'official_sdk';

  const { renderMcpClientSetupPage } = await import('../../pages/settings/McpClientSetupDialog.ts');
  const render = () => {
    appEl.innerHTML = renderAppShell({
      activePath: path.split('?')[0],
      user,
      headerTitle: 'Connection setup and verification',
      content: renderMcpClientSetupPage({
        token: tokenData,
        selectedClient: currentClient,
        endpointUrl: `${window.location.origin}/mcp`,
      }),
    });

    document.querySelectorAll<HTMLButtonElement>('.client-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const clientAttr = btn.dataset.client;
        if (clientAttr === 'official_sdk' || clientAttr === 'generic' || clientAttr === 'oauth_client') {
          currentClient = clientAttr;
          const url = new URL(window.location.href);
          url.searchParams.set('client', clientAttr);
          window.history.replaceState({}, '', url.toString());
          render();
        }
      });
    });

    const copyEndpointBtn = document.getElementById('btn-copy-endpoint') as HTMLButtonElement | null;
    copyEndpointBtn?.addEventListener('click', async () => {
      const endpointInput = document.getElementById('endpoint-url-input') as HTMLInputElement | null;
      const text = endpointInput?.value || `${window.location.origin}/mcp`;
      const originalText = copyEndpointBtn.textContent?.trim() || 'Copy endpoint';
      copyEndpointBtn.textContent = (await copyTextToClipboard(text)) ? 'Copied!' : 'Copy failed';
      setTimeout(() => {
        if (copyEndpointBtn) copyEndpointBtn.textContent = originalText;
      }, 2000);
    });

    const copySnippetBtn = document.getElementById('btn-copy-snippet') as HTMLButtonElement | null;
    copySnippetBtn?.addEventListener('click', async () => {
      const codeBlock = document.querySelector('.setup-code-block code');
      const text = codeBlock?.textContent || '';
      const originalText = copySnippetBtn.textContent?.trim() || 'Copy configuration';
      copySnippetBtn.textContent = (await copyTextToClipboard(text)) ? 'Copied!' : 'Copy failed';
      setTimeout(() => {
        if (copySnippetBtn) copySnippetBtn.textContent = originalText;
      }, 2000);
    });

    const refreshStatusBtn = document.getElementById('btn-refresh-status') as HTMLButtonElement | null;
    refreshStatusBtn?.addEventListener('click', async () => {
      if (refreshStatusBtn.disabled) return;
      refreshStatusBtn.disabled = true;
      const originalText = refreshStatusBtn.textContent?.trim() || 'Refresh status';
      refreshStatusBtn.textContent = 'Refreshing…';
      try {
        const refreshed = await authClient.fetchApi(`/api/author/tokens/${encodeURIComponent(connectionId)}`);
        if (refreshed && refreshed.id) {
          tokenData = refreshed;
          render();
        } else {
          throw new Error('Could not refresh status');
        }
      } catch (err: any) {
        const statusBox = document.querySelector('.verification-status-box');
        if (statusBox) {
          statusBox.innerHTML = `<p class="text-xs text-danger" role="alert">Status refresh failed: ${escapeHtml(err.message || 'Network error')}</p>`;
        }
        if (refreshStatusBtn) {
          refreshStatusBtn.disabled = false;
          refreshStatusBtn.textContent = originalText;
        }
      }
    });

    const copyPromptBtn = document.getElementById('btn-copy-prompt') as HTMLButtonElement | null;
    copyPromptBtn?.addEventListener('click', async () => {
      const prompt = copyPromptBtn.dataset.prompt || '';
      const originalText = copyPromptBtn.textContent?.trim() || 'Copy prompt';
      copyPromptBtn.textContent = (await copyTextToClipboard(prompt)) ? 'Copied!' : 'Copy failed';
      setTimeout(() => {
        if (copyPromptBtn) copyPromptBtn.textContent = originalText;
      }, 2000);
    });
  };

  render();
}
