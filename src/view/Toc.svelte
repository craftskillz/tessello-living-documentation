<script lang="ts">
  // The table of contents: the article's headings in an aside on the right, each a button that scrolls to it; a handle on
  // its left edge resizes it (dragging left widens), and the width is kept on release.
  import { t } from "../lib/i18n.ts";
  import { clampTocWidth } from "../lib/projects.ts";

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


  /** Dragging follows the pointer over the whole window, so it holds wherever the pointer goes. */
  function down(event: PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (each: PointerEvent) => (width = clampTocWidth(startWidth + startX - each.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onresized(width);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
</script>

<aside aria-label={t("onThisPage")} style:width="{width}px">
  <div class="handle" role="separator" aria-orientation="vertical" aria-label={t("resizeToc")} onpointerdown={down}></div>
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
    top: 0;
    flex: none;
    align-self: flex-start;
    max-height: 100%;
    overflow: auto;
    box-sizing: border-box;
    padding: 0 0 0 1rem;
    border-left: 1px solid var(--line);
  }
  .handle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 6px;
    cursor: col-resize;
    touch-action: none;
  }
  .handle:hover {
    background: var(--line);
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
