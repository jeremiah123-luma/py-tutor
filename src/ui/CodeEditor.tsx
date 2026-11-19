import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { EditorView, Decoration, type DecorationSet } from '@codemirror/view';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting, indentUnit } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const theme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--code-bg)',
    color: 'var(--syn-name)',
    fontSize: '15px',
    height: '100%',
  },
  '.cm-scroller': { fontFamily: 'var(--font-code)', lineHeight: '1.7' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 16px 0 8px' },
  '.cm-gutters': {
    backgroundColor: 'var(--code-bg)',
    color: 'var(--ink-3)',
    border: 'none',
    paddingLeft: '8px',
  },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '24px', padding: '0 8px 0 0' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-2)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--hl) 70%, transparent) !important',
  },
  '.cm-matchingBracket': { backgroundColor: 'var(--surface-2)', outline: '1px solid var(--line-strong)' },
  '.cm-hl-line': { borderRadius: '4px' },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.operatorKeyword, t.bool, t.null], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syn-string)' },
  { tag: [t.number], color: 'var(--syn-number)' },
  { tag: [t.comment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.className, t.definition(t.className)], color: 'var(--syn-func)' },
  { tag: [t.self], color: 'var(--syn-keyword)', fontStyle: 'italic' },
]);

function lineDecorations(active: number[], dimOthers: boolean): Extension {
  return EditorView.decorations.compute(['doc'], (state): DecorationSet => {
    const b = new RangeSetBuilder<Decoration>();
    if (!active.length) return b.finish();
    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      if (active.includes(i)) b.add(line.from, line.from, Decoration.line({ class: 'cm-hl-line' }));
      else if (dimOthers) b.add(line.from, line.from, Decoration.line({ class: 'cm-dim-line' }));
    }
    return b.finish();
  });
}

export interface CodeEditorProps {
  value: string;
  onChange?: (code: string) => void;
  readOnly?: boolean;
  /** Lines to mark with the highlighter (1-based). */
  highlightLines?: number[];
  /** Dim lines that are not highlighted (walkthrough focus). */
  focus?: boolean;
  label: string;
  minHeight?: string;
}

export function CodeEditor({ value, onChange, readOnly, highlightLines = [], focus, label, minHeight = '12rem' }: CodeEditorProps) {
  const key = highlightLines.join(',');
  const extensions = useMemo(
    () => [
      python(),
      theme,
      syntaxHighlighting(highlight),
      indentUnit.of('    '),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': label }),
      lineDecorations(highlightLines, !!focus),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, focus, label],
  );
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      editable={!readOnly}
      extensions={extensions}
      theme="none"
      basicSetup={{
        foldGutter: false,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: !readOnly,
        autocompletion: false,
        searchKeymap: false,
        lintKeymap: false,
      }}
      minHeight={minHeight}
      height="100%"
      style={{ height: '100%' }}
    />
  );
}
