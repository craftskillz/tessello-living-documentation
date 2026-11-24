<script lang="ts">
  // The settings cog of the Document header: what the Tree shows for a Document (file name or title) and the Project's label
  // filter, plus the Project's own setting (every newline is a line break, shared in .living-doc.json). It only shows and asks: View keeps the choices.
  import { t } from "../lib/i18n.ts";
  import { compileLabelFilter, type LabelFilter } from "../lib/labels.ts";
  import type { TreeLabels } from "../lib/projects.ts";

  let {
    treeLabels,
    filter,
    softBreaks,
    onlabels,
    onfilter,
    onsoftbreaks,
  }: {
    treeLabels: TreeLabels;
    /** The Project's kept filter: the fields start from it. */
    filter: LabelFilter;
    /** The Project's setting: every newline is a line break. */
    softBreaks: boolean;
    onlabels: (treeLabels: TreeLabels) => void;
    /** A valid filter, to apply and keep. */
    onfilter: (filter: LabelFilter) => void;
    /** The new value of the Project's setting. */
    onsoftbreaks: (on: boolean) => void;
  } = $props();

  let shown = $state(false);
  let root = $state<HTMLElement>();
  let button = $state<HTMLButtonElement>();
  let pattern = $state("");
  let replacement = $state("");
  const invalid = $derived(!compileLabelFilter({ pattern, replacement }).ok);

  function toggle() {
    shown = !shown;
    if (shown) {
      pattern = filter.pattern;
      replacement = filter.replacement;
    }
  }

  function changed() {
    const next = { pattern, replacement };
    if (compileLabelFilter(next).ok) onfilter(next);
  }

  function onwindowkey(event: KeyboardEvent) {
    if (shown && event.key === "Escape") {
      shown = false;
      button?.focus();
    }
  }

  function onwindowpointer(event: PointerEvent) {
    if (shown && root && !root.contains(event.target as Node)) shown = false;
  }
</script>

<svelte:window onkeydown={onwindowkey} onpointerdown={onwindowpointer} />

<div class="settings" bind:this={root}>
  <button type="button" bind:this={button} aria-label={t("displaySettings")} title={t("displaySettings")} aria-haspopup="dialog" aria-expanded={shown} onclick={toggle}>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      ><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg
    >
  </button>
  {#if shown}
    <div class="panel" role="dialog" aria-label={t("displaySettings")}>
      <fieldset>
        <legend>{t("treeShows")}</legend>
        <label><input type="radio" name="tree-labels" checked={treeLabels === "name"} onchange={() => onlabels("name")} /> {t("treeShowsNames")}</label>
        <label><input type="radio" name="tree-labels" checked={treeLabels === "title"} onchange={() => onlabels("title")} /> {t("treeShowsTitles")}</label>
      </fieldset>
      <fieldset>
        <legend>{t("labelFilter")}</legend>
        <label class="field">
          {t("labelPattern")}
          <input type="text" class="mono" bind:value={pattern} oninput={changed} spellcheck="false" autocomplete="off" aria-invalid={invalid} aria-describedby={invalid ? "label-pattern-invalid" : undefined} />
        </label>
        {#if invalid}<p id="label-pattern-invalid" class="invalid" role="alert">{t("labelPatternInvalid")}</p>{/if}
        <label class="field">
          {t("labelReplacement")}
          <input type="text" class="mono" bind:value={replacement} oninput={changed} spellcheck="false" autocomplete="off" />
        </label>
        <p class="hint muted">{t("labelFilterHint")}</p>
      </fieldset>
      <fieldset>
        <legend>{t("projectSettings")}</legend>
        <label class="check"><input type="checkbox" checked={softBreaks} onchange={(event) => onsoftbreaks(event.currentTarget.checked)} /> {t("softBreaks")}</label>
        <p class="hint muted">{t("softBreaksHint")}</p>
      </fieldset>
    </div>
  {/if}
</div>

<style>
  .settings {
    position: relative;
  }
  .panel {
    position: absolute;
    z-index: 20;
    top: 100%;
    right: 0;
    width: min(24rem, 80vw);
    margin-top: 0.3rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.2);
    text-align: left;
  }
  fieldset {
    border: 0;
    margin: 0 0 0.6rem;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  legend {
    font-weight: 600;
    margin-bottom: 0.3rem;
    padding: 0;
  }
  .field {
    display: grid;
    gap: 0.2rem;
  }
  .mono {
    font: 0.9em ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--ink);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 0.35em 0.5em;
  }
  .mono:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .mono[aria-invalid="true"] {
    border-color: #c0392b;
  }
  label:has(> input[type="radio"]),
  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
  }
  input[type="radio"],
  input[type="checkbox"] {
    accent-color: var(--accent);
    margin: 0;
  }
  .invalid {
    margin: 0;
    color: light-dark(#c0392b, #f87171);
    font-size: 0.85em;
  }
  .hint {
    margin: 0;
    font-size: 0.8em;
  }
  .muted {
    color: var(--muted, #777);
  }
</style>
