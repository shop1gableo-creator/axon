// Éditeur Markdown (CodeMirror 6) avec autocomplétion des [[liens]].
import { EditorView, keymap, drawSelection, highlightActiveLine, placeholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { autocompletion } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { tags as t } from "@lezer/highlight";

const style = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.45em", fontWeight: "700", color: "#fff" },
  { tag: t.heading2, fontSize: "1.25em", fontWeight: "700", color: "#fff" },
  { tag: [t.heading3, t.heading4], fontWeight: "700", color: "#f1f3f8" },
  { tag: t.strong, fontWeight: "700", color: "#fff" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: [t.link, t.url], color: "#7cc4ff" },
  { tag: t.monospace, color: "#ffd166" },
  { tag: [t.processingInstruction, t.meta, t.comment], color: "#5b6377" },
  { tag: t.quote, color: "#a9b1c3" },
  { tag: t.list, color: "#ff7a45" },
]);

const theme = EditorView.theme({
  "&": { color: "#e4e8f0", backgroundColor: "#07080c" },
  ".cm-content": { caretColor: "#ff7a45", padding: "0 32px" },
  ".cm-cursor": { borderLeftColor: "#ff7a45" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "#2a3550 !important" },
  ".cm-activeLine": { backgroundColor: "#0d1018" },
  ".cm-tooltip": { backgroundColor: "#121622", border: "1px solid #262c3a" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "#ff7a45", color: "#140700" },
}, { dark: true });

export function createEditor(parent, { onChange, onSave, names }) {
  const linkCompletion = (ctx) => {
    const m = ctx.matchBefore(/\[\[[^\]\n]*/);
    if (!m) return null;
    return {
      from: m.from + 2,
      options: names().map((n) => ({ label: n, apply: n + "]]", type: "text" })),
      validFor: /^[^\]\n]*$/,
    };
  };
  let silent = false;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: [
        history(), drawSelection(), highlightActiveLine(), highlightSelectionMatches(),
        EditorView.lineWrapping, placeholder("Écris ici… [[ pour lier une autre note"),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(style), theme,
        autocompletion({ override: [linkCompletion], activateOnTyping: true }),
        keymap.of([{ key: "Mod-s", run: () => { onSave(); return true; } }, indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        EditorView.updateListener.of((u) => { if (u.docChanged && !silent) onChange(); }),
      ],
    }),
  });
  return {
    get value() { return view.state.doc.toString(); },
    set value(v) { silent = true; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } }); silent = false; },
    focus() { view.focus(); },
  };
}
