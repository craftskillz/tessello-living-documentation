<script lang="ts">
  // The Edit columns dialog of a board (docs/spec/kanban-boards.md): one row per column, live validation, and for a removed
  // column holding cards the choice to move them or keep its folder. It only shows and asks: View saves.
  import type { Column, ColumnEdit, Removal } from "../lib/board.ts";
  import { columnFolder, columnsProblem, KANBAN_COLORS, MAX_COLUMNS } from "../lib/kanban.ts";
  import { t, tn } from "../lib/i18n.ts";

  let {
    columns,
    saving,
    failure,
    onsave,
    onclose,
  }: {
    columns: Column[];
    saving: boolean;
    /** The translated reason the last save was refused, if any. */
    failure: string | null;
    onsave: (rows: ColumnEdit[], removals: Record<string, Removal>) => void;
    onclose: () => void;
  } = $props();

  // The rows start from the columns as they were when the dialog opened.
  // svelte-ignore state_referenced_locally
  let rows = $state<ColumnEdit[]>(columns.map((column) => ({ label: column.label, color: column.color, from: column.folder })));
  /** Per removed column's folder: what to do with its cards (a kept column's folder, or "keep"). */
  let choices = $state<Record<string, { keep: boolean; moveTo: string | null }>>({});

  const quoted = (index: number) => (rows[index]!.label.trim() === "" ? t("columnNumber", { number: index + 1 }) : `“${rows[index]!.label.trim()}”`);
  const problem = $derived(columnsProblem(rows.map((row) => row.label)));
  const message = $derived.by(() => {
    if (!problem) return null;
    if (problem.kind === "count") return t("columnsCount");
    if (problem.kind === "noFolder") return t("columnsNoFolder", { name: quoted(problem.index) });
    return t("columnsSameFolder", { first: quoted(problem.first), second: quoted(problem.second), folder: columnFolder(rows[problem.second]!.label) });
  });

  /** The loaded columns no row stands for any more, and that hold cards. */
  const removed = $derived(columns.filter((column) => column.cards.length > 0 && !rows.some((row) => row.from === column.folder)));
  const kept = $derived(rows.flatMap((row) => (row.from !== null ? [{ folder: row.from, label: row.label }] : [])));
  const choiceOf = (column: Column) => {
    const own = choices[column.folder];
    const target = own?.moveTo && kept.some((each) => each.folder === own.moveTo) ? own.moveTo : (kept[0]?.folder ?? null);
    return { keep: own?.keep ?? target === null, moveTo: target };
  };

  function save() {
    if (problem || saving) return;
    const removals: Record<string, Removal> = {};
    for (const column of removed) {
      const choice = choiceOf(column);
      removals[column.folder] = choice.keep || choice.moveTo === null ? "keep" : { moveTo: choice.moveTo };
    }
    onsave($state.snapshot(rows), removals);
  }

  /** Opens the `<dialog>` as a modal when it appears (the Host's frame blocks window.confirm). */
  function modal(node: HTMLDialogElement) {
    node.showModal();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  use:modal
  class="ld-form"
  aria-labelledby="edit-columns-title"
  oncancel={(event) => {
    event.preventDefault();
    if (!saving) onclose();
  }}
  onclick={(event) => {
    if (event.target === event.currentTarget && !saving) onclose();
  }}
>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      save();
    }}
  >
    <h2 id="edit-columns-title">{t("editColumns")}</h2>
    <fieldset>
      {#each rows as row, i (i)}
        <div class="row">
          <input type="text" aria-label={t("snColumnName")} aria-invalid={problem !== null && (("index" in problem && problem.index === i) || ("second" in problem && (problem.second === i || problem.first === i)))} bind:value={row.label} />
          <select aria-label={t("snColumnColor")} bind:value={row.color}>
            {#each KANBAN_COLORS as color (color)}<option value={color}>{t(`snKanban_${color}`)}</option>{/each}
          </select>
          <button type="button" disabled={rows.length <= 1} onclick={() => rows.splice(i, 1)}>{t("snRemoveColumn")}</button>
        </div>
      {/each}
      <div><button type="button" disabled={rows.length >= MAX_COLUMNS} onclick={() => rows.push({ label: "", color: KANBAN_COLORS[rows.length % KANBAN_COLORS.length]!, from: null })}>{t("snAddColumn")}</button></div>
      <p class="hint muted">{t("editColumnsHint")}</p>
    </fieldset>
    {#each removed as column (column.folder)}
      {@const choice = choiceOf(column)}
      <fieldset>
        <legend>{tn("columnHolds", column.cards.length, { name: column.label })}</legend>
        {#if kept.length > 0}
          <label>
            <input type="radio" name="removal-{column.folder}" checked={!choice.keep} onchange={() => (choices[column.folder] = { keep: false, moveTo: choice.moveTo })} />
            {t("columnMoveTo")}
            <select
              aria-label={t("columnMoveTo")}
              value={choice.moveTo}
              onchange={(event) => (choices[column.folder] = { keep: false, moveTo: event.currentTarget.value })}
            >
              {#each kept as each (each.folder)}<option value={each.folder}>{each.label}</option>{/each}
            </select>
          </label>
        {/if}
        <label>
          <input type="radio" name="removal-{column.folder}" checked={choice.keep} onchange={() => (choices[column.folder] = { keep: true, moveTo: choice.moveTo })} />
          {t("columnKeepFolder", { name: column.folder.slice(column.folder.lastIndexOf("/") + 1) })}
        </label>
      </fieldset>
    {/each}
    {#if message}<p class="invalid" role="alert">{message}</p>{/if}
    {#if failure}<p class="invalid" role="alert">{failure}</p>{/if}
    <div class="actions">
      <button type="button" disabled={saving} onclick={onclose}>{t("cancel")}</button>
      <button type="submit" class="primary" disabled={problem !== null || saving}>{t("saveNamed")}</button>
    </div>
  </form>
</dialog>

<style>
  /* The form look comes from .ld-form (base.css, docs/ui.md); only the dialog's own layout is here. */
  dialog {
    width: min(92vw, 32rem);
    padding: 1rem 1.25rem;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  /* Column and folder names show in full (docs/ui.md). */
  legend,
  label,
  p {
    overflow-wrap: anywhere;
  }
  h2 {
    margin: 0 0 0.8rem;
    font-size: 1.1rem;
  }
  .row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .row input {
    flex: 1 1 auto;
    min-width: 0;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.8rem;
  }
</style>
