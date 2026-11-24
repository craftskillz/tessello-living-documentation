<script lang="ts" module>
  /** Where a dragged entry would land relative to the entry under the pointer. */
  export type DropPosition = "before" | "after" | "inside";

  /** Drop position for a pointer at `offsetY` in a row of `height`: a Document halves, a Folder quarters around its middle. */
  export function dropPositionAt(kind: "folder" | "document", offsetY: number, height: number): DropPosition {
    const ratio = height > 0 ? offsetY / height : 0;
    if (kind === "document") return ratio < 0.5 ? "before" : "after";
    if (ratio < 0.25) return "before";
    if (ratio > 0.75) return "after";
    return "inside";
  }
</script>

<script lang="ts">
  // The Tree: Folders open by default, Documents as links that open in the View. No href: in the Host the View is an
  // about:srcdoc page, and a link with an address would leave it.
  import { formatTreeDate } from "../lib/dates.ts";
  import { currentLocale, t } from "../lib/i18n.ts";
  import type { TreeDocument, TreeEntry, TreeFolder } from "../lib/project.ts";
  import Tree from "./Tree.svelte";

  export interface Dragging {
    /** The entry being dragged, by path; null when nothing of the Tree is. */
    source: string | null;
    /** The row the pointer is over and where the drop would land. */
    mark: { path: string; position: DropPosition } | null;
    /** Folders the User closed (all the others are open). */
    closed: ReadonlySet<string>;
    start(path: string): void;
    over(entry: TreeFolder | TreeDocument, position: DropPosition): void;
    leave(entry: TreeFolder | TreeDocument): void;
    drop(entry: TreeFolder | TreeDocument, position: DropPosition): void;
    end(): void;
    toggle(path: string, open: boolean): void;
    menu(entry: TreeFolder | TreeDocument, x: number, y: number): void;
  }

  type Movable = TreeFolder | TreeDocument;

  let {
    entries,
    current,
    open,
    onfile,
    drag,
    label = (entry) => entry.name,
  }: {
    entries: TreeEntry[];
    current: string | null;
    open: (path: string) => void;
    onfile: (path: string) => void;
    drag: Dragging;
    /** What the row of a Folder or a Document shows (its name, its title, filtered); its full name is the tooltip when they differ. */
    label?: (entry: TreeFolder | TreeDocument) => string;
  } = $props();

  /** The tooltip of a row whose label is not its name: the name. */
  const fullName = (entry: Movable, shown: string) => (shown === entry.name ? undefined : entry.name);

  function onKey(event: KeyboardEvent, path: string) {
    if (event.key === "Enter") open(path);
  }

  /** The ContextMenu key and Shift+F10 open the entry menu at the focused entry (not every platform sends a contextmenu event). */
  function onMenuKey(event: KeyboardEvent, entry: Movable) {
    if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
    event.preventDefault();
    event.stopPropagation();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    drag.menu(entry, box.left + 8, box.bottom);
  }

  /** A dragged entry does not land on itself; a drop inside itself is refused by the Project, with its message. */
  const droppable = (target: string) => drag.source !== null && target !== drag.source;

  function positionOf(event: DragEvent, entry: Movable): DropPosition {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return dropPositionAt(entry.kind, event.clientY - box.top, box.height);
  }

  function onDragStart(event: DragEvent, entry: Movable) {
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", entry.path);
    }
    drag.start(entry.path);
  }

  /** Also on dragenter: the pointer may cross from the row's padding into its link without a dragover in between. */
  function onDragOver(event: DragEvent, entry: Movable) {
    if (!droppable(entry.path)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    drag.over(entry, positionOf(event, entry));
  }

  function onDrop(event: DragEvent, entry: Movable) {
    if (!droppable(entry.path)) return;
    event.preventDefault();
    drag.drop(entry, positionOf(event, entry));
  }

  function onDragLeave(event: DragEvent, entry: Movable) {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) drag.leave(entry);
  }

  function onContextMenu(event: MouseEvent, entry: Movable) {
    event.preventDefault();
    event.stopPropagation();
    drag.menu(entry, event.clientX, event.clientY);
  }

  const markOf = (path: string) => (drag.mark?.path === path ? drag.mark.position : null);
</script>

<ul>
  {#each entries as entry (entry.path)}
    <li>
      {#if entry.kind === "folder"}
        {@const shown = label(entry)}
        <details open={!drag.closed.has(entry.path)} ontoggle={(event) => drag.toggle(entry.path, event.currentTarget.open)}>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <summary
            class="row"
            data-entry={entry.path}
            title={fullName(entry, shown)}
            class:hidden={entry.hidden}
            class:before={markOf(entry.path) === "before"}
            class:after={markOf(entry.path) === "after"}
            class:inside={markOf(entry.path) === "inside"}
            draggable="true"
            ondragstart={(event) => onDragStart(event, entry)}
            ondragend={() => drag.end()}
            ondragenter={(event) => onDragOver(event, entry)}
            ondragover={(event) => onDragOver(event, entry)}
            ondragleave={(event) => onDragLeave(event, entry)}
            ondrop={(event) => onDrop(event, entry)}
            onkeydown={(event) => onMenuKey(event, entry)}
            oncontextmenu={(event) => onContextMenu(event, entry)}
          >
            {@render icon("chevron")}
            <span class="entry">{@render icon("folder")}<span class="label">{shown}</span></span>
          </summary>
          <Tree entries={entry.children} {current} {open} {onfile} {drag} {label} />
        </details>
      {:else if entry.kind === "manifest"}
        <div class="row hidden" class:current={entry.path === current} data-entry={entry.path}>
          <span class="lock" aria-hidden="true">🔒</span>
          <span
            class="entry"
            role="link"
            tabindex="0"
            aria-current={entry.path === current ? "page" : undefined}
            onclick={() => open(entry.path)}
            onkeydown={(event) => onKey(event, entry.path)}>{@render icon("file")}<span class="label">{entry.name}</span></span
          >
        </div>
      {:else if entry.kind === "file"}
        <div class="row hidden" data-entry={entry.path}>
          <span class="spacer"></span>
          <span
            class="entry"
            role="link"
            tabindex="0"
            onclick={() => onfile(entry.path)}
            onkeydown={(event) => { if (event.key === "Enter") onfile(entry.path); }}>{@render icon("file")}<span class="label">{entry.name}</span></span
          >
        </div>
      {:else}
        {@const shown = label(entry)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="row"
          class:hidden={entry.hidden}
          class:current={entry.path === current}
          data-entry={entry.path}
          title={fullName(entry, shown)}
          class:before={markOf(entry.path) === "before"}
          class:after={markOf(entry.path) === "after"}
          draggable="true"
          ondragstart={(event) => onDragStart(event, entry)}
          ondragend={() => drag.end()}
          ondragenter={(event) => onDragOver(event, entry)}
          ondragover={(event) => onDragOver(event, entry)}
          ondragleave={(event) => onDragLeave(event, entry)}
          ondrop={(event) => onDrop(event, entry)}
          oncontextmenu={(event) => onContextMenu(event, entry)}
        >
          <span class="spacer"></span>
          <span
            class="entry"
            role="link"
            tabindex="0"
            aria-current={entry.path === current ? "page" : undefined}
            onclick={() => open(entry.path)}
            onkeydown={(event) => { onKey(event, entry.path); onMenuKey(event, entry); }}>{@render icon("document")}<span class="label">{shown}</span></span
          >
          <!-- Outside the link: its accessible name stays the label. -->
          <small class="date" title={entry.date.kind === "created" ? t("createdOn") : t("modifiedOn")}>{formatTreeDate(entry.date, currentLocale())}</small>
        </div>
      {/if}
    </li>
  {/each}
</ul>

<!-- Lucide's chevron-right, folder, folder-open, file-text and file (ISC licence), drawn with the text's colour. -->
{#snippet icon(kind: "chevron" | "folder" | "document" | "file")}
  <svg class="icon {kind}" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    {#if kind === "chevron"}
      <path d="m9 18 6-6-6-6" />
    {:else if kind === "folder"}
      <g class="closed"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></g>
      <g class="opened"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" /></g>
    {:else if kind === "document"}
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />
    {:else}
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />
    {/if}
  </svg>
{/snippet}

<style>
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  /* Indentation guides: each level hangs from a line under its Folder's chevron. */
  details > :global(ul) {
    margin-left: 0.7rem;
    padding-left: 0.35rem;
    border-left: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  }
  li {
    margin: 1px 0;
  }
  .row {
    position: relative;
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr);
    align-items: center;
    column-gap: 0.15rem;
    padding: 0.2rem 0.4rem 0.2rem 0.2rem;
    border-radius: 6px;
    color: var(--ink);
    cursor: pointer;
  }
  summary.row {
    list-style: none;
  }
  summary.row::-webkit-details-marker {
    display: none;
  }
  .row:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    color: inherit;
    text-decoration: none;
    outline: none;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .icon {
    flex: none;
    color: var(--muted, #777);
  }
  .icon.chevron {
    width: 14px;
    height: 14px;
    transition: transform 120ms;
  }
  details[open] > summary .icon.chevron {
    transform: rotate(90deg);
  }
  .icon.folder .opened,
  details[open] > summary .icon.folder .closed {
    display: none;
  }
  details[open] > summary .icon.folder .opened {
    display: inline;
  }
  .date {
    grid-column: 2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-left: calc(16px + 0.4rem);
    color: var(--muted, #777);
    font-size: 0.75rem;
    line-height: 1.3;
  }
  /* Keyboard focus: a ring around the whole row. */
  summary.row:focus-visible,
  .row:has(> .entry:focus-visible) {
    outline: 2px solid var(--accent, #3b82f6);
    outline-offset: -2px;
  }
  /* The open Document: accent background, a bar on its left edge, bold. */
  .row.current {
    background: color-mix(in srgb, var(--accent, #3b82f6) 16%, transparent);
    box-shadow: inset 3px 0 0 var(--accent, #3b82f6);
  }
  .row.current:hover {
    background: color-mix(in srgb, var(--accent, #3b82f6) 22%, transparent);
  }
  .row.current .label {
    font-weight: 650;
  }
  .row.current .icon:not(.chevron) {
    color: var(--accent, #3b82f6);
  }
  /* Hidden Folders and Documents, Folder manifests and other files, shown with Show hidden items. */
  .row.hidden {
    color: var(--muted, #777);
    font-style: italic;
  }
  .row.hidden .icon {
    opacity: 0.7;
  }
  .lock {
    justify-self: center;
    flex: none;
    font-style: normal;
    font-size: 0.8em;
  }
  /* While dragging: a line above or below the row, or a box around the Folder it would go inside. */
  .row.before::before,
  .row.after::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    border-radius: 1px;
    background: var(--accent, #3b82f6);
    pointer-events: none;
  }
  .row.before::before {
    top: -2px;
  }
  .row.after::after {
    bottom: -2px;
  }
  .row.inside {
    outline: 2px solid var(--accent, #3b82f6);
    outline-offset: -2px;
    background: color-mix(in srgb, var(--accent, #3b82f6) 10%, transparent);
  }
</style>
