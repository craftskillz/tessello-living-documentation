<script lang="ts">
  // The Markdown editor (CodeMirror 6). `text` is set from outside only when it differs from what the editor holds.
  import { markdown } from "@codemirror/lang-markdown";
  import { EditorView, basicSetup } from "codemirror";
  import { onDestroy, onMount } from "svelte";

  let { text, label, onchange }: { text: string; label: string; onchange: (text: string) => void } = $props();

  let element: HTMLDivElement;
  let view: EditorView | null = null;

  onMount(() => {
    view = new EditorView({
      doc: text,
      parent: element,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": label }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onchange(update.state.doc.toString());
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
