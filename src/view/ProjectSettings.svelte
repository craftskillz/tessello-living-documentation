<script lang="ts">
  // The Project settings of the Active Project, in a dialog: its Repository grant (personal, kept in the Module's storage)
  // and the settings shared in its .living-doc.json. It only shows and asks: View acts and keeps the values.
  // The "shared" section is a list of fields: a new shared setting adds one.
  import { t } from "../lib/i18n.ts";
  import { DEFAULT_VISIBILITY, type TreeVisibility } from "../lib/project.ts";
  import { formatList, parseList } from "../lib/projectSettings.ts";

  let {
    folderName,
    displayName,
    onname,
    location,
    onlocation,
    repository,
    failure,
    softBreaks,
    visibility,
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
    /** The Project's Repository grant, null when it has none. */
    repository: { name: string; state: "available" | "unavailable" } | null;
    /** What went wrong the last time the repository was changed, translated. */
    failure: string | null;
    softBreaks: boolean;
    /** The Tree's two lists: the extensions of the other files it shows, the names it treats as hidden. */
    visibility: TreeVisibility;
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
      <div><button type="button" onclick={ondisconnectrepository}>{t("disconnectRepository")}</button></div>
    {:else}
      <div><button type="button" onclick={onconnectrepository}>{t("connectRepository")}</button></div>
      <p class="hint muted">{t("connectRepositoryHint")}</p>
    {/if}
    {#if failure}<p class="invalid" role="alert">{failure}</p>{/if}
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
  .wide {
    grid-column: 1 / -1;
  }
  .restore {
    margin-bottom: 0.75rem;
  }
  /* A narrow View: one column. */
  @media (max-width: 44rem) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
