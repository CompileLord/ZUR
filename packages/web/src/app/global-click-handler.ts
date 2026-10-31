import { confirmLeaveDialog } from '../components/common/Dialog.ts';
import { safeSessionStorageRemove } from './helpers.ts';
import { confirmAppearanceDeparture, confirmUnsyncedSignOut } from './leave-guards.ts';
import { renderApp, navigateTo } from './navigation.ts';
import { clearAdminDialogState } from './pages/admin-document-handlers.ts';
import { app, courseClient, authClient } from './state.ts';

export function installGlobalClickHandlers(): void {
  document.addEventListener('click', async (e) => {
    const outlineToggle = (e.target as HTMLElement).closest('.outline-toggle-btn');
    if (outlineToggle) {
      const drawer = document.getElementById('course-outline-panel');
      const open = drawer?.classList.toggle('open') || false;
      outlineToggle.setAttribute('aria-expanded', String(open));
      return;
    }

    const retry=(e.target as HTMLElement).closest('[data-admin-retry]');
    if(retry){renderApp(window.location.pathname+window.location.search);return;}

    const openDialogBtn = (e.target as HTMLElement).closest('[data-open-dialog]') as HTMLElement | null;
    if (openDialogBtn) {
      app.lastActiveAdminTrigger = openDialogBtn;
      const dialogId = openDialogBtn.dataset.openDialog;
      const dialog = dialogId ? (document.getElementById(dialogId) as HTMLDialogElement | null) : null;
      if (dialog && typeof dialog.showModal === 'function') {
        clearAdminDialogState(dialog);
        dialog.showModal();
      }
      return;
    }

    const closeDialogBtn = (e.target as HTMLElement).closest('[data-close-dialog]') as HTMLElement | null;
    if (closeDialogBtn) {
      const dialog = closeDialogBtn.closest('dialog') as HTMLDialogElement | null;
      if (dialog && typeof dialog.close === 'function') {
        clearAdminDialogState(dialog);
        dialog.close();
      }
      return;
    }

    const editCatBtn = (e.target as HTMLElement).closest('[data-edit-category-id]') as HTMLElement | null;
    if (editCatBtn) {
      app.lastActiveAdminTrigger = editCatBtn;
      const id = editCatBtn.dataset.editCategoryId;
      const name = editCatBtn.dataset.editCategoryName || '';
      const dialog = document.getElementById('edit-category-dialog') as HTMLDialogElement | null;
      if (dialog) {
        clearAdminDialogState(dialog);
        const editForm = dialog.querySelector('#edit-category-form') as HTMLFormElement | null;
        if (editForm) {
          editForm.reset();
          if (id) editForm.action = `/api/admin/categories/${encodeURIComponent(id)}`;
        }
        const nameInput = dialog.querySelector('#edit-category-name') as HTMLInputElement | null;
        if (nameInput) nameInput.value = name;
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        }
      }
      return;
    }

    const removeCatBtn = (e.target as HTMLElement).closest('[data-remove-category-id]') as HTMLElement | null;
    if (removeCatBtn) {
      app.lastActiveAdminTrigger = removeCatBtn;
      const id = removeCatBtn.dataset.removeCategoryId;
      const name = removeCatBtn.dataset.removeCategoryName || '';
      const usage = Number(removeCatBtn.dataset.removeCategoryUsage || 0);
      const dialog = document.getElementById('remove-category-dialog') as HTMLDialogElement | null;
      if (dialog) {
        clearAdminDialogState(dialog);
        const deleteForm = dialog.querySelector('#delete-category-form') as HTMLFormElement | null;
        if (deleteForm) {
          deleteForm.reset();
          if (id) deleteForm.action = `/api/admin/categories/${encodeURIComponent(id)}`;
        }

        const targetName = dialog.querySelector('#remove-category-target-name');
        if (targetName) targetName.textContent = name;
        const targetUsage = dialog.querySelector('#remove-category-target-usage');
        if (targetUsage) targetUsage.textContent = String(usage);

        const usageWarning = dialog.querySelector('#edit-category-usage-warning') as HTMLElement | null;
        const consequenceWarning = dialog.querySelector('#remove-category-consequence-warning') as HTMLElement | null;

        if (usage > 0) {
          if (usageWarning) {
            usageWarning.textContent = `In use by ${usage} course(s). Reassign before removal.`;
            usageWarning.classList.remove('hidden');
          }
          if (consequenceWarning) consequenceWarning.textContent = `This category is currently in use by ${usage} course(s). Select an eligible replacement category to reassign all courses before removing this category. This action cannot be undone.`;
        } else {
          if (usageWarning) {
            usageWarning.textContent = 'Not currently in use by any courses.';
            usageWarning.classList.add('hidden');
          }
          if (consequenceWarning) consequenceWarning.textContent = 'This category has no courses assigned. Removing it will permanently delete it from public discovery. This action cannot be undone.';
        }

        const replaceGroup = dialog.querySelector('#replacement-category-group') as HTMLElement | null;
        const replaceSelect = dialog.querySelector('#edit-category-replacement-select, [name="replacementId"]') as HTMLSelectElement | null;
        const submitBtn = dialog.querySelector('button[type="submit"]') as HTMLButtonElement | null;

        let allCategories: Array<{ id: string; name: string; usageCount?: number }> = [];
        if (dialog.dataset.categoryItems) {
          try {
            allCategories = JSON.parse(dialog.dataset.categoryItems);
          } catch {}
        }
        if (!allCategories.length) {
          const catButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-edit-category-id]'));
          allCategories = catButtons.map((btn) => ({
            id: btn.dataset.editCategoryId || '',
            name: btn.dataset.editCategoryName || '',
            usageCount: Number(btn.dataset.editCategoryUsage || 0),
          }));
        }

        const eligible = allCategories.filter((c) => c.id && c.id !== id);

        if (replaceSelect) {
          replaceSelect.innerHTML = '';
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = eligible.length ? 'Select a replacement category…' : 'No eligible replacement categories';
          replaceSelect.appendChild(defaultOpt);

          for (const cat of eligible) {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = `${cat.name} (${cat.id})`;
            replaceSelect.appendChild(opt);
          }
        }

        if (usage > 0) {
          if (replaceGroup) replaceGroup.classList.remove('hidden');
          if (replaceSelect) {
            replaceSelect.required = true;
            replaceSelect.value = '';
          }
          if (submitBtn) {
            submitBtn.disabled = true;
          }
        } else {
          if (replaceGroup) replaceGroup.classList.add('hidden');
          if (replaceSelect) {
            replaceSelect.required = false;
            replaceSelect.value = '';
          }
          if (submitBtn) {
            submitBtn.disabled = false;
          }
        }

        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        }
      }
      return;
    }

    const copyBtn = (e.target as HTMLElement).closest('[data-copy-text]') as HTMLElement | null;
    if (copyBtn) {
      const text = copyBtn.dataset.copyText;
      if (text) {
        const originalTitle = copyBtn.getAttribute('title') || '';
        if (!navigator.clipboard?.writeText) {
          copyBtn.setAttribute('title', 'Clipboard unavailable');
          setTimeout(() => copyBtn.setAttribute('title', originalTitle), 2000);
          return;
        }
        navigator.clipboard.writeText(text).then(
          () => {
            copyBtn.setAttribute('title', 'Copied!');
            setTimeout(() => copyBtn.setAttribute('title', originalTitle), 1500);
          },
          () => {
            copyBtn.setAttribute('title', 'Copy failed');
            setTimeout(() => copyBtn.setAttribute('title', originalTitle), 2000);
          }
        );
      }
      return;
    }

    if ((e.target as HTMLElement).tagName === 'DIALOG') {
      const dialog = e.target as HTMLDialogElement;
      if (dialog.classList.contains('admin-modal-dialog')) {
        const rect = dialog.getBoundingClientRect();
        const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height
          && rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
        if (!isInDialog && typeof dialog.close === 'function') {
          clearAdminDialogState(dialog);
          dialog.close();
        }
      }
    }
    const hintTrigger = (e.target as HTMLElement).closest('.hint-trigger') as HTMLButtonElement | null;
    if (hintTrigger) {
      const isExpanded = hintTrigger.getAttribute('aria-expanded') === 'true';
      const accordion = hintTrigger.closest('.hint-accordion');
      const content = accordion?.querySelector('.hint-content') as HTMLElement | null;
      const chevron = hintTrigger.querySelector('.hint-chevron');

      if (isExpanded) {
        hintTrigger.setAttribute('aria-expanded', 'false');
        if (content) content.hidden = true;
        if (chevron) chevron.textContent = '▼';
      } else {
        hintTrigger.setAttribute('aria-expanded', 'true');
        if (content) content.hidden = false;
        if (chevron) chevron.textContent = '▲';
        const nextHint = accordion?.nextElementSibling as HTMLElement | null;
        if (nextHint?.classList.contains('hint-accordion')) nextHint.hidden = false;

        // Telemetry on actual validated reveal: only record once per hint reveal to prevent fabricated duplicate analytics
        if (!hintTrigger.hasAttribute('data-revealed')) {
          hintTrigger.setAttribute('data-revealed', 'true');
          const enrollmentId = hintTrigger.getAttribute('data-enrollment-id') || hintTrigger.closest('[data-enrollment-id]')?.getAttribute('data-enrollment-id');
          const stepId = hintTrigger.getAttribute('data-step-id') || hintTrigger.closest('[data-step-id]')?.getAttribute('data-step-id');
          const hintIndex = Number(hintTrigger.getAttribute('data-hint-index'));
          if (enrollmentId && stepId && !isNaN(hintIndex)) {
            courseClient.revealHint(enrollmentId, stepId, hintIndex).catch((err) => {
              console.warn('Failed to record hint reveal event', err);
            });
          }
        }
      }
      return;
    }

    const target = (e.target as HTMLElement).closest('a');
    if (
      target &&
      target.href &&
      !e.defaultPrevented &&
      !target.classList.contains('report-issue-link') &&
      !target.hasAttribute('download') &&
      target.origin === window.location.origin &&
      (!target.target || target.target === '_self') &&
      !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0
    ) {
      const pathname = target.pathname;
      if (pathname.startsWith('/api/')) return; // Allow direct API endpoints

      // Same-document fragment navigation (e.g. #main-content skip link)
      const rawHref = target.getAttribute('href') || '';
      if (rawHref.startsWith('#') || (target.hash && target.pathname === window.location.pathname && target.search === window.location.search)) {
        e.preventDefault();
        const hash = target.hash || (rawHref.startsWith('#') ? rawHref : '');
        const targetId = hash.replace(/^#/, '');
        if (targetId) {
          const targetElem = document.getElementById(targetId);
          if (targetElem) {
            if (!targetElem.hasAttribute('tabindex')) {
              targetElem.setAttribute('tabindex', '-1');
            }
            targetElem.focus();
            targetElem.scrollIntoView?.({ block: 'start' });
          }
        }
        return;
      }

      // Synchronously prevent default for all internal SPA navigation before any async operations
      e.preventDefault();

      // Author dirty check
      const dirtyAuthorShell = document.querySelector('.shell-author.is-dirty');
      if (dirtyAuthorShell) {
        const confirmed = await confirmLeaveDialog({ message: 'You have unsaved changes on this page. If you leave now they will be lost.' });
        if (!confirmed) {
          return; // Stay on current page, default already prevented
        }
        dirtyAuthorShell.classList.remove('is-dirty');
      }

      // Profile guard check
      if (app.activeProfileGuard) {
        const profileInput = document.querySelector('#profile-settings-form input[name="displayName"]') as HTMLInputElement | null;
        const currentVal = profileInput ? profileInput.value : '';
        const promptMsg = app.activeProfileGuard.getNavigationPrompt(currentVal);
        if (promptMsg) {
          if (!await confirmLeaveDialog({ message: promptMsg })) {
            return; // Stay on current page, default already prevented
          }
          const user = authClient.getUser();
          if (user) {
            safeSessionStorageRemove(`zur_profile_draft_${user.id}`);
          }
          if (app.activeProfileCleanup) {
            app.activeProfileCleanup();
            app.activeProfileCleanup = null;
          }
        }
      }

      // Appearance departure check
      const canLeaveAppearance = await confirmAppearanceDeparture(2000);
      if (!canLeaveAppearance) {
        return; // Stay on appearance settings page
      }

      if (pathname === '/sign-out') {
        const user = authClient.getUser();
        void (async () => {
          if (user && !await confirmUnsyncedSignOut(user.id)) return;
          await authClient.signOut();
          navigateTo('/sign-in');
        })();
        return;
      }

      navigateTo(pathname + target.search);
    }
  });

  document.addEventListener('click', (event) => {
    if ((event.target as HTMLElement | null)?.closest('[data-route-retry]')) {
      event.preventDefault();
      renderApp();
    }
  });
}
