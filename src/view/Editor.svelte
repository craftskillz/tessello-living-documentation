<script lang="ts">
  // The Markdown editor (CodeMirror 6). `text` is set from outside only when it differs from what the editor holds.
  import { markdown } from "@codemirror/lang-markdown";
  import { syntaxTree } from "@codemirror/language";
  import { Compartment, RangeSetBuilder } from "@codemirror/state";
  import { Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from "@codemirror/view";
  import { EditorView, basicSetup } from "codemirror";
  import { onDestroy, onMount } from "svelte";
  import { blankLines } from "./snippetDialog.ts";

  let {
    text,
    label,
    wrap = true,
    onchange,
    onfiles,
  }: {
    text: string;
    label: string;
    /** Long lines wrap; false: they stay whole and the editor scrolls horizontally. */
    wrap?: boolean;
    onchange: (text: string) => void;
    /** Files pasted or dropped: resolves to the Markdown to insert where they came in, or null to insert nothing. */
    onfiles?: (files: File[]) => Promise<string | null>;
  } = $props();

  /** A table row (in a quote too) or a line of a fenced code block: wrapped, it no longer reads as one row. */
  const TABLE_ROW = /^\s*(?:>\s*)*\|/;
  const whole = Decoration.line({ class: "cm-whole-line" });

  /** The visible lines that stay whole while the others wrap: they overflow, and the editor scrolls horizontally. */
  function wholeLines(view: EditorView): DecorationSet {
    const { doc } = view.state;
    const starts = new Set<number>();
    for (const { from, to } of view.visibleRanges) {
      for (let at = from; at <= to; ) {
        const line = doc.lineAt(at);
        if (TABLE_ROW.test(line.text)) starts.add(line.from);
        at = line.to + 1;
      }
      syntaxTree(view.state).iterate({
        from,
        to,
        enter: (node) => {
          if (node.name !== "FencedCode") return;
          for (let at = node.from; at <= node.to; ) {
            const line = doc.lineAt(at);
            starts.add(line.from);
            at = line.to + 1;
          }
          return false;
        },
      });
    }
    const builder = new RangeSetBuilder<Decoration>();
    for (const start of [...starts].sort((a, b) => a - b)) builder.add(start, start, whole);
    return builder.finish();
  }

  const keepWhole = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = wholeLines(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) this.decorations = wholeLines(update.view);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );

  let element: HTMLDivElement;
  let view: EditorView | null = null;
  const wrapping = new Compartment();
  /** The places where files came in and whose Markdown is awaited: followed through every change made meanwhile. */
  const waiting = new Set<{ at: number }>();

  /** Hands the files to `onfiles`, then inserts its answer at the place they came in, wherever that has moved to. */
  async function insertWhenReady(editor: EditorView, files: File[], at: number) {
    const place = { at };
    waiting.add(place);
    let insert: string | null = null;
    try {
      insert = await onfiles!(files);
    } finally {
      waiting.delete(place);
    }
    if (insert === null || insert === "" || view !== editor) return;
    editor.dispatch({
      changes: { from: place.at, insert },
      selection: { anchor: place.at + insert.length },
      scrollIntoView: true,
    });
    editor.focus();
  }

  export function focus() {
    view?.focus();
  }

  /** The selected text ("" when only a caret). */
  export function selection(): string {
    if (!view) return "";
    const { from, to } = view.state.selection.main;
    return view.state.sliceDoc(from, to);
  }

  /** Replaces the selection with `text` (a block gets blank lines around it), puts the caret after it and focuses the editor. */
  export function replaceSelection(text: string, block = false) {
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const { lead, trail } = block ? blankLines(view.state.sliceDoc(0, from), view.state.sliceDoc(to)) : { lead: "", trail: "" };
    const insert = lead + text + trail;
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true });
    view.focus();
  }

  /** Replaces the text with `text` as one undoable change of only the span that differs, so the caret follows; focuses the editor. */
  export function replaceText(text: string) {
    if (!view) return;
    const old = view.state.doc.toString();
    if (old === text) return;
    let from = 0;
    while (from < old.length && from < text.length && old[from] === text[from]) from++;
    let oldEnd = old.length;
    let newEnd = text.length;
    while (oldEnd > from && newEnd > from && old[oldEnd - 1] === text[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    view.dispatch({ changes: { from, to: oldEnd, insert: text.slice(from, newEnd) } });
    view.focus();
  }

  onMount(() => {
    view = new EditorView({
      doc: text,
      parent: element,
      extensions: [
        basicSetup,
        markdown(),
        wrapping.of(wrap ? EditorView.lineWrapping : []),
        keepWhole,
        EditorView.contentAttributes.of({ "aria-label": label }),
        EditorView.domEventHandlers({
          paste(event, editor) {
            const files = [...(event.clipboardData?.files ?? [])];
            if (!onfiles || files.length === 0) return false;
            event.preventDefault();
            void insertWhenReady(editor, files, editor.state.selection.main.head);
            return true;
          },
          dragover(event) {
            if (!onfiles || !event.dataTransfer?.types.includes("Files")) return false;
            event.preventDefault();
            return true;
          },
          drop(event, editor) {
            const files = [...(event.dataTransfer?.files ?? [])];
            if (!onfiles || files.length === 0) return false;
            event.preventDefault();
            const at = editor.posAtCoords({ x: event.clientX, y: event.clientY }) ?? editor.state.selection.main.head;
            void insertWhenReady(editor, files, at);
            return true;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          for (const place of waiting) place.at = update.changes.mapPos(place.at, 1);
          onchange(update.state.doc.toString());
        }),
      ],
    });
  });

  $effect(() => {
    const wanted = text;
    if (view && view.state.doc.toString() !== wanted) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: wanted } });
    }
  });

  $effect(() => {
    const extension = wrap ? EditorView.lineWrapping : [];
    view?.dispatch({ effects: wrapping.reconfigure(extension) });
  });

  onDestroy(() => view?.destroy());
</script>

<div class="editor" bind:this={element}></div>

<style>
  .editor {
    border: 1px solid var(--line);
    border-radius: 6px;
    min-height: 60vh;
  }
  .editor :global(.cm-editor) {
    min-height: 60vh;
  }
  /* Tables and code stay whole while the prose wraps: the editor scrolls horizontally to show them. The content keeps
     the editor's width (a flex item would otherwise grow to its widest line, and the prose would wrap at that width). */
  .editor :global(.cm-content.cm-lineWrapping) {
    min-width: 0;
  }
  .editor :global(.cm-lineWrapping .cm-line.cm-whole-line) {
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
  }
</style>
