<script lang="ts">
  // The Tree: Folders open by default, Documents as links that open in the View. No href: in the Host the View is an
  // about:srcdoc page, and a link with an address would leave it.
  import type { TreeEntry } from "../lib/project.ts";
  import Tree from "./Tree.svelte";

  let { entries, current, open }: { entries: TreeEntry[]; current: string | null; open: (path: string) => void } = $props();

  function onKey(event: KeyboardEvent, path: string) {
    if (event.key === "Enter") open(path);
  }
</script>

<ul>
  {#each entries as entry (entry.path)}
    <li>
      {#if entry.kind === "folder"}
        <details open>
          <summary>{entry.name}</summary>
          <Tree entries={entry.children} {current} {open} />
        </details>
      {:else}
        <span
          class="document"
          role="link"
          tabindex="0"
          aria-current={entry.path === current ? "page" : undefined}
          onclick={() => open(entry.path)}
          onkeydown={(event) => onKey(event, entry.path)}>{entry.name}</span
        >
      {/if}
    </li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    padding-left: 0.9rem;
    margin: 0;
  }
  .document {
    color: inherit;
    text-decoration: none;
    cursor: pointer;
  }
  .document[aria-current="page"] {
    font-weight: 600;
  }
</style>
