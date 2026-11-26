<script lang="ts">
  // The Templates menu of the sidebar: the library's folders, one expanded at a time, and a search by name and content.
  // It reads the library each time it opens, and only shows and asks: View opens the library screen (Open library)
  // or the New document dialog with the clicked template chosen.
  import { t } from "../lib/i18n.ts";
  import type { TemplateEntry, TemplateFolder, TemplateLibrary } from "../lib/templates.ts";

  let {
    library,
    onopen,
    onuse,
    onfail,
  }: {
    library: TemplateLibrary;
    /** The library screen is asked for, with `path` selected (none: its first template). */
    onopen: (path: string | null) => void;
    /** A template was clicked: the New document dialog is asked for, with `path` chosen. */
    onuse: (path: string) => void;
    onfail: (message: string, reason: unknown) => void;
  } = $props();

  let shown = $state(false);
  let root = $state<HTMLElement>();
  let button = $state<HTMLButtonElement>();
  let folders = $state.raw<TemplateFolder[]>([]);
  let expanded = $state<string | null>(null);
  let query = $state("");
  let found = $state.raw<TemplateEntry[] | null>(null);
  let searches = 0;

  async function load() {
    try {
      folders = await library.list();
      if (!folders.some((folder) => folder.name === expanded)) expanded = folders[0]?.name ?? null;
    } catch (reason) {
      onfail(t("templatesReadFailed"), reason);
    }
  }

  async function search() {
    const mine = ++searches;
    if (query.trim() === "") {
      found = null;
      return;
    }
    try {
      const results = await library.search(query);
      if (mine === searches) found = results;
    } catch (reason) {
      if (mine === searches) onfail(t("templatesReadFailed"), reason);
    }
  }

  function toggle() {
    if (shown) return close();
    shown = true;
    query = "";
    found = null;
    void load();
  }

  function close() {
    shown = false;
    searches++;
  }

  function choose(path: string | null) {
    close();
    onopen(path);
  }

  function use(path: string) {
    close();
    onuse(path);
  }

  function onwindowkey(event: KeyboardEvent) {
    if (shown && event.key === "Escape") {
      close();
      button?.focus();
    }
  }

  function onwindowpointer(event: PointerEvent) {
    if (shown && root && !root.contains(event.target as Node)) close();
  }
</script>

<svelte:window onkeydown={onwindowkey} onpointerdown={onwindowpointer} />

<div class="templates" bind:this={root}>
  <button type="button" class="icon" bind:this={button} aria-label={t("templates")} title={t("templates")} aria-haspopup="dialog" aria-expanded={shown} onclick={toggle}>
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
  </button>
  {#if shown}
    <div class="panel ld-form" role="dialog" aria-label={t("templates")}>
      <input type="search" aria-label={t("templatesSearchLabel")} placeholder={t("templatesSearch")} bind:value={query} oninput={() => void search()} />
      {#snippet row(entry: TemplateEntry, withFolder: boolean)}
        <li>
          <button type="button" class="template" onclick={() => use(entry.path)}>
            <span class="name">{entry.name}</span>
            {#if withFolder}<span class="muted folder">{entry.folder}</span>{/if}
          </button>
        </li>
      {/snippet}
      {#if found}
        {#if found.length === 0}
          <p class="muted empty">{t("templatesNoMatch")}</p>
        {:else}
          <ul>{#each found as entry (entry.path)}{@render row(entry, true)}{/each}</ul>
        {/if}
      {:else if folders.length === 0}
        <p class="muted empty">{t("templatesNoFolders")}</p>
      {:else}
        <ul>
          {#each folders as folder (folder.name)}
            <li>
              <button type="button" class="folder-row" aria-expanded={expanded === folder.name} onclick={() => (expanded = expanded === folder.name ? null : folder.name)}>
                <span aria-hidden="true">{expanded === folder.name ? "▾" : "▸"}</span>
                <span class="name">{folder.name}</span>
              </button>
              {#if expanded === folder.name}
                {#if folder.templates.length === 0}
                  <p class="muted empty">{t("templatesFolderEmpty")}</p>
                {:else}
                  <ul class="inner">{#each folder.templates as entry (entry.path)}{@render row(entry, false)}{/each}</ul>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      <div class="foot">
        <button type="button" class="primary" onclick={() => choose(null)}>{t("templatesOpenLibrary")}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .templates {
    position: relative;
  }
  button.icon {
    display: inline-grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border-color: transparent;
    background: transparent;
    color: var(--muted, #777);
  }
  button.icon:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
  }
  button.icon:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .panel {
    position: absolute;
    z-index: 20;
    top: 100%;
    left: 0;
    width: min(22rem, 80vw);
    max-height: 60vh;
    overflow: auto;
    display: grid;
    gap: 0.4rem;
    padding: 0.6rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.2);
  }
  .panel input[type="search"] {
    width: 100%;
    box-sizing: border-box;
  }
  .empty {
    margin: 0.25rem 0.5rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  ul.inner {
    padding-left: 1.2rem;
  }
  .folder-row,
  .template {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.1rem 0.4rem;
    width: 100%;
    text-align: left;
    border-color: transparent;
    background: transparent;
  }
  .template {
    flex-direction: column;
    gap: 0;
  }
  .folder-row {
    font-weight: 600;
  }
  .name,
  .folder {
    overflow-wrap: anywhere;
  }
  .folder {
    font-size: 0.8em;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    padding-top: 0.2rem;
    border-top: 1px solid var(--line);
  }
</style>
