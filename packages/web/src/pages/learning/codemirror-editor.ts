import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { bracketMatching, HighlightStyle, syntaxHighlighting, syntaxTree, indentOnInput, indentUnit } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { python } from '@codemirror/lang-python';
import { tags, tagHighlighter, highlightCode } from '@lezer/highlight';

export interface CodeMirrorSetupOptions {
  textarea: HTMLTextAreaElement;
  indentationSpaces?: number;
  editorFontSize?: number;
  onModEnter: () => void;
  onEscape: () => void;
  onModShiftEnter?: () => void;
  onCursorChange?: (line: number, col: number) => void;
  onFontSizeChange?: (size: number) => void;
  onDocChange: (newCode: string) => void;
}

export interface CodeMirrorInstance {
  editorView: EditorView;
  setCode: (newCode: string) => void;
  undo: () => boolean;
  redo: () => boolean;
  setFontSize: (size: number) => number;
  getFontSize: () => number;
  destroy: () => void;
}

const FONT_SIZE_KEY = 'zur_editor_font_size';
const DEFAULT_FONT_SIZE = 14;

function readStoredFontSize(): number | null {
  try {
    const raw = window.localStorage.getItem(FONT_SIZE_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 10 && n <= 32 ? n : null;
  } catch {
    return null;
  }
}

function storeFontSize(size: number): void {
  try {
    window.localStorage.setItem(FONT_SIZE_KEY, String(size));
  } catch {
    // storage unavailable; size just won't persist
  }
}

const zurHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.definitionKeyword, tags.moduleKeyword, tags.operatorKeyword, tags.modifier], color: 'var(--syntax-keyword, #569cd6)' },
  { tag: tags.controlKeyword, color: 'var(--syntax-control, #c586c0)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--syntax-string, #ce9178)' },
  { tag: tags.escape, color: 'var(--syntax-number, #d7ba7d)' },
  { tag: tags.number, color: 'var(--syntax-number, #b5cea8)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.function(tags.variableName))], color: 'var(--syntax-function, #dcdcaa)' },
  { tag: [tags.className, tags.typeName, tags.definition(tags.className)], color: 'var(--syntax-type, #4ec9b0)' },
  { tag: [tags.variableName, tags.propertyName, tags.definition(tags.variableName), tags.definition(tags.propertyName)], color: 'var(--syntax-variable, #9cdcfe)' },
  { tag: tags.standard(tags.variableName), color: 'var(--syntax-builtin, #4fc1ff)' },
  { tag: tags.self, color: 'var(--syntax-keyword, #569cd6)', fontStyle: 'italic' },
  { tag: [tags.bool, tags.null], color: 'var(--syntax-keyword, #569cd6)' },
  { tag: tags.meta, color: 'var(--syntax-decorator, #dcdcaa)' },
  { tag: [tags.comment, tags.lineComment], color: 'var(--syntax-comment, #6a9955)', fontStyle: 'italic' },
  {
    tag: [tags.operator, tags.arithmeticOperator, tags.bitwiseOperator, tags.compareOperator, tags.updateOperator, tags.definitionOperator, tags.derefOperator, tags.punctuation, tags.separator, tags.bracket, tags.paren, tags.squareBracket, tags.brace],
    color: 'var(--syntax-operator, #d4d4d4)',
  },
]);

const PYTHON_BUILTINS = new Set([
  'print', 'len', 'range', 'int', 'str', 'float', 'bool', 'list', 'dict', 'set', 'tuple', 'input', 'open', 'type',
  'isinstance', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed', 'sum', 'min', 'max', 'abs', 'round', 'any',
  'all', 'super', 'object', 'repr', 'format', 'iter', 'next', 'id', 'hash', 'getattr', 'setattr', 'hasattr', 'callable',
  'chr', 'ord', 'bytes', 'frozenset', 'divmod', 'pow', 'Exception', 'ValueError', 'TypeError', 'KeyError', 'IndexError',
]);
const OPEN_BRACKETS = new Set(['(', '[', '{']);
const CLOSE_BRACKETS = new Set([')', ']', '}']);
const bracketDeco = [0, 1, 2].map((i) => Decoration.mark({ class: `cm-bracket-${i}` }));
const builtinDeco = Decoration.mark({ class: 'cm-builtin' });
const selfDeco = Decoration.mark({ class: 'cm-self' });
const decoratorDeco = Decoration.mark({ class: 'cm-decorator' });

function buildSemanticDecorations(view: EditorView): DecorationSet {
  const found: { from: number; to: number; deco: Decoration }[] = [];
  let depth = 0;
  syntaxTree(view.state).iterate({
    enter: (node) => {
      if (node.name === 'VariableName') {
        const text = view.state.sliceDoc(node.from, node.to);
        if (node.node.parent?.name === 'Decorator') found.push({ from: node.from, to: node.to, deco: decoratorDeco });
        else if (text === 'self' || text === 'cls') found.push({ from: node.from, to: node.to, deco: selfDeco });
        else if (PYTHON_BUILTINS.has(text)) found.push({ from: node.from, to: node.to, deco: builtinDeco });
      } else if (OPEN_BRACKETS.has(node.name)) {
        found.push({ from: node.from, to: node.to, deco: bracketDeco[depth % 3] });
        depth += 1;
      } else if (CLOSE_BRACKETS.has(node.name)) {
        depth = Math.max(0, depth - 1);
        found.push({ from: node.from, to: node.to, deco: bracketDeco[depth % 3] });
      }
    },
  });
  found.sort((a, b) => a.from - b.from);
  const builder = new RangeSetBuilder<Decoration>();
  for (const f of found) builder.add(f.from, f.to, f.deco);
  return builder.finish();
}

const semanticDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildSemanticDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = buildSemanticDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

const zurEditorTheme = EditorView.theme({
  '&.cm-editor.cm-editor': {
    backgroundColor: 'var(--editor-bg, #1e1e1e)',
    color: 'var(--syntax-default, #d4d4d4)',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace",
  },
  '&.cm-editor .cm-scroller': { lineHeight: '1.6' },
  '.cm-content': { padding: '8px 0', caretColor: 'var(--editor-cursor, #aeafad)' },
  '.cm-line': { padding: '0 12px' },
  '.cm-cursor, &.cm-focused .cm-cursor': { borderLeftColor: 'var(--editor-cursor, #aeafad)', borderLeftWidth: '2px' },
  '&.cm-editor .cm-gutters': {
    backgroundColor: 'var(--editor-bg, #1e1e1e)',
    color: 'var(--editor-gutter-fg, #858585)',
    border: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px 0 16px' },
  '&.cm-editor .cm-activeLine': { backgroundColor: 'var(--editor-active-line, #2a2d2e)' },
  '&.cm-editor .cm-activeLineGutter': { backgroundColor: 'var(--editor-active-line, #2a2d2e)', color: 'var(--syntax-default, #c6c6c6)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--editor-selection, #264f78)',
  },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--editor-selection, #264f78) 55%, transparent)' },
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--editor-gutter-fg, #858585) 35%, transparent)',
    outline: '1px solid var(--editor-gutter-fg, #858585)',
  },
  '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'rgba(244, 135, 113, 0.3)' },
  '.cm-bracket-0, .cm-bracket-0 *': { color: '#e6b800' },
  '.cm-bracket-1, .cm-bracket-1 *': { color: '#c75cc7' },
  '.cm-bracket-2, .cm-bracket-2 *': { color: '#179fff' },
  '.cm-builtin, .cm-builtin *': { color: 'var(--syntax-builtin, #4fc1ff)' },
  '.cm-self, .cm-self *': { color: 'var(--syntax-keyword, #569cd6)', fontStyle: 'italic' },
  '.cm-decorator, .cm-decorator *': { color: 'var(--syntax-decorator, #dcdcaa)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--editor-bg, #252526)',
    color: 'var(--syntax-default, #d4d4d4)',
    border: '1px solid var(--editor-gutter-fg, #454545)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--editor-selection, #04395e)',
    color: 'var(--syntax-default, #ffffff)',
  },
});

export function createCodeMirrorEditor(options: CodeMirrorSetupOptions): CodeMirrorInstance {
  const { textarea, indentationSpaces = 4, editorFontSize = DEFAULT_FONT_SIZE, onModEnter, onEscape, onDocChange, onModShiftEnter, onCursorChange, onFontSizeChange } = options;
  let suppressEditorChange = false;
  const initialFontSize = (editorFontSize === DEFAULT_FONT_SIZE ? readStoredFontSize() : null) ?? editorFontSize;
  let currentFontSize = initialFontSize;

  let editorViewRef: EditorView | null = null;
  const applyFontSize = (size: number): number => {
    currentFontSize = Math.max(10, Math.min(32, Math.round(size)));
    if (editorViewRef) {
      editorViewRef.dom.style.fontSize = `${currentFontSize}px`;
      editorViewRef.requestMeasure();
    }
    storeFontSize(currentFontSize);
    onFontSizeChange?.(currentFontSize);
    return currentFontSize;
  };

  textarea.classList.add('cm-source-backup');
  textarea.parentElement?.querySelector('.code-editor-line-numbers')?.remove();

  const editorView = new EditorView({
    state: EditorState.create({
      doc: textarea.value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        zurEditorTheme,
        semanticDecorations,
        EditorView.domEventHandlers({
          keydown(event, view) {
            if (!event.ctrlKey || event.altKey || event.metaKey || !['+', '=', '-'].includes(event.key)) return false;
            event.preventDefault();
            applyFontSize(currentFontSize + (event.key === '-' ? -2 : 2));
            return true;
          },
        }),
        history(),
        EditorState.tabSize.of(indentationSpaces),
        indentUnit.of(' '.repeat(indentationSpaces)),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        syntaxHighlighting(zurHighlightStyle),
        python(),
        keymap.of([
          {
            key: 'Mod-Shift-Enter',
            run: () => {
              onModShiftEnter?.();
              return true;
            },
          },
          {
            key: 'Mod-Enter',
            run: () => {
              onModEnter();
              return true;
            },
          },
          {
            key: 'Escape',
            run: () => {
              onEscape();
              return true;
            },
          },
          indentWithTab,
          ...closeBracketsKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.contentAttributes.of({
          'aria-label': 'Python Source Code',
          'aria-multiline': 'true',
        }),
        EditorView.updateListener.of((update) => {
          if (onCursorChange && (update.selectionSet || update.docChanged)) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            onCursorChange(line.number, head - line.from + 1);
          }
          if (!update.docChanged || suppressEditorChange) return;
          const val = update.state.doc.toString();
          textarea.value = val;
          onDocChange(val);
          textarea.dispatchEvent(new Event('input'));
        }),
      ],
    }),
    parent: textarea.parentElement || undefined,
  });

  editorViewRef = editorView;
  editorView.dom.style.fontSize = `${initialFontSize}px`;
  onCursorChange?.(1, 1);

  return {
    editorView,
    setCode: (newCode: string) => {
      suppressEditorChange = true;
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: newCode },
      });
      suppressEditorChange = false;
    },
    undo: () => undo(editorView),
    redo: () => redo(editorView),
    setFontSize: applyFontSize,
    getFontSize: () => currentFontSize,
    destroy: () => {
      editorView.destroy();
    },
  };
}

const staticHighlighter = tagHighlighter([
  { tag: [tags.keyword, tags.definitionKeyword, tags.moduleKeyword, tags.operatorKeyword, tags.modifier, tags.bool, tags.null, tags.self], class: 'zur-tok-keyword' },
  { tag: tags.controlKeyword, class: 'zur-tok-control' },
  { tag: [tags.string, tags.special(tags.string), tags.escape], class: 'zur-tok-string' },
  { tag: tags.number, class: 'zur-tok-number' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.function(tags.variableName))], class: 'zur-tok-function' },
  { tag: [tags.className, tags.typeName, tags.definition(tags.className)], class: 'zur-tok-type' },
  { tag: tags.standard(tags.variableName), class: 'zur-tok-builtin' },
  { tag: [tags.variableName, tags.propertyName, tags.definition(tags.variableName)], class: 'zur-tok-variable' },
  { tag: tags.meta, class: 'zur-tok-decorator' },
  { tag: [tags.comment, tags.lineComment], class: 'zur-tok-comment' },
  { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket, tags.paren, tags.squareBracket, tags.brace], class: 'zur-tok-operator' },
]);

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function highlightStaticPython(root: ParentNode): void {
  const parser = python().language.parser;
  root.querySelectorAll<HTMLElement>('pre > code.language-python, pre > code.language-py').forEach((codeEl) => {
    if (codeEl.dataset.highlighted === 'true') return;
    const source = codeEl.textContent || '';
    let html = '';
    highlightCode(
      source,
      parser.parse(source),
      staticHighlighter,
      (text, cls) => { html += cls ? `<span class="${cls}">${escapeText(text)}</span>` : escapeText(text); },
      () => { html += '\n'; },
    );
    codeEl.innerHTML = html;
    codeEl.dataset.highlighted = 'true';
  });
}
