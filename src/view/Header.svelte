<script lang="ts">
  // The actions above the open Document: while reading, its path and display preferences, Favorite, Edit and Delete; while editing,
  // Saving… during a save only, and Done. A read-only Document (a Folder manifest) has no Edit and no Delete.
  import { t } from "../lib/i18n.ts";
  import type { LabelFilter } from "../lib/labels.ts";
  import type { TreeLabels } from "../lib/projects.ts";
  import Settings from "./Settings.svelte";

  let {
    editing,
    saving,
    readOnly,
    lines,
    whiteBackground,
    tocOpen,
    favorite,
    treeLabels,
    labelFilter,
    softBreaks,
    htmlAction,
    onhtml,
    onhtmlchange,
    onlabels,
    onfilter,
    onsoftbreaks,
    oncopypath,
    onlines,
    onwhite,
    ontoc,
    onfavorite,
    onedit,
    ondelete,
    ondone,
    onrevert,
  }: {
    editing: boolean;
    saving: boolean;
    readOnly: boolean;
    lines: boolean;
    whiteBackground: boolean;
    tocOpen: boolean;
    favorite: boolean;
    treeLabels: TreeLabels;
    labelFilter: LabelFilter;
    softBreaks: boolean;
    /** The Document's HTML action: View as HTML when it has a template of ours, else Generate as HTML. */
    htmlAction: "view" | "generate";
    /** View as HTML, or Generate as HTML (which opens the template dialog). */
    onhtml: () => void;
    onhtmlchange: () => void;
    onlabels: (treeLabels: TreeLabels) => void;
    onfilter: (filter: LabelFilter) => void;
    onsoftbreaks: (on: boolean) => void;
    oncopypath: () => void;
    onlines: () => void;
    onwhite: () => void;
    ontoc: () => void;
    onfavorite: () => void;
    onedit: () => void;
    ondelete: () => void;
    ondone: () => void;
    onrevert: () => void;
  } = $props();
</script>

<header class="toolbar">
  {#if editing}
    {#if saving}<span class="muted" role="status">{t("saving")}</span>{/if}
    <button onclick={onrevert}>{t("revert")}</button>
    <button class="primary" onclick={ondone}>{t("done")}</button>
  {:else}
    {#if readOnly}<span class="badge">{t("readOnly")}</span>{/if}
    <button onclick={oncopypath}>{t("copyPath")}</button>
    <button aria-pressed={lines} title={t("linesHint")} onclick={onlines}>{t("lines")}</button>
    <button aria-pressed={whiteBackground} title={t("whiteBackgroundHint")} onclick={onwhite}>{t("whiteBackground")}</button>
    <button aria-pressed={tocOpen} onclick={ontoc}>{t("toc")}</button>
    <Settings {treeLabels} filter={labelFilter} {softBreaks} {onlabels} {onfilter} {onsoftbreaks} />
    {#if !readOnly}
      {#if htmlAction === "view"}
        <button title={t("htmlViewHint")} onclick={onhtml}>{t("htmlView")}</button>
        <button aria-label={t("htmlChange")} title={t("htmlChange")} onclick={onhtmlchange}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="1" /><circle cx="17.5" cy="10.5" r="1" /><circle cx="8.5" cy="7.5" r="1" /><circle cx="6.5" cy="12.5" r="1" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.8-1.7 1.7-1.7H16c3.1 0 5.6-2.5 5.6-5.6C21.6 6 17.4 2 12 2z" /></svg>
        </button>
      {:else}
        <button title={t("htmlGenerateHint")} onclick={onhtml}>{t("htmlGenerate")}</button>
      {/if}
      <button aria-pressed={favorite} title={favorite ? t("removeFavorite") : t("addFavorite")} onclick={onfavorite}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill={favorite ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg>
        {t("favorite")}
      </button>
      <button onclick={onedit}>{t("edit")}</button>
      <button onclick={ondelete}>{t("delete")}</button>
    {/if}
  {/if}
</header>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
    align-items: center;
    background: var(--bg);
  }
  .muted {
    color: var(--muted, #777);
  }
  .badge {
    margin-right: auto;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0.1em 0.7em;
    font-size: 0.85em;
    color: var(--muted, #777);
  }
  button[aria-pressed="true"] {
    background: color-mix(in srgb, var(--accent) 18%, var(--panel));
    border-color: var(--accent);
  }
</style>
