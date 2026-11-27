<script lang="ts">
  // The actions above the open Document: while reading, its path and display preferences, Favorite, Edit and Delete; while editing,
  // Saving… during a save only, and Done. A read-only Document (a Folder manifest) has no Edit and no Delete.
  import { t } from "../lib/i18n.ts";
  import type { LabelFilter } from "../lib/labels.ts";
  import type { MarkerState } from "../lib/annotations.ts";
  import type { TreeLabels } from "../lib/projects.ts";
  import type { Snippet } from "svelte";
  import Settings from "./Settings.svelte";

  let {
    editing,
    saving,
    readOnly,
    board,
    lines,
    whiteBackground,
    tocOpen,
    marker,
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
    onmarker,
    oncopypath,
    onlines,
    onwhite,
    ontoc,
    onfavorite,
    onedit,
    oneditcolumns,
    ondelete,
    ondone,
    onrevert,
    onsnippets,
    onformat,
    onversions,
    listen,
  }: {
    editing: boolean;
    saving: boolean;
    readOnly: boolean;
    /** The Document is a Kanban board: only Favorite, Edit columns, Edit, Copy path and Delete. */
    board: boolean;
    lines: boolean;
    whiteBackground: boolean;
    tocOpen: boolean;
    /** The annotation Marker's state: Normal shows the annotations, Active also creates them, Hidden shows none. */
    marker: MarkerState;
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
    onmarker: () => void;
    oncopypath: () => void;
    onlines: () => void;
    onwhite: () => void;
    ontoc: () => void;
    onfavorite: () => void;
    onedit: () => void;
    /** Opens Edit columns, on a board. */
    oneditcolumns: () => void;
    ondelete: () => void;
    ondone: () => void;
    onrevert: () => void;
    /** Opens the snippets dialog on the editor's selection. */
    onsnippets: () => void;
    /** Formats the editor's text (aligns tables, tidies the Markdown). */
    onformat: () => void;
    /** Opens the Versions dialog; undefined when the Project has no Repository grant (no button). */
    onversions?: () => void;
    /** Listen (read aloud), shown on an ordinary Document while reading. */
    listen?: Snippet;
  } = $props();
</script>

<header class="toolbar">
  {#if editing}
    {#if saving}<span class="muted" role="status">{t("saving")}</span>{/if}
    <button title={t("snippetsHint")} onclick={onsnippets}>{t("snippets")}</button>
    <button title={t("formatHint")} onclick={onformat}>{t("format")}</button>
    <button onclick={onrevert}>{t("revert")}</button>
    <button class="primary" onclick={ondone}>{t("done")}</button>
  {:else}
    {#if readOnly}<span class="badge">{t("readOnly")}</span>{/if}
    <button onclick={oncopypath}>{t("copyPath")}</button>
    {#if onversions && !readOnly}<button title={t("versionsHint")} onclick={onversions}>{t("versions")}</button>{/if}
    {#if !board}
    <button aria-pressed={lines} title={t("linesHint")} onclick={onlines}>{t("lines")}</button>
    <button aria-pressed={whiteBackground} title={t("whiteBackgroundHint")} onclick={onwhite}>{t("whiteBackground")}</button>
    <button aria-pressed={tocOpen} onclick={ontoc}>{t("toc")}</button>
    <Settings {treeLabels} filter={labelFilter} {softBreaks} {onlabels} {onfilter} {onsoftbreaks} />
    {/if}
    {#if !readOnly}
      {#if !board}
      {@render listen?.()}
      <button class="marker" data-state={marker} title={t("markerHint")} aria-pressed={marker === "active" ? true : marker === "hidden" ? "mixed" : false} onclick={onmarker}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3" /><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />{#if marker === "hidden"}<path d="m3 3 18 18" />{/if}</svg>
        {t("marker")}
      </button>
      {#if htmlAction === "view"}
        <button title={t("htmlViewHint")} onclick={onhtml}>{t("htmlView")}</button>
        <button aria-label={t("htmlChange")} title={t("htmlChange")} onclick={onhtmlchange}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="1" /><circle cx="17.5" cy="10.5" r="1" /><circle cx="8.5" cy="7.5" r="1" /><circle cx="6.5" cy="12.5" r="1" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.8-1.7 1.7-1.7H16c3.1 0 5.6-2.5 5.6-5.6C21.6 6 17.4 2 12 2z" /></svg>
        </button>
      {:else}
        <button title={t("htmlGenerateHint")} onclick={onhtml}>{t("htmlGenerate")}</button>
      {/if}
      {/if}
      <button aria-pressed={favorite} title={favorite ? t("removeFavorite") : t("addFavorite")} onclick={onfavorite}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill={favorite ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg>
        {t("favorite")}
      </button>
      {#if board}<button onclick={oneditcolumns}><span aria-hidden="true">⚙</span> {t("editColumns")}</button>{/if}
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
  .marker[data-state="active"] {
    background: rgba(250, 204, 21, 0.5);
    border-color: #d9a400;
  }
  button[aria-pressed="true"] {
    background: color-mix(in srgb, var(--accent) 18%, var(--panel));
    border-color: var(--accent);
  }
</style>
