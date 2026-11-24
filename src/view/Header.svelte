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
