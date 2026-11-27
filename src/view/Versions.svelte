<script lang="ts">
  // The Versions dialog (docs/spec/git-versioning.md): the commits that changed the open Document in a period, and the
  // comparison of the file on disk with one of them. **<** and Undo write the file on disk (version-checked); the repository is only read.
  import type { Files, Folder } from "@tessello/sdk";
  import { onMount } from "svelte";
  import { foldRows, restorable, sideBySide, type DiffRow, type Segment } from "../lib/diff.ts";
  import { applyEdits, type TextEdit } from "../lib/edits.ts";
  import { Conflict, type DocumentText } from "../lib/project.ts";
  import { clampPeriod, type Commit, type History, HistoryFailure, openHistory, suggestsGc } from "../lib/history.ts";
  import { currentLocale, t, tn } from "../lib/i18n.ts";

  let {
    files,
    repository,
    project,
    path,
    current,
    write,
    period: initialPeriod,
    onprojectpath,
    onclose,
  }: {
    files: Pick<Files, "list" | "read">;
    /** The Project's Repository grant. */
    repository: Folder;
    /** The Project folder. */
    project: Folder;
    /** The Document's path in the Project, as it is read. */
    path: string;
    /** The Document as the View last read it from disk. */
    current: DocumentText;
    /** Writes the text over the Document if it is still at that version; rejects with a Conflict when it is not. */
    write: (text: string, version: string) => Promise<DocumentText>;
    /** How many days back the list starts, from the Project settings. */
    period: number;
    /** Where the Project folder lies in the repository, called when the list is read and the Project is tracked. */
    onprojectpath?: (path: string) => void;
    onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  const asked = { files, repository, project, path };
  // svelte-ignore state_referenced_locally
  let period = $state(initialPeriod);
  // svelte-ignore state_referenced_locally
  let mine = $state<DocumentText>(current);
  /** The texts before each restore of this dialog session, the last one on top. */
  let undo = $state.raw<string[]>([]);
  let writing = $state(false);
  let status = $state<string | null>(null);
  let alert = $state<string | null>(null);
  let gone = $state(false);
  let loading = $state(true);
  let failure = $state<string | null>(null);
  /** The loose objects of a repository that was slow to read: `git gc` would help. Shown until the dialog closes. */
  let gcHint = $state<number | null>(null);
  let gcCopied = $state<"copied" | "failed" | null>(null);
  let commits = $state.raw<Commit[]>([]);
  let history: History | null = null;
  let selected = $state<Commit | null>(null);
  /** The file at the selected commit: null when it has none there. */
  let theirs = $state<string | null>(null);
  let comparing = $state(false);
  let opened = $state(new Set<string>());
  /** Bumped by every load and every choice, so that a slow answer to an earlier one is dropped. */
  let turn = 0;

  const dateFormat = $derived(new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium", timeStyle: "short" }));

  const rows = $derived<DiffRow[]>(selected && !comparing ? sideBySide(mine.text, theirs ?? "") : []);
  const blocks = $derived(new Map<DiffRow, TextEdit>(selected && !comparing ? restorable(mine.text, theirs ?? "", rows).map((block) => [rows[block.row]!, block.edit] as const) : []));
  const segments = $derived<Segment[]>(foldRows(rows));
  const folds = $derived(segments.filter((segment) => segment.kind === "fold"));

  /** The message each reason History could not be read gives. */
  const MESSAGES = { unavailable: "versionsUnavailable", notRepository: "versionsNotRepository", failed: "versionsFailed" } as const;

  function messageOf(reason: unknown): string {
    return t(reason instanceof HistoryFailure ? MESSAGES[reason.reason] : "versionsFailed");
  }

  /** Reads the list for the period typed, on a History of its own so that new commits appear, and compares the default commit. */
  async function load() {
    const ticket = ++turn;
    period = clampPeriod(period);
    loading = true;
    failure = null;
    selected = null;
    opened = new Set();
    const started = performance.now();
    try {
      const fresh = await openHistory(asked.files, asked.repository, asked.project);
      const list = await fresh.commits(asked.path, period);
      const found = await fresh.projectPath();
      if (found !== null) onprojectpath?.(found);
      const first = await fresh.defaultCommit(asked.path, mine.text, list);
      const text = first ? await fresh.fileAt(first.id, first.path) : null;
      if (ticket !== turn) return;
      if (suggestsGc({ looseObjects: fresh.looseObjects, elapsed: performance.now() - started })) gcHint ??= fresh.looseObjects;
      history = fresh;
      commits = list;
      theirs = text;
      selected = first;
    } catch (reason) {
      if (ticket !== turn) return;
      history = null;
      commits = [];
      failure = messageOf(reason);
    } finally {
      if (ticket === turn) loading = false;
    }
  }

  async function copyGc() {
    try {
      await navigator.clipboard.writeText("git gc");
      gcCopied = "copied";
    } catch {
      gcCopied = "failed";
    }
  }

  async function choose(commit: Commit) {
    if (!history || commit.id === selected?.id) return;
    const ticket = ++turn;
    comparing = true;
    try {
      const text = await history.fileAt(commit.id, commit.path);
      if (ticket !== turn) return;
      theirs = text;
      selected = commit;
      opened = new Set();
      failure = null;
    } catch (reason) {
      if (ticket !== turn) return;
      failure = messageOf(reason);
    } finally {
      if (ticket === turn) comparing = false;
    }
  }

  /** Writes `text` over the file; on a Conflict reloads the comparison from the disk's text. Returns whether it was written. */
  async function put(text: string, failed: string): Promise<boolean> {
    writing = true;
    status = null;
    alert = null;
    try {
      mine = await write(text, mine.version);
      return true;
    } catch (reason) {
      if (reason instanceof Conflict) {
        undo = [];
        if (reason.theirs) {
          mine = reason.theirs;
          alert = t("versionsReloaded");
        } else {
          gone = true;
          alert = t("versionsGone");
        }
      } else alert = t(failed);
      return false;
    } finally {
      writing = false;
    }
  }

  async function restore(edit: TextEdit) {
    const before = mine.text;
    if (await put(applyEdits(before, [edit]), "versionsRestoreFailed")) {
      undo = [...undo, before];
      status = t("versionsRestored");
    }
  }

  async function undoLast() {
    const before = undo.at(-1);
    if (before === undefined) return;
    if (await put(before, "versionsUndoFailed")) {
      undo = undo.slice(0, -1);
      status = t("versionsUndone");
    }
  }

  function toggle(key: string) {
    const next = new Set(opened);
    if (!next.delete(key)) next.add(key);
    opened = next;
  }

  const expandAll = () => (opened = new Set(folds.map((fold) => fold.key)));
  const collapseAll = () => (opened = new Set());

  onMount(() => void load());

  /** Opens the `<dialog>` as a modal when it appears (the Host's frame blocks window.confirm). */
  function modal(node: HTMLDialogElement) {
    node.showModal();
  }
</script>

{#snippet gutter(row: DiffRow)}
  {@const edit = blocks.get(row)}
  <span class="gutter">
    {#if edit && selected}
      <button type="button" class="restore" disabled={writing || gone} aria-label={t("versionsRestore", { id: selected.shortId })} title={t("versionsRestore", { id: selected.shortId })} onclick={() => void restore(edit)}>&lt;</button>
    {/if}
  </span>
{/snippet}

{#snippet cell(side: "mine" | "theirs", row: DiffRow)}
  {@const text = side === "mine" ? row.mine : row.theirs}
  {@const line = side === "mine" ? row.mineLine : row.theirsLine}
  {@const state = text === null ? "missing" : row.kind === "same" ? "same" : "only"}
  <span class="num" data-side={side} data-state={state}>{line ?? ""}</span>
  <span class="cell" data-side={side} data-state={state}>{text ?? ""}</span>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  use:modal
  class="ld-form"
  aria-labelledby="versions-title"
  oncancel={(event) => {
    event.preventDefault();
    onclose();
  }}
  onclick={(event) => {
    if (event.target === event.currentTarget) onclose();
  }}
>
  <header>
    <div class="titles">
      <h2 id="versions-title">{t("versionsTitle")}</h2>
      <p class="hint muted path">{asked.path}</p>
    </div>
    <button type="button" onclick={onclose}>{t("close")}</button>
  </header>

  <form
    class="toolbar"
    novalidate
    onsubmit={(event) => {
      event.preventDefault();
      void load();
    }}
  >
    <label class="field">
      <span>{t("versionsPeriod")}</span>
      <input type="number" min="1" max="3650" step="1" bind:value={period} />
    </label>
    <button type="submit">{t("versionsRefresh")}</button>
    {#if undo.length > 0}
      <button type="button" disabled={writing} onclick={() => void undoLast()}>{t("versionsUndo")}</button>
    {/if}
    {#if folds.length > 0}
      <button type="button" onclick={expandAll}>{t("versionsExpandAll")}</button>
      <button type="button" onclick={collapseAll}>{t("versionsCollapseAll")}</button>
    {/if}
  </form>

  {#if alert}
    <p class="invalid" role="alert">{alert}</p>
  {/if}
  {#if status}
    <p class="muted" role="status">{status}</p>
  {/if}
  {#if failure}
    <p class="invalid" role="alert">{failure}</p>
  {/if}
  {#if gcHint !== null}
    <div class="gc" role="note">
      <p>{t("versionsGcHint", { count: gcHint.toLocaleString(currentLocale()) })}</p>
      <button type="button" onclick={() => void copyGc()}>{t("versionsGcCopy")}</button>
      {#if gcCopied}<span class="muted" role="status">{t(gcCopied === "copied" ? "versionsGcCopied" : "versionsGcCopyFailed")}</span>{/if}
    </div>
  {/if}
  {#if loading}
    <p class="muted" role="status">{t("versionsLoading")}</p>
  {:else if !failure}
    {#if commits.length === 0}
      <p class="muted">{t("versionsNone")}</p>
    {:else}
      <div class="commits" role="group" aria-label={t("versionsCommits")}>
        {#each commits as commit (commit.id)}
          <button type="button" class="card" aria-pressed={commit.id === selected?.id} title={t("versionsCompare", { id: commit.shortId })} onclick={() => void choose(commit)}>
            <code>{commit.shortId}</code>
            <span class="message">{commit.message}</span>
            <small class="muted">{dateFormat.format(commit.date)}</small>
            <small class="muted">{commit.author}</small>
          </button>
        {/each}
      </div>
    {/if}
    {#if selected}
      {#if theirs === null}
        <p class="note">{t("versionsMissing")}</p>
      {/if}
      <div class="diff" aria-busy={comparing}>
        <span class="head"></span>
        <span class="head">{t("versionsCurrent")}</span>
        <span class="head"></span>
        <span class="head"></span>
        <span class="head">{t("versionsCommit", { id: selected.shortId })}{selected.path !== asked.path ? ` · ${selected.path}` : ""}</span>
        {#each segments as segment, index (segment.kind === "fold" ? segment.key : `rows-${index}`)}
          {#if segment.kind === "fold" && !opened.has(segment.key)}
            <button type="button" class="bar" onclick={() => toggle(segment.key)}>{tn("versionsUnchanged", segment.rows.length)}</button>
          {:else}
            {#if segment.kind === "fold"}
              <button type="button" class="bar" onclick={() => toggle(segment.key)}>{tn("versionsCollapseRun", segment.rows.length)}</button>
            {/if}
            {#each segment.rows as row, at (at)}
              {@render cell("mine", row)}
              {@render gutter(row)}
              {@render cell("theirs", row)}
            {/each}
          {/if}
        {/each}
      </div>
    {/if}
  {/if}
</dialog>

<style>
  dialog {
    width: min(94vw, 70rem);
    max-height: 90vh;
    padding: 1rem 1.25rem;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
  }
  dialog[open] {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .path,
  p {
    overflow-wrap: anywhere;
  }
  p {
    margin: 0;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem;
  }
  .toolbar input {
    width: 6rem;
  }
  .gc {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  .gc p {
    flex: 1 1 20rem;
    margin: 0;
  }
  .commits {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.3rem;
    flex: none;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    flex: none;
    width: 14rem;
    text-align: left;
    white-space: normal;
  }
  .card[aria-pressed="true"] {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .message {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .note {
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    color: light-dark(#7a4b00, #fbbf24);
    background: light-dark(#fef3c7, #3a2a05);
    border: 1px solid light-dark(#f59e0b, #b45309);
  }
  .diff {
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr) 2.2rem 3rem minmax(0, 1fr);
    overflow: auto;
    min-height: 0;
    border: 1px solid var(--line);
    border-radius: 6px;
    font: 0.85em ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .head {
    position: sticky;
    top: 0;
    padding: 0.25rem 0.5rem;
    font-weight: 600;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }
  .num {
    padding: 0 0.4rem;
    text-align: right;
    color: var(--muted, #777);
  }
  .cell {
    padding: 0 0.5rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .cell[data-side="theirs"],
  .num[data-side="theirs"] {
    border-left: 1px solid var(--line);
  }
  [data-state="missing"] {
    background: color-mix(in srgb, var(--muted, #777) 14%, transparent);
  }
  [data-side="mine"][data-state="only"] {
    background: light-dark(#d1fae5, #12372a);
  }
  [data-side="theirs"][data-state="only"] {
    background: light-dark(#fee2e2, #451a1a);
  }
  .gutter {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    border-left: 1px solid var(--line);
  }
  .restore {
    padding: 0 0.4rem;
    line-height: 1.3;
  }
  .bar {
    grid-column: 1 / -1;
    border-radius: 0;
    border-width: 1px 0;
    text-align: center;
    color: var(--muted, #777);
  }
</style>
