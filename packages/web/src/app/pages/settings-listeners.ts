import { type UserPreferences } from 'zur-shared';
import { renderAppShell } from '../../components/shells/index.ts';
import { renderProfileSettingsPage } from '../../pages/settings/ProfileSettingsPage.ts';
import { renderSecuritySettingsPage } from '../../pages/settings/SecuritySettingsPage.ts';
import { renderPrivacySettingsPage } from '../../pages/settings/PrivacySettingsPage.ts';
import { AppearanceSaveQueue } from '../../services/appearance-save-queue.ts';
import { trapDialogFocus } from '../../services/dialog-focus.ts';
import { ProfileGuard } from '../../services/profile-guard.ts';
import {
  safeSessionStorageGet,
  safeSessionStorageSet,
  safeSessionStorageRemove,
  escapeHtml,
} from '../helpers.ts';
import { confirmUnsyncedSignOut } from '../leave-guards.ts';
import { navigateTo } from '../navigation.ts';
import { app, authClient, appEl } from '../state.ts';
import { applyTheme } from '../theme.ts';

export function attachProfileListeners(): void {
  if (app.activeProfileCleanup) {
    app.activeProfileCleanup();
    app.activeProfileCleanup = null;
  }

  const form = document.getElementById('profile-settings-form') as HTMLFormElement | null;
  const saveBtn = document.getElementById('btn-save-profile') as HTMLButtonElement | null;
  const errorEl = document.getElementById('profile-error');
  const input = form?.elements.namedItem('displayName') as HTMLInputElement | null;

  if (!input || !saveBtn || !form) return;

  const user = authClient.getUser();
  const draftKey = user ? `zur_profile_draft_${user.id}` : null;
  if (draftKey) {
    const existingDraft = safeSessionStorageGet(draftKey);
    if (existingDraft !== null && existingDraft.trim().length > 0 && existingDraft !== input.value) {
      input.value = existingDraft;
    }
  }

  const guard = new ProfileGuard(user?.displayName || input.value);
  app.activeProfileGuard = guard;
  saveBtn.disabled = !guard.isDirty(input.value);

  const checkDirty = () => {
    if (draftKey) {
      safeSessionStorageSet(draftKey, input.value);
    }
    if (!guard.isSaving) {
      saveBtn.disabled = !guard.isDirty(input.value);
    }
  };
  input.addEventListener('input', checkDirty);

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!input.isConnected) {
      window.removeEventListener('beforeunload', onBeforeUnload);
      return;
    }
    if (guard.shouldBlockNavigation(input.value)) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  app.activeProfileCleanup = () => {
    window.removeEventListener('beforeunload', onBeforeUnload);
    app.activeProfileGuard = null;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = input.value;

    if (!guard.startSave(displayName)) {
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    if (errorEl) {
      errorEl.className = 'hidden';
      errorEl.innerHTML = '';
    }

    try {
      const updated = await authClient.updateProfile(displayName);
      guard.markSaveSuccess(updated.displayName);
      if (draftKey) {
        safeSessionStorageRemove(draftKey);
      }
      if (app.activeProfileCleanup) {
        app.activeProfileCleanup();
        app.activeProfileCleanup = null;
      }
      appEl.innerHTML = renderAppShell({
        activePath: '/settings/profile',
        user: updated,
        headerTitle: 'Settings',
        content: renderProfileSettingsPage({
          user: updated,
          successMessage: 'Profile display name updated successfully.',
        }),
      });
      attachProfileListeners();
    } catch (err: any) {
      guard.markSaveFailure();
      if (errorEl) {
        errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
        errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Failed to update profile.')}</span>`;
      }
      saveBtn.disabled = !guard.isDirty(input.value);
      saveBtn.textContent = 'Save changes';
      input.focus();
    }
  });
}

export function attachAppearanceListeners(): void {
  if (app.activeAppearanceCleanup) {
    app.activeAppearanceCleanup();
    app.activeAppearanceCleanup = null;
  }

  const form = document.getElementById('appearance-settings-form') as HTMLFormElement | null;
  const radioInputs = document.querySelectorAll<HTMLInputElement>('input[name="theme"]');
  const fontSizeSelect = document.getElementById('editorFontSize') as HTMLSelectElement | null;
  const indentSelect = document.getElementById('indentationSpaces') as HTMLSelectElement | null;
  const statusEl = document.getElementById('appearance-autosave-status');
  const saveBtn = document.getElementById('btn-save-appearance') as HTMLButtonElement | null;

  const currentThemeRadio = document.querySelector<HTMLInputElement>('input[name="theme"]:checked');
  const currentPrefs: Partial<UserPreferences> = {
    theme: (currentThemeRadio?.value || 'system') as 'dark' | 'light' | 'system',
    editorFontSize: Number(fontSizeSelect?.value || 14),
    indentationSpaces: Number(indentSelect?.value || 4),
  };

  const queue = new AppearanceSaveQueue({
    delayMs: 200,
    save: async (prefs) => {
      return authClient.saveAppearance(prefs);
    },
    onSaving: () => {
      if (statusEl) {
        statusEl.innerHTML = '<span class="status-indicator"></span> <span>Saving preferences…</span>';
      }
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
      }
    },
    onSuccess: (_saved, isLatest) => {
      if (isLatest) {
        if (statusEl) {
          statusEl.innerHTML = '<span class="status-indicator success"></span> <span class="text-success">All preferences saved</span>';
        }
        const errorEl = document.getElementById('appearance-error');
        if (errorEl) {
          errorEl.className = 'hidden';
          errorEl.innerHTML = '';
        }
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save preferences';
        }
      }
    },
    onError: (err) => {
      if (statusEl) {
        statusEl.innerHTML = `<span class="status-indicator error"></span> <span class="text-danger">${escapeHtml(err.message || 'Failed to save')}</span>`;
      }
      const errorEl = document.getElementById('appearance-error');
      if (errorEl) {
        errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
        errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Failed to save appearance settings.')}</span>`;
      }
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save preferences';
      }
    },
  });

  app.activeAppearanceQueue = queue;

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (app.activeAppearanceQueue && app.activeAppearanceQueue.isPending) {
      void app.activeAppearanceQueue.flush();
      if (app.activeAppearanceQueue.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
  };
  const onPageHide = () => {
    if (app.activeAppearanceQueue && app.activeAppearanceQueue.isPending) {
      void app.activeAppearanceQueue.flush();
    }
  };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);

  app.activeAppearanceCleanup = () => {
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);
    app.activeAppearanceQueue = null;
  };

  radioInputs.forEach((radio) => {
    radio.addEventListener('change', () => {
      const selected = radio.value as 'dark' | 'light' | 'system';
      applyTheme(selected);

      // Update active styling on cards
      document.querySelectorAll('.theme-card').forEach((card) => {
        const inp = card.querySelector('input[type="radio"]') as HTMLInputElement | null;
        if (inp?.checked) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });

      currentPrefs.theme = selected;
      queue.update({ ...currentPrefs });
    });
  });

  fontSizeSelect?.addEventListener('change', () => {
    currentPrefs.editorFontSize = Number(fontSizeSelect.value || 14);
    queue.update({ ...currentPrefs });
  });

  indentSelect?.addEventListener('change', () => {
    currentPrefs.indentationSpaces = Number(indentSelect.value || 4);
    queue.update({ ...currentPrefs });
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await queue.flush();
    });
  }
}

export function attachSecurityListeners(): void {
  const form = document.getElementById('change-password-form') as HTMLFormElement | null;
  const errorEl = document.getElementById('security-error');
  const btnSignoutAll = document.getElementById('btn-sign-out-all');
  const modal = document.getElementById('sign-out-all-modal');
  const btnCancelSignout = document.getElementById('btn-cancel-signout-all');
  const btnConfirmSignout = document.getElementById('btn-confirm-signout-all') as HTMLButtonElement | null;

  if (btnSignoutAll && modal) {
    btnSignoutAll.addEventListener('click', () => {
      modal.classList.remove('hidden');
    });
  }

  if (btnCancelSignout && modal) {
    btnCancelSignout.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  if (btnConfirmSignout) {
    btnConfirmSignout.addEventListener('click', async () => {
      const user = authClient.getUser();
      if (user && !await confirmUnsyncedSignOut(user.id)) return;
      btnConfirmSignout.disabled = true;
      btnConfirmSignout.textContent = 'Signing out…';
      try {
        await authClient.signOutAll();
        navigateTo('/sign-in');
      } catch (err: any) {
        btnConfirmSignout.disabled = false;
        btnConfirmSignout.textContent = 'Sign out of all devices';
        modal?.classList.add('hidden');
        if (errorEl) {
          errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Failed to sign out of all devices.')}</span>`;
        }
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = (form.elements.namedItem('currentPassword') as HTMLInputElement).value;
      const newPassword = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
      const confirmNewPassword = (form.elements.namedItem('confirmNewPassword') as HTMLInputElement).value;
      const submitBtn = document.getElementById('btn-change-password') as HTMLButtonElement | null;

      if (newPassword !== confirmNewPassword) {
        if (errorEl) {
          errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
          errorEl.innerHTML = '<span aria-hidden="true">⚠</span> <span>New passwords do not match.</span>';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating…';
      }

      try {
        await authClient.changePassword(currentPassword, newPassword);
        const user = authClient.getUser()!;
        appEl.innerHTML = renderAppShell({
          activePath: '/settings/security',
          user,
          headerTitle: 'Settings',
          content: renderSecuritySettingsPage({
            user,
            successMessage: 'Password updated successfully.',
          }),
        });
        attachSecurityListeners();
      } catch (err: any) {
        if (errorEl) {
          errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Failed to update password.')}</span>`;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Update password';
        }
      }
    });
  }
}

export function attachPrivacyListeners(): void {
  const exportForm = document.getElementById('export-data-form');
  const btnOpenDeleteModal = document.getElementById('btn-open-delete-modal');
  const deleteModal = document.getElementById('delete-account-modal');
  const btnCancelDelete = document.getElementById('btn-cancel-deletion');
  const btnConfirmDelete = document.getElementById('btn-confirm-deletion') as HTMLButtonElement | null;
  const ackCheckbox = document.getElementById('acknowledge-deletion-consequences') as HTMLInputElement | null;

  if (ackCheckbox && btnConfirmDelete) {
    ackCheckbox.addEventListener('change', () => {
      btnConfirmDelete.disabled = !ackCheckbox.checked;
    });
  }

  let releaseFocusTrap: (() => void) | null = null;
  const closeDeleteModal = () => {
    deleteModal?.classList.add('hidden');
    releaseFocusTrap?.();
    releaseFocusTrap = null;
  };

  if (btnOpenDeleteModal && deleteModal) {
    btnOpenDeleteModal.addEventListener('click', () => {
      deleteModal.classList.remove('hidden');
      releaseFocusTrap?.();
      releaseFocusTrap = trapDialogFocus(deleteModal, {
        onEscape: () => { if (!btnConfirmDelete?.textContent?.startsWith('Deleting')) closeDeleteModal(); },
      });
      app.activeModalCleanup = () => releaseFocusTrap?.();
      btnCancelDelete?.focus();
    });
  }

  if (btnCancelDelete && deleteModal) {
    btnCancelDelete.addEventListener('click', closeDeleteModal);
  }

  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', async () => {
      btnConfirmDelete.disabled = true;
      btnConfirmDelete.textContent = 'Deleting account…';

      try {
        await authClient.requestAccountDeletion(true);
        navigateTo('/sign-in');
      } catch (err: any) {
        const errorEl = document.getElementById('privacy-error');
        closeDeleteModal();
        if (btnConfirmDelete) {
          btnConfirmDelete.disabled = !ackCheckbox?.checked;
          btnConfirmDelete.textContent = 'Confirm deletion';
        }
        if (errorEl) {
          errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Deletion request blocked.')}</span>`;
        }
      }
    });
  }

  if (exportForm) {
    exportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const exportBtn = document.getElementById('btn-export-data') as HTMLButtonElement | null;
      if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.textContent = 'Packaging data…';
      }

      try {
        const result = await authClient.requestDataExport();
        const user = authClient.getUser()!;
        appEl.innerHTML = renderAppShell({
          activePath: '/settings/privacy',
          user,
          headerTitle: 'Settings',
          content: renderPrivacySettingsPage({
            exportData: result.exportPayload,
            exportDownloadUrl: result.downloadUrl,
            successMessage: 'Data export package generated.',
          }),
        });
        attachPrivacyListeners();
      } catch (err: any) {
        const errorEl = document.getElementById('privacy-error');
        if (errorEl) {
          errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Failed to export data.')}</span>`;
        }
        if (exportBtn) {
          exportBtn.disabled = false;
          exportBtn.textContent = 'Export my data';
        }
      }
    });
  }
}
