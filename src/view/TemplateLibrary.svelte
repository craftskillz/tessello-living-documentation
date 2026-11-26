<script lang="ts">
  // The template library screen (a View state, never an address): folders, templates and the selected template's detail,
  // edited like a Document (autosave, Revert, conflict banner) and previewed like one (docs/spec/templates.md).
  import { onDestroy, onMount, untrack } from "svelte";
  import { createAutosave, type Autosave } from "../lib/autosave.ts";
  import { sideBySide } from "../lib/diff.ts";
  import { parseDocument } from "../lib/document.ts";
  import { loadImages } from "../lib/images.ts";
  import { t, tn } from "../lib/i18n.ts";
  import { Conflict, NotFound, refusalOf, type DocumentText, type RefusalReason } from "../lib/project.ts";
  import { renderDocument } from "../lib/render.ts";
  import { InvalidLegacyLibrary, type TemplateEntry, type TemplateFolder, type TemplateLibrary, TEMPLATES_FOLDER } from "../lib/templates.ts";
  import Editor from "./Editor.svelte";

  let {
    library,
    selected,
    softBreaks,
    readBytes,
    report,
    notify,
    failureText,
    refusalMessage,
    changeCount,
    onback,
  }: {
    library: TemplateLibrary;
    /** The template selected when the screen opens (none: the first one). */
    selected: string | null;
    softBreaks: boolean;
    readBytes: (path: string) => Promise<Uint8Array>;
    report: (message: string, reason?: unknown) => void;
    notify: (message: string) => void;
    /** What a dialog shows for a failed request. */
    failureText: (reason: unknown, change: boolean) => string;
    /** The message of a refusal, shown live under the field. */
    refusalMessage: (reason: RefusalReason, change?: boolean) => string;
    /** Changes when an agent changed something under `.templates/`: the list and the shown template are read again. */
    changeCount: number;
    onback: () => void;
  } = $props();

  const AUTOSAVE_MS = 1000;

  let folders = $state.raw<TemplateFolder[]>([]);
  let offersConversion = $state(false);
  let converting = $state(false);
  /** The selected folder; null: all templates. */
  let folder = $state<string | null>(null);
  let query = $state("");
  /** The paths the search matched; null while the field is blank. */
  let matches = $state.raw<Set<string> | null>(null);
  let searches = 0;
  let path = $state<string | null>(null);
  let current = $state.raw<DocumentText | null>(null);
  let mode = $state<"formatted" | "source">("formatted");

  const everything = $derived(folders.flatMap((each) => each.templates));
  const inScope = $derived(folder === null ? everything : (folders.find((each) => each.name === folder)?.templates ?? []));
  const visible = $derived(matches ? inScope.filter((entry) => matches!.has(entry.path)) : inScope);
  const entryOf = (target: string | null) => everything.find((entry) => entry.path === target) ?? null;
  const entry = $derived(entryOf(path));

  // Editing, as for a Document.
  let editing = $state(false);
  let original = "";
  let draft = $state("");
  let saving = $state(false);
  let autosave: Autosave | null = null;
  let conflict = $state.raw<{ theirs: DocumentText | null } | null>(null);
  let comparing = $state(false);
  let editor = $state<Editor>();

  async function reload() {
    try {
      folders = await library.list();
      offersConversion = await library.offersConversion();
    } catch (reason) {
      report(t("templatesReadFailed"), reason);
      return;
    }
    if (folder !== null && !folders.some((each) => each.name === folder)) folder = null;
    await search();
  }

  async function search() {
    const mine = ++searches;
    if (query.trim() === "") {
      matches = null;
      return;
    }
    try {
      const found = await library.search(query);
      if (mine === searches) matches = new Set(found.map((each) => each.path));
    } catch (reason) {
      if (mine === searches) report(t("templatesReadFailed"), reason);
    }
  }

  /** Shows `target`, or the first template of the list when it is gone or none was asked for. */
  async function show(target: string | null) {
    const wanted = entryOf(target) ?? visible[0] ?? null;
    if (wanted?.path === path && current) return;
    stopEditing();
    path = wanted?.path ?? null;
    current = null;
    if (!wanted) return;
    try {
      const read = await library.read(wanted.path);
      if (path === wanted.path) current = read;
    } catch (reason) {
      if (path !== wanted.path) return;
      if (reason instanceof NotFound) report(t("templateNotFound"));
      else report(t("templateReadFailed"), reason);
    }
  }

  /** Saves what was typed and ends the editing session; false, with the reason shown, when it cannot be saved. */
  async function settle(): Promise<boolean> {
    if (!(await flush())) return false;
    stopEditing();
    return true;
  }

  /** Saves what was typed; false when it cannot be (a conflict stays open). */
  export async function flush(): Promise<boolean> {
    if (!autosave || (await autosave.flush())) return true;
    if (conflict) report(t("conflictPending"));
    return false;
  }

  function stopEditing() {
    editing = false;
    autosave = null;
    conflict = null;
    comparing = false;
    saving = false;
  }

  async function choose(next: TemplateEntry) {
    if (next.path === path) return;
    if (!(await settle())) return;
    await show(next.path);
  }

  async function chooseFolder(next: string | null) {
    if (next === folder) return;
    folder = next;
    await search();
  }

  function edit() {
    if (!current || !path) return;
    const at = path;
    original = current.text;
    draft = current.text;
    editing = true;
    saving = false;
    autosave = createAutosave({
      saved: current.text,
      delay: AUTOSAVE_MS,
      save: async (text) => {
        const version = await library.save(at, text, current!.version);
        current = { text, version };
      },
      onchange: () => (saving = autosave?.saving ?? false),
      onerror: (reason) => {
        if (reason instanceof Conflict) {
          conflict = { theirs: reason.theirs };
          autosave?.pause();
        } else report(t("saveFailed"), reason);
      },
    });
  }

  function typed(text: string) {
    draft = text;
    autosave?.typed(text);
  }

  async function done() {
    await settle();
  }

  async function revert() {
    if (!autosave || !path) return;
    await autosave.stop();
    if (current!.text !== original) {
      try {
        // Reverting overwrites a change made on disk meanwhile, as Keep mine does.
        await library.save(path, original, conflict?.theirs?.version ?? current!.version);
      } catch (reason) {
        if (reason instanceof Conflict) {
          conflict = { theirs: reason.theirs };
          autosave.reset(draft);
          autosave.pause();
        } else report(t("revertFailed"), reason);
        return;
      }
    }
    const reread = await library.read(path).catch(() => null);
    stopEditing();
    if (reread) current = reread;
  }

  async function keepMine() {
    const theirs = conflict?.theirs;
    if (!theirs || !autosave || !path) return;
    try {
      const version = await library.save(path, draft, theirs.version);
      current = { text: draft, version };
      autosave.reset(draft);
      autosave.resume();
      conflict = null;
      comparing = false;
    } catch (reason) {
      if (reason instanceof Conflict) conflict = { theirs: reason.theirs };
      else report(t("saveFailed"), reason);
    }
  }

  async function takeTheirs() {
    const theirs = conflict?.theirs;
    if (!theirs || !autosave) return;
    try {
      await navigator.clipboard.writeText(draft);
    } catch (reason) {
      report(t("textCopyFailed"), reason);
      return;
    }
    current = theirs;
    draft = theirs.text;
    autosave.reset(theirs.text);
    autosave.resume();
    conflict = null;
    comparing = false;
  }

  // Agent edits: the list and the shown template are read again, a conflict while the template is edited.
  let seen = untrack(() => changeCount);
  $effect(() => {
    if (changeCount === seen) return;
    seen = changeCount;
    untrack(() => void outside());
  });

  async function outside() {
    await reload();
    const checked = path;
    if (!checked || autosave?.saving) return;
    const theirs = await library.read(checked).catch(() => null);
    if (path !== checked) return;
    if (editing) {
      if (theirs?.text !== draft) {
        conflict = { theirs };
        autosave?.pause();
      } else current = theirs;
    } else if (theirs) {
      current = theirs;
    } else {
      current = null;
      path = null;
      await show(null);
    }
  }

  // The selection follows the list: a template that went (deleted, filtered out) gives way to the first one.
  $effect(() => {
    void visible;
    untrack(() => {
      if (path !== null && visible.some((each) => each.path === path)) return;
      if (editing) return;
      void show(null);
    });
  });

  async function convert() {
    converting = true;
    try {
      const count = await library.convert();
      await reload();
      await show(path);
      notify(tn("libraryConverted", count));
    } catch (reason) {
      if (reason instanceof InvalidLegacyLibrary) report(t("libraryConvertInvalid"));
      else report(t("failed"), reason);
    } finally {
      converting = false;
    }
  }

  async function duplicate() {
    if (!entry || !(await settle())) return;
    const source = entry;
    try {
      const copy = await library.duplicate(source.path);
      await reload();
      await show(copy);
      notify(t("libraryDuplicated", { name: nameOf(copy) }));
    } catch (reason) {
      report(t("libraryDuplicateFailed", { name: source.name }), reason);
    }
  }

  // The dialogs: a name or a folder asked, or a deletion confirmed.
  type Dialog =
    | { kind: "newFolder"; name: string }
    | { kind: "renameFolder"; folder: string; name: string }
    | { kind: "newTemplate"; name: string; folder: string }
    | { kind: "renameTemplate"; entry: TemplateEntry; name: string }
    | { kind: "moveTemplate"; entry: TemplateEntry; folder: string }
    | { kind: "deleteTemplate"; entry: TemplateEntry }
    | { kind: "deleteFolder"; folder: string; count: number };
  let dialog = $state<(Dialog & { failure: string | null; running: boolean }) | null>(null);

  const nameOf = (file: string) => file.slice(file.lastIndexOf("/") + 1).replace(/\.md$/i, "");
  const open = (next: Dialog) => (dialog = { ...next, failure: null, running: false });
  const templatesOf = (name: string) => folders.find((each) => each.name === name)?.templates ?? [];

  /** Why the dialog's name is refused, against the names the list holds (null: acceptable). */
  const refusal = $derived.by(() => {
    if (!dialog) return null;
    if (dialog.kind === "newFolder") return refusalOf("folder", dialog.name, folders.map((each) => each.name));
    if (dialog.kind === "renameFolder") {
      const asked = dialog;
      return refusalOf("folder", dialog.name, folders.filter((each) => each.name !== asked.folder).map((each) => each.name));
    }
    if (dialog.kind === "newTemplate") return refusalOf("document", dialog.name, templatesOf(dialog.folder).map((each) => `${each.name}.md`));
    if (dialog.kind === "renameTemplate") {
      const asked = dialog.entry;
      return refusalOf("document", dialog.name, templatesOf(asked.folder).filter((each) => each.path !== asked.path).map((each) => `${each.name}.md`));
    }
    if (dialog.kind === "moveTemplate") {
      const asked = dialog.entry;
      return dialog.folder !== asked.folder && templatesOf(dialog.folder).some((each) => each.name.toLowerCase() === asked.name.toLowerCase()) ? ("taken" as const) : null;
    }
    return null;
  });
  const blocked = $derived(dialog !== null && (refusal !== null || (dialog.kind === "moveTemplate" && dialog.folder === dialog.entry.folder)));
  const shownRefusal = $derived(refusal !== null && refusal !== "empty" ? refusal : null);

  async function startFolderAction(kind: "renameFolder" | "deleteFolder") {
    if (folder === null || !(await settle())) return;
    if (kind === "renameFolder") open({ kind, folder, name: folder });
    else open({ kind, folder, count: templatesOf(folder).length });
  }

  async function startTemplateAction(kind: "renameTemplate" | "moveTemplate" | "deleteTemplate") {
    if (!entry || !(await settle())) return;
    if (kind === "renameTemplate") open({ kind, entry, name: entry.name });
    else if (kind === "moveTemplate") open({ kind, entry, folder: folders.find((each) => each.name !== entry!.folder)?.name ?? entry.folder });
    else open({ kind, entry });
  }

  async function submit() {
    if (!dialog || blocked || dialog.running) return;
    const asked = dialog;
    asked.running = true;
    asked.failure = null;
    try {
      let next: string | null = path;
      if (asked.kind === "newFolder") {
        await library.createFolder(asked.name);
        folder = asked.name;
      } else if (asked.kind === "renameFolder") {
        await library.renameFolder(asked.folder, asked.name);
        if (folder === asked.folder) folder = asked.name;
        if (path?.startsWith(`${TEMPLATES_FOLDER}/${asked.folder}/`)) next = `${TEMPLATES_FOLDER}/${asked.name}/${path.slice(`${TEMPLATES_FOLDER}/${asked.folder}/`.length)}`;
      } else if (asked.kind === "deleteFolder") {
        await library.removeFolder(asked.folder);
        if (folder === asked.folder) folder = null;
        if (path?.startsWith(`${TEMPLATES_FOLDER}/${asked.folder}/`)) next = null;
      } else if (asked.kind === "newTemplate") {
        next = await library.create(asked.folder, asked.name, `# ${asked.name}\n`);
      } else if (asked.kind === "renameTemplate") {
        next = await library.rename(asked.entry.path, asked.name);
      } else if (asked.kind === "moveTemplate") {
        next = await library.move(asked.entry.path, asked.folder);
      } else {
        await library.remove(asked.entry.path);
        if (path === asked.entry.path) next = null;
      }
      dialog = null;
      await reload();
      path = null;
      current = null;
      await show(next);
      // A template just created has a name, so it is edited at once and autosaved.
      if (asked.kind === "newTemplate") edit();
    } catch (reason) {
      asked.failure = failureText(reason, true);
      asked.running = false;
      await reload();
    }
  }

  function cancel() {
    if (!dialog?.running) dialog = null;
  }

  /** Opens a `<dialog>` as a modal when it appears (the Host's frame blocks window.confirm). */
  function modal(node: HTMLDialogElement) {
    node.showModal();
  }

  function newTemplate() {
    if (folders.length === 0) return;
    open({ kind: "newTemplate", name: "", folder: folder ?? folders[0].name });
  }

  const model = $derived(current && path ? parseDocument(current.text, path) : null);
  const html = $derived(
    model && path
      ? renderDocument(model, path, { footnotes: t("footnotes"), footnoteBack: t("footnoteBack"), compareSource: t("compareSource"), compareRender: t("compareRender") }, { softBreaks })
      : "",
  );
  let article = $state<HTMLElement>();
  // Images are read after each render, relative to the template file (renderDocument resolved them from its path).
  $effect(() => {
    void html;
    if (!article || mode !== "formatted" || editing) return;
    return loadImages(article, readBytes, (imagePath) => t("imageNotFound", { path: imagePath }));
  });

  onMount(async () => {
    await reload();
    await show(selected);
  });

  onDestroy(() => {
    searches++;
  });
</script>

<main class="library">
  <header class="top">
    <button type="button" class="back" onclick={onback}>{t("libraryBack")}</button>
    <div class="heading">
      <h1>{t("libraryTitle")}</h1>
      <p class="muted">{t("librarySubtitle")}</p>
    </div>
    <button type="button" class="primary" disabled={folders.length === 0} onclick={newTemplate}>{t("libraryNewTemplate")}</button>
  </header>

  {#if offersConversion}
    <div class="banner" role="region" aria-label={t("libraryConvert")}>
      <p>{t("libraryConvertText")}</p>
      <button type="button" class="primary" disabled={converting} onclick={() => void convert()}>{converting ? t("libraryConverting") : t("libraryConvert")}</button>
    </div>
  {/if}

  <div class="columns">
    <section class="folders ld-form" aria-labelledby="folders-title">
      <div class="column-head">
        <h2 id="folders-title">{t("libraryFolders")}</h2>
        <button type="button" onclick={() => open({ kind: "newFolder", name: "" })}>{t("libraryAddFolder")}</button>
      </div>
      <ul>
        <li>
          <button type="button" class="row" aria-current={folder === null} onclick={() => void chooseFolder(null)}>
            <span class="label">{t("libraryAllTemplates")}</span><span class="count muted">{everything.length}</span>
          </button>
        </li>
        {#each folders as each (each.name)}
          <li>
            <button type="button" class="row" aria-current={folder === each.name} onclick={() => void chooseFolder(each.name)}>
              <span class="label">{each.name}</span><span class="count muted">{each.templates.length}</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if folder !== null}
        <div class="tools">
          <button type="button" aria-label={t("renameFolder")} onclick={() => void startFolderAction("renameFolder")}>{t("rename")}</button>
          <button type="button" aria-label={t("deleteFolder")} onclick={() => void startFolderAction("deleteFolder")}>{t("delete")}</button>
        </div>
      {/if}
    </section>

    <section class="templates ld-form" aria-labelledby="templates-title">
      <div class="column-head">
        <h2 id="templates-title">{t("templates")}</h2>
        <span class="muted" role="status">{tn("libraryCount", visible.length)}</span>
      </div>
      <input type="search" aria-label={t("templatesSearchLabel")} placeholder={t("templatesSearch")} bind:value={query} oninput={() => void search()} />
      {#if folders.length === 0}
        <div class="empty">
          <p><strong>{t("libraryStartTitle")}</strong></p>
          <p class="muted">{t("libraryStartHint")}</p>
        </div>
      {:else if visible.length === 0}
        <p class="muted empty">{query.trim() !== "" ? t("templatesNoMatch") : t("templatesFolderEmpty")}</p>
      {:else}
        <ul>
          {#each visible as each (each.path)}
            <li>
              <button type="button" class="row stacked" aria-current={each.path === path} onclick={() => void choose(each)}>
                <span class="label">{each.name}</span>
                <span class="muted folder">{each.folder}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="detail ld-form" aria-labelledby="detail-title">
      {#if !entry || !current}
        <h2 id="detail-title" class="visually-hidden">{t("preview")}</h2>
        <p class="muted empty">{t("librarySelect")}</p>
      {:else}
        <h2 id="detail-title" class="name">{entry.folder} / {entry.name}</h2>
        <div class="actions">
          {#if editing}
            {#if saving}<span class="muted" role="status">{t("saving")}</span>{/if}
            <button type="button" onclick={() => void revert()}>{t("revert")}</button>
            <button type="button" class="primary" onclick={() => void done()}>{t("done")}</button>
          {:else}
            <button type="button" class="primary" onclick={edit}>{t("edit")}</button>
          {/if}
          <button type="button" onclick={() => void duplicate()}>{t("libraryDuplicate")}</button>
          <button type="button" disabled={folders.length < 2} onclick={() => void startTemplateAction("moveTemplate")}>{t("move")}</button>
          <button type="button" onclick={() => void startTemplateAction("renameTemplate")}>{t("rename")}</button>
          <button type="button" onclick={() => void startTemplateAction("deleteTemplate")}>{t("delete")}</button>
        </div>
        {#if conflict}
          <div class="banner" role="alert">
            <p>{conflict.theirs ? t("changedOutside") : t("deletedOutside")}</p>
            {#if conflict.theirs}
              <button type="button" onclick={() => (comparing = !comparing)}>{t("compare")}</button>
              <button type="button" onclick={() => void keepMine()}>{t("keepMine")}</button>
              <button type="button" class="primary" onclick={() => void takeTheirs()}>{t("takeTheirs")}</button>
            {/if}
          </div>
          {#if comparing && conflict.theirs}
            <section class="compare" aria-label={t("compare")}>
              <table>
                <thead><tr><th></th><th>{t("mine")}</th><th></th><th>{t("theirs")}</th></tr></thead>
                <tbody>
                  {#each sideBySide(draft, conflict.theirs.text) as row, index (index)}
                    <tr class={row.kind}>
                      <td class="n">{row.mineLine ?? ""}</td>
                      <td><pre>{row.mine ?? ""}</pre></td>
                      <td class="n">{row.theirsLine ?? ""}</td>
                      <td><pre>{row.theirs ?? ""}</pre></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </section>
          {/if}
        {/if}
        {#if editing}
          <Editor bind:this={editor} text={draft} label={t("markdown")} onchange={typed} />
        {:else}
          <div class="preview-head">
            <h3>{t("preview")}</h3>
            <div class="toggle" role="group" aria-label={t("preview")}>
              <button type="button" aria-pressed={mode === "formatted"} onclick={() => (mode = "formatted")}>{t("libraryFormatted")}</button>
              <button type="button" aria-pressed={mode === "source"} onclick={() => (mode = "source")}>{t("librarySource")}</button>
            </div>
          </div>
          {#if mode === "formatted"}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
            <article class="document" bind:this={article} onclick={(event) => event.preventDefault()}>{@html html}</article>
          {:else}
            <pre class="source">{current.text}</pre>
          {/if}
        {/if}
      {/if}
    </section>
  </div>
</main>

{#if dialog}
  {@const asked = dialog}
  <dialog use:modal aria-labelledby="library-dialog-title" class="ld-form" oncancel={(event) => { event.preventDefault(); cancel(); }}>
    <form onsubmit={(event) => { event.preventDefault(); void submit(); }}>
      <h2 id="library-dialog-title">
        {#if asked.kind === "newFolder"}{t("newFolder")}
        {:else if asked.kind === "renameFolder"}{t("renameFolder")}
        {:else if asked.kind === "newTemplate"}{t("libraryNewTemplateTitle")}
        {:else if asked.kind === "renameTemplate"}{t("libraryRenameTemplate")}
        {:else if asked.kind === "moveTemplate"}{t("libraryMoveTemplate")}
        {:else if asked.kind === "deleteTemplate"}{t("libraryDeleteTemplate")}
        {:else}{t("deleteFolder")}{/if}
      </h2>
      {#if asked.kind === "newFolder" || asked.kind === "renameFolder" || asked.kind === "newTemplate" || asked.kind === "renameTemplate"}
        <label class="field">
          {t("name")}
          <input
            type="text"
            aria-invalid={shownRefusal !== null || asked.failure !== null}
            bind:value={asked.name}
            oninput={() => (asked.failure = null)}
            autocomplete="off"
            spellcheck="false"
          />
        </label>
      {/if}
      {#if asked.kind === "newTemplate" || asked.kind === "moveTemplate"}
        <label class="field">
          {t("libraryFolder")}
          <select bind:value={asked.folder} onchange={() => (asked.failure = null)}>
            {#each folders as each (each.name)}<option value={each.name}>{each.name}</option>{/each}
          </select>
        </label>
      {/if}
      {#if asked.kind === "deleteTemplate"}
        <p class="wrap">{t("libraryDeleteTemplateText", { name: asked.entry.name })}</p>
      {:else if asked.kind === "deleteFolder"}
        <p class="wrap">{tn("libraryDeleteFolderText", asked.count, { name: asked.folder })}</p>
      {/if}
      {#if asked.kind === "deleteTemplate" || asked.kind === "deleteFolder"}
        <p class="hint muted">{t("cannotUndo")}</p>
      {/if}
      {#if asked.failure}
        <p class="invalid" role="alert">{asked.failure}</p>
      {:else if shownRefusal}
        <p class="invalid" role="alert">{refusalMessage(shownRefusal, true)}</p>
      {/if}
      <div class="buttons">
        <button type="button" disabled={asked.running} onclick={cancel}>{t("cancel")}</button>
        {#if asked.kind === "deleteTemplate" || asked.kind === "deleteFolder"}
          <button type="submit" class="danger" disabled={asked.running}>{asked.running ? t("deleting") : t("delete")}</button>
        {:else}
          <button type="submit" class="primary" disabled={blocked || asked.running}>
            {asked.kind === "moveTemplate" ? t("move") : asked.kind === "renameFolder" || asked.kind === "renameTemplate" ? t("rename") : t("create")}
          </button>
        {/if}
      </div>
    </form>
  </dialog>
{/if}

<style>
  .library {
    height: 100%;
    box-sizing: border-box;
    overflow: auto;
    padding: 1rem 2rem 2rem;
    display: grid;
    align-content: start;
    gap: 1rem;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
  }
  .heading {
    flex: 1;
    min-width: 12rem;
  }
  h1 {
    margin: 0;
    font-size: 1.4rem;
  }
  .heading p,
  h2,
  h3 {
    margin: 0;
  }
  h2 {
    font-size: 1rem;
  }
  h3 {
    font-size: 0.95rem;
  }
  .muted {
    color: var(--muted, #777);
  }
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    border: 1px solid #d9a400;
    background: color-mix(in srgb, #ffd54a 25%, transparent);
    border-radius: 6px;
    padding: 0.5rem 1rem;
  }
  .banner p {
    margin: 0;
    flex: 1;
    min-width: 12rem;
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(10rem, 14rem) minmax(12rem, 20rem) minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }
  @media (max-width: 60rem) {
    .columns {
      grid-template-columns: 1fr;
    }
  }
  .folders,
  .templates,
  .detail {
    display: grid;
    gap: 0.6rem;
    align-content: start;
    min-width: 0;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .column-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.15rem;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    width: 100%;
    text-align: left;
    border-color: transparent;
    background: transparent;
  }
  .row.stacked {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }
  .row[aria-current="true"] {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .label,
  .folder,
  .name {
    overflow-wrap: anywhere;
  }
  .folder {
    font-size: 0.8em;
  }
  .tools,
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }
  .empty {
    margin: 0.5rem 0;
  }
  .templates input[type="search"] {
    width: 100%;
    box-sizing: border-box;
  }
  .preview-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .toggle {
    display: flex;
    gap: 0.25rem;
  }
  .toggle button[aria-pressed="true"] {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border-color: var(--accent);
  }
  .source {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: 0.9em ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .compare {
    overflow: auto;
    max-height: 40vh;
  }
  .compare table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .compare th {
    text-align: left;
  }
  .compare pre {
    white-space: pre-wrap;
    margin: 0;
  }
  .compare td.n {
    width: 2.5rem;
    color: var(--muted, #777);
    text-align: right;
    vertical-align: top;
  }
  .compare tr.changed {
    background: color-mix(in srgb, #ffd54a 30%, transparent);
  }
  .compare tr.removed {
    background: color-mix(in srgb, #e53935 22%, transparent);
  }
  .compare tr.added {
    background: color-mix(in srgb, #43a047 22%, transparent);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  dialog {
    width: min(92vw, 26rem);
    padding: 1.25rem 1.5rem;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  dialog form {
    display: grid;
    gap: 0.75rem;
  }
  dialog h2 {
    font-size: 1.1rem;
  }
  dialog p {
    margin: 0;
  }
  .wrap {
    overflow-wrap: anywhere;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  button.danger {
    background: #e53935;
    border-color: #e53935;
    color: #fff;
  }
</style>
