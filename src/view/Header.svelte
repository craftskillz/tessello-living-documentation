<script lang="ts">
  // The actions above the open Document: while reading, its path and display preferences, Edit and Delete; while editing,
  // Saving… during a save only, and Done. A read-only Document (a Folder manifest) has no Edit and no Delete.
  import { t } from "../lib/i18n.ts";

  let {
    editing,
    saving,
    readOnly,
    lines,
    whiteBackground,
    tocOpen,
    oncopypath,
    onlines,
    onwhite,
    ontoc,
    onedit,
    ondone,
    onrevert,
  }: {
    editing: boolean;
    saving: boolean;
    readOnly: boolean;
    lines: boolean;
    whiteBackground: boolean;
    tocOpen: boolean;
    oncopypath: () => void;
    onlines: () => void;
    onwhite: () => void;
    ontoc: () => void;
    onedit: () => void;
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
    {#if !readOnly}
      <button onclick={onedit}>{t("edit")}</button>
      <button disabled title={t("deleteLater")}>{t("delete")}</button>
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
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
