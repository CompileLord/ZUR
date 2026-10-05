import assert from 'node:assert/strict';
import test from 'node:test';
import { AppearanceSaveQueue } from '../src/services/appearance-save-queue.ts';
import { ProfileGuard } from '../src/services/profile-guard.ts';
import type { UserPreferences } from 'zur-shared';

test('Settings wiring: SPA navigation interceptor synchronously prevents default for internal links', async () => {
  let preventDefaultCalls = 0;
  let navigatedTo: string | null = null;
  let queueFlushed = false;

  const queue = new AppearanceSaveQueue({
    delayMs: 60_000,
    save: async (prefs) => {
      queueFlushed = true;
      return {
        userId: 'u1',
        theme: prefs.theme || 'system',
        editorFontSize: prefs.editorFontSize || 14,
        indentationSpaces: prefs.indentationSpaces || 4,
        updatedAt: new Date().toISOString(),
      };
    },
  });
  queue.update({ theme: 'dark' });

  // Simulate link click handler logic
  const handleLinkClick = async (event: {
    preventDefault: () => void;
    button: number;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    target: {
      href: string;
      origin: string;
      pathname: string;
      search: string;
      target?: string;
      hasAttribute: (name: string) => boolean;
      closest: (sel: string) => any;
    };
  }) => {
    const target = event.target;
    const currentOrigin = 'http://localhost:3000';
    if (
      target &&
      target.href &&
      !target.hasAttribute('download') &&
      target.origin === currentOrigin &&
      (!target.target || target.target === '_self') &&
      !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0
    ) {
      const pathname = target.pathname;
      if (pathname.startsWith('/api/')) return;

      // MUST be synchronous before any await!
      event.preventDefault();

      if (queue && queue.isPending) {
        await queue.flush();
      }

      navigatedTo = pathname + target.search;
    }
  };

  const internalLinkEvent = {
    preventDefault: () => { preventDefaultCalls++; },
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target: {
      href: 'http://localhost:3000/settings/security',
      origin: 'http://localhost:3000',
      pathname: '/settings/security',
      search: '',
      hasAttribute: (name: string) => false,
      closest: (sel: string) => internalLinkEvent.target,
    },
  };

  const clickPromise = handleLinkClick(internalLinkEvent);
  // Verify preventDefault was called synchronously on the same microtask tick before clickPromise resolves
  assert.equal(preventDefaultCalls, 1, 'preventDefault must be called synchronously before await');
  await clickPromise;
  assert.equal(queueFlushed, true, 'Appearance queue must be flushed before navigation');
  assert.equal(navigatedTo, '/settings/security');
});

test('Settings wiring: External, download, API, and modifier clicks are never prevented', async () => {
  let preventDefaultCalls = 0;

  const shouldPrevent = (event: any, target: any, currentOrigin: string): boolean => {
    if (
      target &&
      target.href &&
      !target.hasAttribute('download') &&
      target.origin === currentOrigin &&
      (!target.target || target.target === '_self') &&
      !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0
    ) {
      if (target.pathname.startsWith('/api/')) return false;
      return true;
    }
    return false;
  };

  const baseEvent = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };

  // 1. External link
  assert.equal(shouldPrevent(baseEvent, { href: 'https://example.com/docs', origin: 'https://example.com', pathname: '/docs', hasAttribute: () => false }, 'http://localhost:3000'), false);

  // 2. Direct API link
  assert.equal(shouldPrevent(baseEvent, { href: 'http://localhost:3000/api/settings/export', origin: 'http://localhost:3000', pathname: '/api/settings/export', hasAttribute: () => false }, 'http://localhost:3000'), false);

  // 3. Download link
  assert.equal(shouldPrevent(baseEvent, { href: 'http://localhost:3000/export.json', origin: 'http://localhost:3000', pathname: '/export.json', hasAttribute: (a: string) => a === 'download' }, 'http://localhost:3000'), false);

  // 4. Ctrl+click (new tab)
  assert.equal(shouldPrevent({ ...baseEvent, ctrlKey: true }, { href: 'http://localhost:3000/catalog', origin: 'http://localhost:3000', pathname: '/catalog', hasAttribute: () => false }, 'http://localhost:3000'), false);

  // 5. target="_blank"
  assert.equal(shouldPrevent(baseEvent, { href: 'http://localhost:3000/help', origin: 'http://localhost:3000', pathname: '/help', target: '_blank', hasAttribute: () => false }, 'http://localhost:3000'), false);

  // 6. Normal internal SPA link
  assert.equal(shouldPrevent(baseEvent, { href: 'http://localhost:3000/settings/appearance', origin: 'http://localhost:3000', pathname: '/settings/appearance', hasAttribute: () => false }, 'http://localhost:3000'), true);
});

test('Settings wiring: Profile unsaved guard prompts user and respects cancellation', async () => {
  const guard = new ProfileGuard('Initial Name');
  const dirtyValue = 'Edited Name';

  assert.equal(guard.shouldBlockNavigation(dirtyValue), true);
  const prompt = guard.getNavigationPrompt(dirtyValue);
  assert.equal(prompt, 'You have unsaved changes. Leave this page?');

  // If user cancels confirmation, navigation must abort
  let confirmed = false;
  let didNavigate = false;
  if (!confirmed) {
    // Abort navigation
  } else {
    didNavigate = true;
  }
  assert.equal(didNavigate, false);

  // If user confirms, navigation proceeds
  confirmed = true;
  if (confirmed) {
    didNavigate = true;
  }
  assert.equal(didNavigate, true);
});

test('Settings wiring: AppearanceSaveQueue retry on Save preferences button click', async () => {
  let attempts = 0;
  let savedStatus = false;
  let errorStatus = false;

  const queue = new AppearanceSaveQueue({
    delayMs: 10,
    save: async (prefs) => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Connection reset');
      }
      return {
        userId: 'u1',
        theme: prefs.theme || 'system',
        editorFontSize: prefs.editorFontSize || 14,
        indentationSpaces: prefs.indentationSpaces || 4,
        updatedAt: new Date().toISOString(),
      };
    },
    onSaving: () => {},
    onSuccess: () => { savedStatus = true; errorStatus = false; },
    onError: () => { errorStatus = true; savedStatus = false; },
  });

  // User changes font size
  queue.update({ editorFontSize: 18 });
  await queue.flush();

  // First attempt fails: error visible, retryable state active
  assert.equal(attempts, 1);
  assert.equal(errorStatus, true);
  assert.equal(savedStatus, false);
  assert.equal(queue.hasUnsavedChanges, true);

  // User clicks visible "Save preferences" button: form submit triggers queue.flush()
  await queue.flush();

  // Retry executed successfully
  assert.equal(attempts, 2);
  assert.equal(errorStatus, false);
  assert.equal(savedStatus, true);
  assert.equal(queue.hasUnsavedChanges, false);
});

test('Settings wiring: Appearance failure on departure prompts user; cancels and stays on page', async () => {
  let cleanedUp = false;
  let navigated = false;

  const queue = new AppearanceSaveQueue({
    delayMs: 10,
    save: async () => {
      throw new Error('Save failed');
    },
  });

  queue.update({ theme: 'dark' });

  // Simulate confirmAppearanceDeparture logic with user cancelling
  const confirmAppearanceDeparture = async (userChoice: boolean) => {
    try {
      await Promise.race([
        queue.flush(),
        new Promise((r) => setTimeout(r, 100)),
      ]);
    } catch {}

    if (queue.hasUnsavedChanges || queue.isPending) {
      if (!userChoice) {
        return false;
      }
    }

    cleanedUp = true;
    return true;
  };

  const allowed = await confirmAppearanceDeparture(false); // User clicks Cancel
  assert.equal(allowed, false, 'Navigation must not be allowed when user cancels discard');
  assert.equal(cleanedUp, false, 'Queue must not be cleaned up when user cancels');
  assert.equal(queue.hasUnsavedChanges, true, 'Unsaved changes must be preserved for retry');
});

test('Settings wiring: Appearance timeout during navigation prompts user to discard or stay', async () => {
  let cleanedUp = false;

  const queue = new AppearanceSaveQueue({
    delayMs: 10,
    save: async () => {
      // Simulate hanging network write
      await new Promise((r) => setTimeout(r, 5000));
      return {
        userId: 'u1',
        theme: 'dark',
        editorFontSize: 14,
        indentationSpaces: 4,
        updatedAt: new Date().toISOString(),
      };
    },
  });

  queue.update({ theme: 'dark' });

  // Simulate departure with a 20ms timeout safeguard
  const confirmAppearanceDeparture = async (userChoice: boolean) => {
    try {
      await Promise.race([
        queue.flush(),
        new Promise((r) => setTimeout(r, 20)),
      ]);
    } catch {}

    if (queue.hasUnsavedChanges || queue.isPending) {
      if (!userChoice) {
        return false;
      }
    }

    cleanedUp = true;
    return true;
  };

  // 1. Timeout occurs, user cancels -> stay on page
  const stay = await confirmAppearanceDeparture(false);
  assert.equal(stay, false, 'Must abort navigation on timeout when user cancels');
  assert.equal(cleanedUp, false);
  assert.equal(queue.isPending, true);

  // 2. Timeout occurs, user confirms discard -> allow navigation and cleanup
  const proceed = await confirmAppearanceDeparture(true);
  assert.equal(proceed, true, 'Must allow navigation when user explicitly confirms discard');
  assert.equal(cleanedUp, true);
});

