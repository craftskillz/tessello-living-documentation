<script lang="ts">
  // The Project settings of the Active Project, in a dialog: its Repository grant (personal, kept in the Module's storage)
  // and the settings shared in its .living-doc.json. It only shows and asks: View acts and keeps the values.
  // The "shared" section is a list of fields: a new shared setting adds one.
  import { t } from "../lib/i18n.ts";

  let {
    folderName,
    displayName,
    onname,
    location,
    onlocation,
    repository,
    failure,
    softBreaks,
    onconnectrepository,
    ondisconnectrepository,
    onsoftbreaks,
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
    /** Opens the Host's folder prompt: called straight from the click. */
    onconnectrepository: () => void;
    ondisconnectrepository: () => void;
    onsoftbreaks: (on: boolean) => void;
    onclose: () => void;
  } = $props();

  function modal(node: HTMLDialogElement) {
    node.showModal();
  }
</script>

<dialog class="ld-form" use:modal aria-labelledby="project-settings-title" oncancel={(event) => { event.preventDefault(); onclose(); }}>
  <header>
    <h2 id="project-settings-title">{t("projectSettingsTitle")}</h2>
  </header>
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
  <fieldset>
    <legend>{t("sharedSettings")}</legend>
    <label class="check"><input type="checkbox" checked={softBreaks} onchange={(event) => onsoftbreaks(event.currentTarget.checked)} /> {t("softBreaks")}</label>
    <p class="hint muted">{t("softBreaksHint")}</p>
  </fieldset>
  <div class="actions"><button type="button" onclick={onclose}>{t("close")}</button></div>
</dialog>

<style>
  /* The form look comes from .ld-form (base.css, docs/ui.md); only the dialog's own layout is here. */
  dialog {
    width: min(92vw, 28rem);
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
</style>
