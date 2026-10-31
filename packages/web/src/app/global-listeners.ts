import { SESSION_EXPIRED_EVENT } from '../services/auth-client.ts';
import { markAuthorShellDirty } from '../services/author-dirty.ts';
import { installDelegatedActions } from '../services/delegated-actions.ts';
import { confirmLeaveDialog } from '../components/common/Dialog.ts';
import { navigationHistory } from '../utils/navigation-history.ts';
import { handleSessionExpired } from './api.ts';
import { safeSessionStorageRemove, cleanupActiveModals } from './helpers.ts';
import { confirmAppearanceDeparture } from './leave-guards.ts';
import { renderApp } from './navigation.ts';
import { app, authClient } from './state.ts';

export function installNavigationListeners(): void {
  window.addEventListener(SESSION_EXPIRED_EVENT, (event) => handleSessionExpired((event as CustomEvent).detail));
  installDelegatedActions();
  for (const type of ['input', 'change']) document.addEventListener(type, (event) => { markAuthorShellDirty(event.target); });

  window.addEventListener('popstate', async (event: PopStateEvent) => {
    if (navigationHistory.checkAndClearReverting()) {
      return;
    }

    const dirtyAuthorShell = document.querySelector('.shell-author.is-dirty');
    if (dirtyAuthorShell) {
      const confirmed = await confirmLeaveDialog({ message: 'You have unsaved changes on this page. If you leave now they will be lost.' });
      if (!confirmed) {
        navigationHistory.revertPopstate(event.state);
        return;
      }
      dirtyAuthorShell.classList.remove('is-dirty');
    }

    if (app.activeProfileGuard) {
      const profileInput = document.querySelector('#profile-settings-form input[name="displayName"]') as HTMLInputElement | null;
      const currentVal = profileInput ? profileInput.value : '';
      const promptMsg = app.activeProfileGuard.getNavigationPrompt(currentVal);
      if (promptMsg) {
        const confirmed = await confirmLeaveDialog({ message: promptMsg });
        if (!confirmed) {
          navigationHistory.revertPopstate(event.state);
          return;
        }
        const user = authClient.getUser();
        if (user) {
          safeSessionStorageRemove(`zur_profile_draft_${user.id}`);
        }
        if (app.activeProfileCleanup) {
          app.activeProfileCleanup();
          app.activeProfileCleanup = null;
        }
        app.activeProfileGuard = null;
      }
    }

    cleanupActiveModals();
    navigationHistory.confirmPopstate(event.state);

    const canLeaveAppearance = await confirmAppearanceDeparture(1500);
    if (!canLeaveAppearance) {
      window.history.pushState(null, '', '/settings/appearance');
      return;
    }
    renderApp();
  });

  window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
    if (document.querySelector('.shell-author.is-dirty')) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
