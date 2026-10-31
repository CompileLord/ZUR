import test from 'node:test';
import assert from 'node:assert/strict';
import { trapDialogFocus } from '../src/services/dialog-focus.ts';

function fakeDialog(count: number) {
  const items = Array.from({ length: count }, (_, i) => ({ name: `item${i}`, focus() { doc.activeElement = this; } }));
  const modal: any = { isConnected: true, querySelectorAll: () => items, contains: (el: unknown) => items.includes(el as any) };
  const listeners: Record<string, Function> = {};
  const doc: any = {
    activeElement: null,
    addEventListener: (type: string, fn: Function) => { listeners[type] = fn; },
    removeEventListener: (type: string, fn: Function) => { if (listeners[type] === fn) delete listeners[type]; },
  };
  const press = (key: string, shiftKey = false) => {
    let prevented = false;
    listeners.keydown?.({ key, shiftKey, preventDefault: () => { prevented = true; }, stopPropagation() {} });
    return prevented;
  };
  return { items, modal, doc, press, listeners };
}

test('Tab and Shift+Tab wrap inside the dialog', () => {
  const { items, modal, doc, press } = fakeDialog(3);
  trapDialogFocus(modal, { onEscape() {} }, doc);
  items[2].focus();
  assert.equal(press('Tab'), true);
  assert.equal(doc.activeElement, items[0]);
  assert.equal(press('Tab', true), true);
  assert.equal(doc.activeElement, items[2]);
});

test('Tab from outside the dialog pulls focus back in', () => {
  const { items, modal, doc, press } = fakeDialog(2);
  trapDialogFocus(modal, { onEscape() {} }, doc);
  doc.activeElement = { name: 'outside' };
  assert.equal(press('Tab'), true);
  assert.equal(doc.activeElement, items[0]);
});

test('Escape calls onEscape', () => {
  const { modal, doc, press } = fakeDialog(2);
  let closed = 0;
  trapDialogFocus(modal, { onEscape: () => { closed++; } }, doc);
  assert.equal(press('Escape'), true);
  assert.equal(closed, 1);
});

test('release removes the listener and returns focus to the opener', () => {
  const { modal, doc, press, listeners } = fakeDialog(2);
  const opener: any = { focus() { doc.activeElement = opener; } };
  doc.activeElement = opener;
  const release = trapDialogFocus(modal, { onEscape() {} }, doc);
  doc.activeElement = { name: 'inside' };
  release();
  assert.equal(doc.activeElement, opener);
  assert.equal(listeners.keydown, undefined);
  assert.equal(press('Tab'), false);
});

test('a dialog removed from the page stops trapping focus', () => {
  const { modal, doc, press, listeners } = fakeDialog(2);
  trapDialogFocus(modal, { onEscape() {} }, doc);
  modal.isConnected = false;
  assert.equal(press('Tab'), false);
  assert.equal(listeners.keydown, undefined);
});
