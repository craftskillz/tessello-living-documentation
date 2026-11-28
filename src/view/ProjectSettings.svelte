<script lang="ts">
  // The Project settings of the Active Project, in a dialog: its Repository grant (personal, kept in the Module's storage)
  // and the settings shared in its .living-doc.json. It only shows and asks: View acts and keeps the values.
  // The "shared" section is a list of fields: a new shared setting adds one.
  import { currentLocale, t, tn } from "../lib/i18n.ts";
  import type { SyncEntry } from "../lib/projects.ts";
  import { commitTime, repositoryPathOf, type SyncState, syncCommand } from "../lib/sync.ts";
  import { clampPeriod } from "../lib/period.ts";
  import { DEFAULT_VISIBILITY, type TreeVisibility } from "../lib/project.ts";
  import { formatList, parseList } from "../lib/projectSettings.ts";
  import { DEFAULT_TABLE_ACCENTS, type TableColorName, type TablePalette } from "../lib/tablePalette.ts";
  import { TABLE_COLORS } from "../lib/snippets.ts";
  import { normalizeTagNames, splitTagNames } from "../lib/tagMarkers.ts";

  let {
    folderName,
    displayName,
    onname,
    location,
    onlocation,
    versionsPeriod,
    onversionsperiod,
    repository,
    failure,
    sync,
    syncFailed,
    softBreaks,
    visibility,
    tagNames,
    ontagnames,
    tablePalette,
    ontablepalette,
    onconnectrepository,
    ondisconnectrepository,
    onsoftbreaks,
    onshown,
    onexcluded,
    onclose,
  }: {
    /** The Project folder's name: the Host never gives its path on disk. */
    folderName: string;
    /** The name the User gave the Project, empty when it shows its folder's. */
    displayName: string;
    /** The User changed the name shown (on Enter or when the field is left). */
    onname: (name: string) => void;
    /** Where the folder is on disk, as the User typed it; empty when they did not. */
    location: string;
    /** The User changed the location (on Enter or when the field is left). */
    onlocation: (location: string) => void;
    /** How many days back Versions looks when it opens. */
    versionsPeriod: number;
    /** The User changed it (on Enter or when the field is left). */
    onversionsperiod: (days: number) => void;
    /** The Project's Repository grant, null when it has none. */
    repository: { name: string; state: "available" | "unavailable" } | null;
    /** What went wrong the last time the repository was changed, translated. */
    failure: string | null;
    /** What `tessello sync` did for the Project, its `sync` entry and the time it was read; null without a Repository grant. */
    sync: { state: SyncState; entry: SyncEntry | null; now: number } | null;
    /** The last read of what `tessello sync` did failed. */
    syncFailed: boolean;
    softBreaks: boolean;
    /** The Tree's two lists: the extensions of the other files it shows, the names it treats as hidden. */
    visibility: TreeVisibility;
    /** The Tag names suggested when inserting a Tag marker. */
    tagNames: string[];
    /** The User changed the Tag names (already valid and normalized). */
    ontagnames: (names: string[]) => void;
    /** The accents the User changed for the five table colours. */
    tablePalette: TablePalette;
    /** The User picked a colour or restored the defaults (the palette holds only the colours that differ from the defaults). */
    ontablepalette: (palette: TablePalette) => void;
    /** Opens the Host's folder prompt: called straight from the click. */
    onconnectrepository: () => void;
    ondisconnectrepository: () => void;
    onsoftbreaks: (on: boolean) => void;
    /** The User changed the extensions shown, or restored their default. */
    onshown: (list: string[]) => void;
    /** The User changed the excluded names, or restored their default. */
    onexcluded: (list: string[]) => void;
    onclose: () => void;
  } = $props();

  /** Commits a list field on Enter or when it is left, only when it changed; the field shows the list as kept. */
  function commit(input: HTMLInputElement, current: string[], change: (list: string[]) => void) {
    const next = parseList(input.value);
    if (formatList(next) === formatList(current)) input.value = formatList(current);
    else change(next);
  }

  /** The names the User typed that are not valid; the field keeps what they typed until it is fixed. */
  let invalidTags = $state<string[]>([]);

  function commitTags(input: HTMLInputElement) {
    const { names, invalid } = normalizeTagNames(splitTagNames(input.value));
    invalidTags = invalid;
    if (invalid.length > 0) return;
    if (names.join(", ") === tagNames.join(", ")) input.value = tagNames.join(", ");
    else ontagnames(names);
  }

  /** Commits a picked colour (on `change`, not while the picker is dragged); the default accent is not kept in the palette. */
  function commitColor(name: TableColorName, value: string) {
    const next: TablePalette = { ...tablePalette };
    if (value.toLowerCase() === DEFAULT_TABLE_ACCENTS[name]) delete next[name];
    else next[name] = value.toLowerCase();
    ontablepalette(next);
  }

  /** The command to start sync: the repository's path, or a placeholder to replace when it is not known. */
  const command = $derived.by(() => {
    if (!sync) return "";
    const path = repositoryPathOf({ used: sync.state.repository, location: sync.entry?.location, path: sync.entry?.path });
    return syncCommand(path ?? t("syncPathPlaceholder", { name: repository?.name ?? "" }));
  });
  const lastCommit = $derived(sync?.state.lastCommit ?? null);
  const when = $derived(lastCommit && sync ? commitTime(lastCommit.at, sync.now, currentLocale()) : null);
  /** Sync cannot find the Project by its location nor by its path in the repository. */
  const unlocatable = $derived(!!sync && sync.entry?.path === undefined && !sync.entry?.location);
  let copied = $state<"copied" | "failed" | null>(null);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      copied = "copied";
    } catch {
      copied = "failed";
    }
  }

  function modal(node: HTMLDialogElement) {
    node.showModal();
  }
</script>

<dialog class="ld-form" use:modal aria-labelledby="project-settings-title" oncancel={(event) => { event.preventDefault(); onclose(); }}>
  <header>
    <h2 id="project-settings-title">{t("projectSettingsTitle")}</h2>
  </header>
  <div class="columns">
  <fieldset>
    <legend>{t("projectIdentity")}</legend>
    <p class="folder"><span class="muted">{t("projectFolder")}</span> <strong>{folderName}</strong></p>
    <label class="field">
      {t("projectName")}
      <input
        type="text"
        maxlength="200"
        value={displayName}
        placeholder={folderName}
        onchange={(event) => onname(event.currentTarget.value)}
        onkeydown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
    <p class="hint muted">{t("projectNameHint")}</p>
    <label class="field">
      {t("projectLocation")}
      <input
        type="text"
        class="mono"
        maxlength="1000"
        value={location}
        placeholder="/Users/…/{folderName}"
        spellcheck="false"
        autocomplete="off"
        onchange={(event) => onlocation(event.currentTarget.value)}
        onkeydown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
    <p class="hint muted">{t("projectLocationHint")}</p>
  </fieldset>
  <fieldset>
    <legend>{t("repository")}</legend>
    {#if repository}
      <p class="repository">
        <strong>{repository.name}</strong>
        {#if repository.state === "unavailable"}<span class="muted">{t("repositoryUnavailable")}</span>{/if}
      </p>
      {#if sync}
        <div class="sync">
          {#if lastCommit && when}
            <p class="hint muted">{t("syncLastCommit", { day: when.day, time: when.time, id: lastCommit.id, documents: tn("syncDocuments", lastCommit.documents.length) })}</p>
          {/if}
          {#if sync.state.running && sync.state.problem}
            <p class="invalid" role="alert">{t("syncProblem", { message: sync.state.problem.message })}</p>
          {:else if !sync.state.running || sync.state.repository === null}
            <p class="hint muted">{t(sync.state.running ? "syncOtherRepository" : "syncNotRunning")}</p>
            <p><code class="mono">{command}</code></p>
            <div class="copy">
              <button type="button" onclick={() => void copyCommand()}>{t("syncCopy")}</button>
              {#if copied === "copied"}<span class="muted" role="status">{t("syncCopied")}</span>{/if}
            </div>
            {#if copied === "failed"}<p class="invalid" role="alert">{t("syncCopyFailed")}</p>{/if}
          {/if}
          {#if unlocatable}<p class="hint muted">{t("syncLocationHint")}</p>{/if}
        </div>
      {/if}
      {#if syncFailed}<p class="invalid" role="alert">{t("syncReadFailed")}</p>{/if}
      <div><button type="button" onclick={ondisconnectrepository}>{t("disconnectRepository")}</button></div>
    {:else}
      <div><button type="button" onclick={onconnectrepository}>{t("connectRepository")}</button></div>
      <p class="hint muted">{t("connectRepositoryHint")}</p>
    {/if}
    {#if failure}<p class="invalid" role="alert">{failure}</p>{/if}
    <label class="field">
      {t("versionsDefaultPeriod")}
      <input
        type="number"
        min="1"
        max="3650"
        step="1"
        value={versionsPeriod}
        onchange={(event) => {
          const days = clampPeriod(event.currentTarget.valueAsNumber);
          event.currentTarget.value = String(days);
          onversionsperiod(days);
        }}
        onkeydown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
    <p class="hint muted">{t("versionsDefaultPeriodHint")}</p>
    <p class="hint muted">{t("repositoryKeptHint")}</p>
  </fieldset>
  <fieldset class="wide">
    <legend>{t("sharedSettings")}</legend>
    <div class="columns">
    <div>
    <label class="check"><input type="checkbox" checked={softBreaks} onchange={(event) => onsoftbreaks(event.currentTarget.checked)} /> {t("softBreaks")}</label>
    <p class="hint muted">{t("softBreaksHint")}</p>
    </div>
    <div>
    <label class="field">
      {t("treeShown")}
      <input
        type="text"
        class="mono"
        value={formatList(visibility.shownExtensions)}
        spellcheck="false"
        autocomplete="off"
        onchange={(event) => commit(event.currentTarget, visibility.shownExtensions, onshown)}
        onkeydown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
    <p class="hint muted">{t("treeShownHint", { list: formatList(DEFAULT_VISIBILITY.shownExtensions) })}</p>
    <div class="restore"><button type="button" aria-label={t("restoreDefaultsOf", { field: t("treeShown") })} onclick={() => onshown(DEFAULT_VISIBILITY.shownExtensions)}>{t("restoreDefaults")}</button></div>
    <label class="field">
      {t("treeExcluded")}
      <input
        type="text"
        class="mono"
        value={formatList(visibility.excluded)}
        spellcheck="false"
        autocomplete="off"
        onchange={(event) => commit(event.currentTarget, visibility.excluded, onexcluded)}
        onkeydown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
    <p class="hint muted">{t("treeExcludedHint", { list: formatList(DEFAULT_VISIBILITY.excluded) })}</p>
    <div class="restore"><button type="button" aria-label={t("restoreDefaultsOf", { field: t("treeExcluded") })} onclick={() => onexcluded(DEFAULT_VISIBILITY.excluded)}>{t("restoreDefaults")}</button></div>
    <label class="field">
      {t("tagNames")}
      <input
        type="text"
        class="mono"
        value={tagNames.join(", ")}
        spellcheck="false"
        autocomplete="off"
        onchange={(event) => commitTags(event.currentTarget)}
        onkeydown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
    <p class="hint muted">{t("tagNamesHint")}</p>
    {#if invalidTags.length > 0}<p class="invalid" role="alert">{t("tagNamesInvalid", { list: invalidTags.join(", ") })}</p>{/if}
    <fieldset>
      <legend>{t("tableColors")}</legend>
      <div class="swatches">
        {#each TABLE_COLORS as name (name)}
          <!-- Keyed on the colour kept, so the picker shows the previous colour again when a write fails. -->
          {#key tablePalette[name] ?? ""}
            <label>
              <input type="color" value={tablePalette[name] ?? DEFAULT_TABLE_ACCENTS[name]} onchange={(event) => commitColor(name, event.currentTarget.value)} />
              {t(`tableColor_${name}`)}
            </label>
          {/key}
        {/each}
      </div>
      <p class="hint muted">{t("tableColorsHint")}</p>
      <div class="restore"><button type="button" aria-label={t("restoreDefaultsOf", { field: t("tableColors") })} onclick={() => ontablepalette({})}>{t("restoreDefaults")}</button></div>
    </fieldset>
    </div>
    </div>
  </fieldset>
  </div>
  <div class="actions"><button type="button" onclick={onclose}>{t("close")}</button></div>
</dialog>

<style>
  /* The form look comes from .ld-form (base.css, docs/ui.md); only the dialog's own layout is here. */
  dialog {
    width: min(94vw, 60rem);
    max-height: 94vh;
    overflow: auto;
    padding: 1rem 1.25rem;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.2);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  h2 {
    margin: 0 0 0.8rem;
    font-size: 1.1rem;
  }
  .repository,
  .folder {
    margin: 0;
    overflow-wrap: anywhere;
  }
  /* The command is a path: it wraps anywhere. */
  .sync code {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .sync p {
    margin: 0.3rem 0;
  }
  .copy {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.5rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
  /* Side by side: this Project's identity and its repository, then the shared settings across, in two columns of their own. */
  .columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 2rem;
    align-items: start;
  }
  /* Grey rules mark the zones: one between the two columns, one above the shared settings, across. */
  .columns > :nth-child(2) {
    border-left: 1px solid var(--line);
    padding-left: 2rem;
    align-self: stretch;
    align-content: start;
  }
  .wide {
    grid-column: 1 / -1;
    border-top: 1px solid var(--line);
    padding-top: 0.9rem;
    margin-top: 0.4rem;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.2rem;
  }
  .restore {
    margin-bottom: 0.75rem;
  }
  /* A narrow View: one column. */
  @media (max-width: 44rem) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }
    .columns > :nth-child(2) {
      border-left: 0;
      padding-left: 0;
    }
  }
</style>
