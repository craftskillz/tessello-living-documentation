<script lang="ts">
  // The Project settings of the Active Project, in a dialog: its Repository grant (personal, kept in the Module's storage)
  // and the settings shared in its .living-doc.json. It only shows and asks: View acts and keeps the values.
  // The "shared" section is a list of fields: a new shared setting adds one.
  import { t } from "../lib/i18n.ts";

  let {
    repository,
    failure,
    softBreaks,
    onconnectrepository,
    ondisconnectrepository,
    onsoftbreaks,
    onclose,
  }: {
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

<dialog use:modal aria-labelledby="project-settings-title" oncancel={(event) => { event.preventDefault(); onclose(); }}>
  <header>
    <h2 id="project-settings-title">{t("projectSettingsTitle")}</h2>
  </header>
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
    {#if failure}<p class="problem" role="alert">{failure}</p>{/if}
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
  dialog {
    width: min(92vw, 32rem);
    padding: 1.25rem 1.5rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  h2 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
  }
  fieldset {
    border: 1px solid var(--line);
    border-radius: 6px;
    margin: 0 0 0.8rem;
    padding: 0.5rem 0.8rem 0.7rem;
    display: grid;
    gap: 0.4rem;
  }
  .repository {
    margin: 0;
  }
  .hint {
    margin: 0;
    font-size: 0.85em;
  }
  .check {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
  }
  .problem {
    color: #e53935;
    font-size: 0.875rem;
    margin: 0;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
