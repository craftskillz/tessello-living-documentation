<script lang="ts">
  // The Markdown editor (CodeMirror 6). `text` is set from outside only when it differs from what the editor holds.
  import { markdown } from "@codemirror/lang-markdown";
  import { EditorView, basicSetup } from "codemirror";
  import { onDestroy, onMount } from "svelte";

  let {
    text,
    label,
    onchange,
    onfiles,
  }: {
    text: string;
    label: string;
    onchange: (text: string) => void;
    /** Files pasted or dropped: resolves to the Markdown to insert where they came in, or null to insert nothing. */
    onfiles?: (files: File[]) => Promise<string | null>;
  } = $props();

  let element: HTMLDivElement;
  let view: EditorView | null = null;
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

  onMount(() => {
    view = new EditorView({
      doc: text,
      parent: element,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
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
</style>
