<script lang="ts">
  // The Favorites menu of the sidebar: the Project's favorites in the User's order, to open, remove and reorder (drag, or
  // Alt + ↑ / ↓ on a row). It only shows and asks: View keeps the list and saves it.
  import { tick } from "svelte";
  import { t } from "../lib/i18n.ts";
  import type { Favorite } from "../lib/projects.ts";

  let {
    entries,
    onshow,
    onopen,
    onremove,
    onmove,
  }: {
    entries: Favorite[];
    /** The menu is about to show: the list is read again. */
    onshow: () => void;
    onopen: (path: string) => void;
    onremove: (path: string) => void;
    /** The favorite at `from` goes to the position `to`. */
    onmove: (from: number, to: number) => void;
  } = $props();

  let shown = $state(false);
  let root = $state<HTMLElement>();
  let button = $state<HTMLButtonElement>();
  let dragging = $state<number | null>(null);
  let over = $state<number | null>(null);

  function toggle() {
    shown = !shown;
    if (shown) onshow();
  }

  function close() {
    shown = false;
    dragging = over = null;
  }

  function onwindowkey(event: KeyboardEvent) {
    if (shown && event.key === "Escape") {
      close();
      button?.focus();
    }
  }

  function onwindowpointer(event: PointerEvent) {
    if (shown && root && !root.contains(event.target as Node)) close();
  }

  async function move(from: number, to: number) {
    if (to < 0 || to >= entries.length || from === to) return;
    const path = entries[from].path;
    onmove(from, to);
    // The row keeps the focus, wherever the list moved it.
    await tick();
    root?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"] [data-title]`)?.focus();
  }

  function onrowkey(event: KeyboardEvent, index: number) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    void move(index, index + (event.key === "ArrowUp" ? -1 : 1));
  }

  function drop(event: DragEvent, index: number) {
    event.preventDefault();
    const from = dragging;
    dragging = over = null;
    if (from !== null) void move(from, index);
  }
</script>

<svelte:window onkeydown={onwindowkey} onpointerdown={onwindowpointer} />

<div class="favorites" bind:this={root}>
  <button
    type="button"
    class="icon"
    bind:this={button}
    aria-label={t("favorites")}
    title={t("favorites")}
    aria-haspopup="dialog"
    aria-expanded={shown}
    onclick={toggle}
  >
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg>
  </button>
  {#if shown}
    <div class="panel" role="dialog" aria-label={t("favorites")}>
      {#if entries.length === 0}
        <p class="muted empty">{t("noFavorites")}</p>
      {:else}
        <ul>
          {#each entries as entry, index (entry.path)}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <li
              data-path={entry.path}
              class:missing={entry.missing}
              class:dragging={dragging === index}
              class:target={over === index && dragging !== null && dragging !== index}
              draggable="true"
              ondragstart={(event) => {
                dragging = index;
                event.dataTransfer?.setData("text/plain", entry.path);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
              }}
              ondragend={() => (dragging = over = null)}
              ondragover={(event) => {
                if (dragging === null) return;
                event.preventDefault();
                over = index;
              }}
              ondrop={(event) => drop(event, index)}
              onkeydown={(event) => onrowkey(event, index)}
            >
              <span class="grip" title={t("dragToReorder")} aria-hidden="true">⠿</span>
              <svg class="star" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg>
              <button
                type="button"
                class="title"
                data-title
                aria-disabled={entry.missing}
                title={entry.path}
                onclick={() => {
                  if (entry.missing) return;
                  close();
                  onopen(entry.path);
                }}>{entry.title}</button
              >
              {#if entry.missing}<span class="badge">{t("favoriteMissing")}</span>{/if}
              <button type="button" class="remove" aria-label={t("removeFavorite")} title={t("removeFavorite")} onclick={() => onremove(entry.path)}>×</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .favorites {
    position: relative;
  }
  button.icon {
    display: inline-grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border-color: transparent;
    background: transparent;
    color: #d99a06;
  }
  button.icon:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
  }
  button.icon:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .panel {
    position: absolute;
    z-index: 20;
    top: 100%;
    left: 0;
    width: min(22rem, 80vw);
    max-height: 60vh;
    overflow: auto;
    padding: 0.4rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.2);
  }
  .empty {
    margin: 0.5rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem 0.25rem;
    border-radius: 6px;
    border-top: 2px solid transparent;
  }
  li.dragging {
    opacity: 0.4;
  }
  li.target {
    border-top-color: var(--accent);
  }
  li.missing {
    opacity: 0.55;
  }
  .grip {
    cursor: grab;
    color: var(--muted, #777);
  }
  .star {
    flex: none;
    color: #d99a06;
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    border-color: transparent;
    background: transparent;
  }
  .title[aria-disabled="true"] {
    cursor: default;
  }
  .badge {
    font-size: 0.8em;
    color: var(--muted, #777);
  }
  .remove {
    border-color: transparent;
    background: transparent;
    padding: 0 0.4rem;
  }
</style>
