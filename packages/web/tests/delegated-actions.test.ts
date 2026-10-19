import test from 'node:test';
import assert from 'node:assert/strict';
import { toActionFnName, handleDelegatedClick } from '../src/services/delegated-actions.ts';
import { renderSaveFailureAlert, renderConflictComparisonModal } from '../src/components/states/UniversalStates.ts';

test('toActionFnName accepts identifiers and strips call parens, rejects expressions', () => {
  assert.equal(toActionFnName('retrySave()'), 'retrySave');
  assert.equal(toActionFnName('app.retry'), 'app.retry');
  assert.equal(toActionFnName('alert(1);evil()'), '');
  assert.equal(toActionFnName('x" onmouseover="y'), '');
});

test('state templates emit no inline onclick', () => {
  const html = renderSaveFailureAlert('retrySave()') + renderConflictComparisonModal({ localContent: 'a', serverContent: 'b', currentRevision: 2, onKeepLocal: 'keep()', onAcceptServer: 'take()' });
  assert.ok(!html.includes('onclick'));
  assert.ok(html.includes('data-action-fn="retrySave"'));
  assert.ok(html.includes('data-action-fn="keep"') && html.includes('data-action-fn="take"'));
});

test('handleDelegatedClick runs go-back, named function, and ignores unrelated clicks', () => {
  const mk = (dataset: Record<string, string>) => ({ closest: () => ({ dataset, parentElement: null, classList: { add() {} } }) });
  let backs = 0; const win: any = { history: { length: 2, back: () => { backs++; } }, location: { href: '' }, called: 0 };
  win.fn = () => { win.called++; };
  assert.equal(handleDelegatedClick({ target: mk({ action: 'go-back' }) } as any, win), true);
  assert.equal(backs, 1);
  win.history.length = 1;
  handleDelegatedClick({ target: mk({ action: 'go-back' }) } as any, win);
  assert.equal(win.location.href, '/courses');
  assert.equal(handleDelegatedClick({ target: mk({ actionFn: 'fn' }) } as any, win), true);
  assert.equal(win.called, 1);
  assert.equal(handleDelegatedClick({ target: { closest: () => null } } as any, win), false);
});
