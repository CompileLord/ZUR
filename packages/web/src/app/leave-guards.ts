import { DraftManager } from '../services/draft-manager.ts';
import { app } from './state.ts';

export async function confirmUnsyncedSignOut(userId: string): Promise<boolean> {
  if (!DraftManager.hasUnsyncedWork(userId)) return true;
  return new Promise<boolean>((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal-dialog';
    dialog.setAttribute('aria-labelledby', 'unsynced-signout-title');
    const title = document.createElement('h2');
    title.id = 'unsynced-signout-title';
    title.textContent = 'Unsynchronized code';
    const description = document.createElement('p');
    description.textContent = 'Some code is stored only on this device. Choose whether to synchronize it or discard it before signing out.';
    const error = document.createElement('p');
    error.className = 'form-error';
    error.setAttribute('role', 'alert');
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const button = (label: string, className: string) => {
      const element = document.createElement('button');
      element.type = 'button'; element.className = className; element.textContent = label;
      actions.append(element); return element;
    };
    const cancel = button('Keep editing', 'btn btn-ghost');
    const discard = button('Discard local code and sign out', 'btn btn-secondary');
    const sync = button('Synchronize and sign out', 'btn btn-primary');
    dialog.append(title, description, error, actions);
    document.body.append(dialog);
    const finish = (accepted: boolean) => { dialog.close(); dialog.remove(); resolve(accepted); };
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); });
    cancel.addEventListener('click', () => finish(false));
    discard.addEventListener('click', () => finish(true));
    sync.addEventListener('click', async () => {
      sync.disabled = true;
      error.textContent = '';
      try { await DraftManager.syncUnsyncedWork(userId); finish(true); }
      catch (problem: any) { error.textContent = problem?.message || 'Could not synchronize code. Keep editing or explicitly discard it.'; sync.disabled = false; }
    });
    dialog.showModal();
    sync.focus();
  });
}

export async function confirmAppearanceDeparture(timeoutMs = 2000): Promise<boolean> {
  if (!app.activeAppearanceQueue || (!app.activeAppearanceQueue.isPending && !app.activeAppearanceQueue.hasUnsavedChanges)) {
    if (app.activeAppearanceCleanup) {
      app.activeAppearanceCleanup();
      app.activeAppearanceCleanup = null;
    }
    return true;
  }

  try {
    await Promise.race([
      app.activeAppearanceQueue.flush(),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch (err) {
    console.warn('Failed to flush appearance preferences before navigation', err);
  }

  if (app.activeAppearanceQueue.hasUnsavedChanges || app.activeAppearanceQueue.isPending) {
    const discard = window.confirm(
      'Appearance settings could not be saved. Leave this page and discard unsaved preferences?'
    );
    if (!discard) {
      return false; // User wants to stay on appearance page to retry
    }
  }

  if (app.activeAppearanceCleanup) {
    app.activeAppearanceCleanup();
    app.activeAppearanceCleanup = null;
  }
  return true;
}
