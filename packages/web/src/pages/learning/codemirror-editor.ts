import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { bracketMatching, HighlightStyle, syntaxHighlighting, indentOnInput, indentUnit } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { python } from '@codemirror/lang-python';
import { tags } from '@lezer/highlight';

export interface CodeMirrorSetupOptions {
  textarea: HTMLTextAreaElement;
  indentationSpaces?: number;
  editorFontSize?: number;
  onModEnter: () => void;
  onEscape: () => void;
  onDocChange: (newCode: string) => void;
}

export interface CodeMirrorInstance {
  editorView: EditorView;
  setCode: (newCode: string) => void;
  destroy: () => void;
}

export function createCodeMirrorEditor(options: CodeMirrorSetupOptions): CodeMirrorInstance {
  const { textarea, indentationSpaces = 4, editorFontSize = 14, onModEnter, onEscape, onDocChange } = options;
  let suppressEditorChange = false;

  textarea.classList.add('cm-source-backup');
  textarea.parentElement?.querySelector('.code-editor-line-numbers')?.remove();

  const editorView = new EditorView({
    state: EditorState.create({
      doc: textarea.value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        highlightActiveLine(),
        EditorState.tabSize.of(indentationSpaces),
        indentUnit.of(' '.repeat(indentationSpaces)),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        syntaxHighlighting(
          HighlightStyle.define([
            { tag: tags.keyword, color: 'var(--syntax-keyword)' },
            { tag: tags.string, color: 'var(--syntax-string)' },
            { tag: tags.number, color: 'var(--syntax-number)' },
            { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--syntax-function)' },
            { tag: tags.comment, color: 'var(--syntax-comment)' },
          ])
        ),
        python(),
        keymap.of([
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

  editorView.dom.style.fontSize = `${editorFontSize}px`;

  return {
    editorView,
    setCode: (newCode: string) => {
      suppressEditorChange = true;
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: newCode },
      });
      suppressEditorChange = false;
    },
    destroy: () => {
      editorView.destroy();
    },
  };
}
