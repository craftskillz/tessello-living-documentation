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

  let { entries, current, open, onfile, drag }: { entries: TreeEntry[]; current: string | null; open: (path: string) => void; onfile: (path: string) => void; drag: Dragging } = $props();

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
        <details open={!drag.closed.has(entry.path)} ontoggle={(event) => drag.toggle(entry.path, event.currentTarget.open)}>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <summary
            class="row"
            data-entry={entry.path}
            class:hidden={entry.hidden}
            class:before={markOf(entry.path) === "before"}
            class:after={markOf(entry.path) === "after"}
            class:inside={markOf(entry.path) === "inside"}
            draggable="true"
            ondragstart={(event) => onDragStart(event, entry)}
            ondragend={() => drag.end()}
            ondragover={(event) => onDragOver(event, entry)}
            ondragleave={(event) => onDragLeave(event, entry)}
            ondrop={(event) => onDrop(event, entry)}
            onkeydown={(event) => onMenuKey(event, entry)}
            oncontextmenu={(event) => onContextMenu(event, entry)}>{entry.name}</summary
          >
          <Tree entries={entry.children} {current} {open} {onfile} {drag} />
        </details>
      {:else if entry.kind === "manifest"}
        <div class="row hidden" data-entry={entry.path}>
          <span class="lock" aria-hidden="true">🔒</span>
          <span
            class="entry"
            role="link"
            tabindex="0"
            aria-current={entry.path === current ? "page" : undefined}
            onclick={() => open(entry.path)}
            onkeydown={(event) => onKey(event, entry.path)}>{entry.name}</span
          >
        </div>
      {:else if entry.kind === "file"}
        <div class="row hidden" data-entry={entry.path}>
          <span
            class="entry"
            role="link"
            tabindex="0"
            onclick={() => onfile(entry.path)}
            onkeydown={(event) => { if (event.key === "Enter") onfile(entry.path); }}>{entry.name}</span
          >
        </div>
      {:else}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="row"
          class:hidden={entry.hidden}
          data-entry={entry.path}
          class:before={markOf(entry.path) === "before"}
          class:after={markOf(entry.path) === "after"}
          draggable="true"
          ondragstart={(event) => onDragStart(event, entry)}
          ondragend={() => drag.end()}
          ondragover={(event) => onDragOver(event, entry)}
          ondragleave={(event) => onDragLeave(event, entry)}
          ondrop={(event) => onDrop(event, entry)}
          oncontextmenu={(event) => onContextMenu(event, entry)}
        >
          <span
            class="entry"
            role="link"
            tabindex="0"
            aria-current={entry.path === current ? "page" : undefined}
            onclick={() => open(entry.path)}
            onkeydown={(event) => { onKey(event, entry.path); onMenuKey(event, entry); }}>{entry.name}</span
          >
          <!-- Outside the link: its accessible name stays the file name. -->
          <small class="date" title={entry.date.kind === "created" ? t("createdOn") : t("modifiedOn")}>{formatTreeDate(entry.date, currentLocale())}</small>
        </div>
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
  .row {
    position: relative;
  }
  /* While dragging: a line above or below the row, or a box around the Folder it would go inside. */
  .row.before::before,
  .row.after::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent, #3b82f6);
    pointer-events: none;
  }
  .row.before::before {
    top: -1px;
  }
  .row.after::after {
    bottom: -1px;
  }
  .row.inside {
    outline: 2px solid var(--accent, #3b82f6);
    outline-offset: -1px;
    border-radius: 4px;
  }
  .entry {
    color: inherit;
    text-decoration: none;
    cursor: pointer;
  }
  .date {
    display: block;
    color: var(--ink-muted, #777);
    font-size: 0.75rem;
  }
  /* Hidden Folders and Documents, Folder manifests and other files, shown with Show hidden items. */
  .row.hidden {
    color: var(--muted, #777);
    font-style: italic;
  }
  .lock {
    font-style: normal;
  }
  .entry[aria-current="page"] {
    font-weight: 600;
  }
</style>
