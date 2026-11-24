<script lang="ts">
  // The table of contents: the article's headings in an aside on the right, each a button that scrolls to it; a handle on
  // its left edge resizes it (dragging left widens), and the width is kept on release.
  import { t } from "../lib/i18n.ts";
  import { TOC_WIDTH } from "../lib/projects.ts";
  import ResizeHandle from "./ResizeHandle.svelte";

  export interface Heading {
    id: string;
    text: string;
    level: number;
  }

  let {
    headings,
    width = $bindable(),
    onselect,
    onresized,
  }: { headings: Heading[]; width: number; onselect: (id: string) => void; onresized: (width: number) => void } = $props();
</script>

<aside aria-label={t("onThisPage")} style:width="{width}px">
  <ResizeHandle
    label={t("resizeToc")}
    {width}
    bounds={TOC_WIDTH}
    widens="left"
    left="0"
    onmove={(moved) => (width = moved)}
    onkept={onresized}
  />
  <p class="title">{t("onThisPage")}</p>
  <ul>
    {#each headings as heading, index (index)}
      <li style:padding-left="{(heading.level - 1) * 0.75}rem">
        <button class="entry" onclick={() => onselect(heading.id)}>{heading.text}</button>
      </li>
    {/each}
  </ul>
</aside>

<style>
  aside {
    position: sticky;
    top: var(--header-height, 0px);
    flex: none;
    align-self: flex-start;
    /* Down to the bottom of the View (less the reading area's bottom padding), whatever the length of the list. */
    height: calc(100vh - var(--header-height, 0px) - 1rem);
    overflow: auto;
    box-sizing: border-box;
    padding: 0 0 0 1rem;
    border-left: 1px solid var(--line);
  }
  .title {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .entry {
    border: none;
    background: none;
    padding: 0.15em 0;
    text-align: left;
    color: var(--ink);
    font-size: 0.9em;
  }
  .entry:hover {
    color: var(--accent);
  }
</style>
