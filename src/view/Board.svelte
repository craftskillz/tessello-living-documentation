<script lang="ts">
  // The board of a Kanban Document: one column per folder, a card per Document in it. Cards open like a link and move by
  // drag and drop; the View does the moving and reloads the board.
  import type { CardPlace, Column } from "../lib/board.ts";
  import { formatTreeDate } from "../lib/dates.ts";
  import { currentLocale, t } from "../lib/i18n.ts";
  import type { TemplateFolder } from "../lib/templates.ts";

  let {
    columns,
    onopen,
    onmove,
    failure,
    templates,
    onadding,
    oncreate,
  }: {
    columns: Column[];
    onopen: (path: string) => void;
    /** Moves the card into the column, before or after another card there; without `place`, at the end. */
    onmove: (card: { path: string; name: string }, column: Column, place?: CardPlace) => void;
    /** The message for a column whose folder could not be created. */
    failure: (column: Column) => string;
    /** The Project's template library, for a new card's Template. */
    templates: TemplateFolder[];
    /** A new-card form opened: the library is read again. */
    onadding: () => void;
    /** Creates a card named `name` in the column, from the template at that path or none; resolves with the translated reason it was refused, null when created. */
    oncreate: (column: Column, name: string, template: string | null) => Promise<string | null>;
  } = $props();

  /** The new-card form of one column: a name, an optional template, and why the last try failed. */
  let adding = $state<{ folder: string; name: string; template: string; failure: string | null; running: boolean } | null>(null);
  function toggleAdding(column: Column) {
    if (adding?.folder === column.folder) adding = null;
    else {
      adding = { folder: column.folder, name: "", template: "", failure: null, running: false };
      onadding();
    }
  }
  async function submit(column: Column) {
    const form = adding;
    if (!form || form.running || form.name.trim() === "") return;
    form.running = true;
    form.failure = null;
    const failure = await oncreate(column, form.name, form.template === "" ? null : form.template);
    form.running = false;
    if (failure === null) adding = null;
    else form.failure = failure;
  }

  /** The card being dragged, and where a drop would land: a column, and in it a position relative to a card. */
  let dragging = $state<{ path: string; name: string; folder: string } | null>(null);
  let over = $state<{ folder: string; card?: string; position?: "before" | "after" } | null>(null);

  function start(event: DragEvent, column: Column, card: { path: string; name: string }) {
    event.dataTransfer?.setData("text/plain", card.path);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    dragging = { ...card, folder: column.folder };
  }
  const end = () => {
    dragging = null;
    over = null;
  };

  /** Over a card of the dragged card's own column: before or after it by the pointer's half; elsewhere, the column's end. */
  function hover(event: DragEvent, column: Column, card?: { name: string }) {
    if (!dragging) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    if (card && column.folder === dragging.folder && card.name !== dragging.name) {
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      over = { folder: column.folder, card: card.name, position: event.clientY - box.top < box.height / 2 ? "before" : "after" };
      event.stopPropagation();
    } else if (!card) over = { folder: column.folder };
  }

  function drop(event: DragEvent, column: Column, card?: { name: string }) {
    if (!dragging) return;
    event.preventDefault();
    // A card of another column leaves the drop to its column: any drop there goes to the end.
    if (card && column.folder !== dragging.folder) return;
    const moved = dragging;
    end();
    if (card) {
      event.stopPropagation();
      if (card.name === moved.name) return;
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const before = event.clientY - box.top < box.height / 2;
      onmove(moved, column, before ? { before: card.name } : { after: card.name });
    } else onmove(moved, column);
  }
</script>

<section class="board" aria-label={t("board")}>
  {#each columns as column (column.folder)}
    <div
      class="column ld-kanban-{column.color}"
      class:target={over?.folder === column.folder && dragging !== null && !(over.card === undefined && dragging.folder === column.folder)}
      role="presentation"
      ondragenter={(event) => hover(event, column)}
      ondragover={(event) => hover(event, column)}
      ondragleave={(event) => {
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null) && over?.folder === column.folder) over = null;
      }}
      ondrop={(event) => drop(event, column)}
    >
      <h2 class="board-column-title"><span class="board-label">{column.label}</span><span class="count">{column.cards.length}</span><button type="button" class="add" aria-label={t("addCard")} title={t("addCard")} aria-expanded={adding?.folder === column.folder} onclick={() => toggleAdding(column)}>+</button></h2>
      {#if adding?.folder === column.folder}
        <form
          class="ld-form new-card"
          onsubmit={(event) => {
            event.preventDefault();
            void submit(column);
          }}
        >
          <!-- svelte-ignore a11y_autofocus -->
          <input type="text" aria-label={t("cardName")} placeholder={t("cardNamePlaceholder")} autocomplete="off" spellcheck="false" autofocus bind:value={adding.name} oninput={() => adding && (adding.failure = null)} />
          <select aria-label={t("template")} bind:value={adding.template} onchange={() => adding && (adding.failure = null)}>
            <option value="">{t("noTemplate")}</option>
            {#each templates.filter((each) => each.templates.length > 0) as folder (folder.name)}
              <optgroup label={folder.name}>
                {#each folder.templates as entry (entry.path)}<option value={entry.path}>{entry.name}</option>{/each}
              </optgroup>
            {/each}
          </select>
          {#if adding.failure}<p class="invalid" role="alert">{adding.failure}</p>{/if}
          <div class="actions"><button type="submit" class="primary" disabled={adding.name.trim() === "" || adding.running}>{t("create")}</button></div>
        </form>
      {/if}
      {#if column.failure !== null}<p class="problem" role="alert">{failure(column)}</p>{/if}
      <ul aria-label={column.label}>
        {#each column.cards as card (card.path)}
          <li
            draggable="true"
            class:dragged={dragging?.path === card.path}
            class:before={over?.card === card.name && over.folder === column.folder && over.position === "before"}
            class:after={over?.card === card.name && over.folder === column.folder && over.position === "after"}
            ondragstart={(event) => start(event, column, card)}
            ondragend={end}
            ondragenter={(event) => hover(event, column, card)}
            ondragover={(event) => hover(event, column, card)}
            ondrop={(event) => drop(event, column, card)}
          >
            <button class="card" aria-label={card.title} onclick={() => onopen(card.path)}>
              <strong>{card.title}</strong>
              {#if card.description === null}<span class="description unreadable">{t("boardCardUnreadable")}</span>{:else if card.description}<span class="description">{card.description}</span>{/if}
              <small class="muted">{formatTreeDate(card.date, currentLocale())}</small>
            </button>
          </li>
        {:else}
          <li class="empty muted">{t("boardNoCards")}</li>
        {/each}
      </ul>
    </div>
  {/each}
</section>

<style>
  .board {
    display: flex;
    gap: 0.75rem;
    overflow-x: auto;
    align-items: flex-start;
    margin-top: 1.5rem;
  }
  .column {
    flex: 1 1 0;
    min-width: 240px;
    border: 1px solid var(--kanban-border);
    border-radius: 8px;
    background: var(--kanban-bg);
    padding: 0.5rem;
  }
  .board-column-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 0 0 0.5rem;
    font-size: 0.8em;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--kanban-title);
    overflow-wrap: anywhere;
  }
  .add {
    padding: 0 0.5em;
    line-height: 1.4;
    font-weight: 700;
  }
  .new-card {
    overflow-wrap: anywhere;
    display: grid;
    gap: 0.4rem;
    margin: 0 0 0.5rem;
    padding: 0.5rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel);
    color: var(--ink);
    text-transform: none;
    letter-spacing: normal;
  }
  .new-card .actions {
    display: flex;
    justify-content: flex-end;
  }
  .count {
    border-radius: 999px;
    padding: 0 0.6em;
    background: color-mix(in srgb, var(--kanban-title) 15%, transparent);
    font-weight: 600;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 3rem;
  }
  .column.target {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  li.dragged {
    opacity: 0.4;
  }
  li.before {
    box-shadow: 0 -3px 0 -1px var(--accent);
  }
  li.after {
    box-shadow: 0 3px 0 -1px var(--accent);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    text-align: left;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel);
    color: var(--ink);
    overflow-wrap: anywhere;
    cursor: pointer;
  }
  .card:hover {
    border-color: var(--accent);
  }
  .unreadable {
    font-style: italic;
    color: light-dark(#c0392b, #f87171);
  }
  .description {
    font-size: 0.9em;
    color: var(--muted);
  }
  .empty {
    padding: 0.5rem;
    text-align: center;
  }
  .muted {
    color: var(--muted, #777);
  }
  .problem {
    margin: 0 0 0.5rem;
    color: light-dark(#c0392b, #f87171);
    font-size: 0.9em;
  }
</style>
