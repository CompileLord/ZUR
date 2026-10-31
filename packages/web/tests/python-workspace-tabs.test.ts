import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWorkspaceTab } from '../src/app/pages/python-workspace-tabs.ts';
import { renderPythonWorkspacePage } from '../src/pages/learning/PythonWorkspacePage.ts';

function fakeWorkspace() {
  const state = { drawerOpen: false, focused: '' as string, resultsRendered: 0 };
  const body: any = { innerHTML: '' };
  const input: any = { value: '', focus() { state.focused = 'custom-stdin-input'; } };
  const doc: any = {
    getElementById: (id: string) => (id === 'custom-stdin-input' && body.innerHTML.includes('custom-stdin-input') ? input : null),
    querySelector: (selector: string) => (selector === '.results-body' ? body : null),
    querySelectorAll: () => [],
  };
  const ctx: any = {
    activeTab: 'results',
    customStdin: 'previous input',
    runShortcutText: 'Ctrl+Enter',
    setDrawerOpen: (open: boolean) => { state.drawerOpen = open; },
    setResults: () => { state.resultsRendered++; },
  };
  return { state, ctx, doc, input };
}

test('choosing the custom input tab expands the drawer and focuses the input', () => {
  const { state, ctx, doc, input } = fakeWorkspace();
  selectWorkspaceTab(ctx, 'custom_input', doc);
  assert.equal(state.drawerOpen, true);
  assert.equal(state.focused, 'custom-stdin-input');
  assert.equal(ctx.activeTab, 'custom_input');
  assert.equal(input.value, 'previous input');
});

test('choosing the results tab also expands a closed drawer', () => {
  const { state, ctx, doc } = fakeWorkspace();
  selectWorkspaceTab(ctx, 'results', doc);
  assert.equal(state.drawerOpen, true);
  assert.equal(state.resultsRendered, 1);
});

test('a workspace opened on the custom input tab renders its drawer open', () => {
  const base: any = {
    courseTitle: 'Python Foundations', courseOverviewUrl: '/courses/c-1', lessonTitle: 'Conditions', stepTitle: 'Check',
    stepOrdinalText: 'Step 3 of 5', enrollmentId: 'enr-1', stepId: 'step-6', problemStatement: 'Read an integer.',
    inputFormat: 'A single integer.', outputFormat: 'Even or Odd.', constraints: 'none', starterCode: '# write code\n',
    currentCode: 'print(1)\n', hints: [], solutionExplanation: 'x', examples: [{ input: '4', output: 'Even' }],
    activeTab: 'custom_input',
  };
  assert.match(renderPythonWorkspacePage(base), /data-drawer="open"/);
  assert.match(renderPythonWorkspacePage({ ...base, activeTab: 'results' }), /data-drawer="closed"/);
});

test('the editor offers one font size control, in the footer next to the current size', () => {
  const html = renderPythonWorkspacePage({
    courseTitle: 'Python Foundations', courseOverviewUrl: '/courses/c-1', lessonTitle: 'Conditions', stepTitle: 'Check',
    stepOrdinalText: 'Step 3 of 5', enrollmentId: 'enr-1', stepId: 'step-6', problemStatement: 'Read an integer.',
    inputFormat: 'A single integer.', outputFormat: 'Even or Odd.', constraints: 'none', starterCode: '# write code\n',
    currentCode: 'print(1)\n', hints: [], solutionExplanation: 'x', examples: [], editorFontSize: 16,
  } as any);
  assert.equal(html.match(/data-font-step="-1"/g)?.length, 1);
  assert.equal(html.match(/data-font-step="1"/g)?.length, 1);
  assert.match(html, /id="editor-font-size-label"[^>]*>16px</);
});
