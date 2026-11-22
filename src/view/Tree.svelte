<script lang="ts">
  // The Tree: Folders open by default, Documents as links to their route.
  import type { TreeEntry } from "../lib/project.ts";
  import Tree from "./Tree.svelte";

  let { entries, current, hrefOf }: { entries: TreeEntry[]; current: string | null; hrefOf: (path: string) => string } = $props();
</script>

<ul>
  {#each entries as entry (entry.path)}
    <li>
      {#if entry.kind === "folder"}
        <details open>
          <summary>{entry.name}</summary>
          <Tree entries={entry.children} {current} {hrefOf} />
        </details>
      {:else}
        <a href={hrefOf(entry.path)} aria-current={entry.path === current ? "page" : undefined}>{entry.name}</a>
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
  a {
    color: inherit;
    text-decoration: none;
  }
  a[aria-current="page"] {
    font-weight: 600;
  }
</style>
