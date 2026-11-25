<script lang="ts">
  // The Project switcher of the sidebar: the Active Project's name, opening a menu of every Project to switch to, reconnect
  // or remove, to connect a folder and to open the Project settings. It only shows and asks: View acts. `onconnect` and
  // `onreconnect` open the Host's folder prompt, so they are called straight from the click, with nothing awaited before.
  import { t } from "../lib/i18n.ts";
  import { type ListedProject, projectLabel } from "../lib/projects.ts";

  let {
    active,
    projects,
    settings,
    onshow,
    onswitch,
    onreconnect,
    onremove,
    onconnect,
    onsettings,
  }: {
    active: ListedProject;
    projects: ListedProject[];
    /** The Project settings can be opened (the Active Project is available). */
    settings: boolean;
    /** The menu is about to show: the list is read again. */
    onshow: () => void;
    onswitch: (project: ListedProject) => void;
    onreconnect: (project: ListedProject) => void;
    onremove: (project: ListedProject) => void;
    onconnect: () => void;
    onsettings: () => void;
  } = $props();

  let shown = $state(false);
  let root = $state<HTMLElement>();
  let button = $state<HTMLButtonElement>();

  function toggle() {
    shown = !shown;
    if (shown) onshow();
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

  /** Closes the menu, then runs `action` (synchronously: a folder prompt must leave from the click). */
  function choose(action: () => void) {
    shown = false;
    action();
  }
</script>

<svelte:window onkeydown={onwindowkey} onpointerdown={onwindowpointer} />

<div class="switcher" bind:this={root}>
  <button type="button" class="current" bind:this={button} title={t("projects")} aria-haspopup="dialog" aria-expanded={shown} onclick={toggle}>
    <span class="name">{projectLabel(active)}</span><span aria-hidden="true">▾</span>
  </button>
  {#if shown}
    <div class="panel" role="dialog" aria-label={t("projects")}>
      <ul>
        {#each projects as project (project.id)}
          <li>
            <button
              type="button"
              class="title"
              aria-current={project.id === active.id ? "true" : undefined}
              disabled={project.state === "unavailable"}
              title={project.location ?? (project.displayName ? project.name : undefined)}
              onclick={() => choose(() => onswitch(project))}>{projectLabel(project)}</button
            >
            {#if project.state === "unavailable"}
              <span class="badge">{t("projectUnavailable")}</span>
              <button type="button" aria-label={t("reconnectProject", { name: projectLabel(project) })} onclick={() => choose(() => onreconnect(project))}>{t("reconnect")}</button>
            {/if}
            <button type="button" class="remove" aria-label={t("removeProject", { name: projectLabel(project) })} title={t("removeProject", { name: projectLabel(project) })} onclick={() => choose(() => onremove(project))}>×</button>
          </li>
        {/each}
      </ul>
      <div class="foot">
        <button type="button" onclick={() => choose(onconnect)}>{t("connect")}</button>
        {#if settings}<button type="button" onclick={() => choose(onsettings)}>{t("projectSettingsMenu")}</button>{/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .switcher {
    position: relative;
    min-width: 0;
  }
  button.current {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    max-width: 100%;
    padding: 0.2rem 0.4rem;
    text-align: left;
    font-weight: 600;
    border-color: transparent;
    background: transparent;
  }
  button.current:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
  }
  /* The whole name shows, on several lines when it is long. */
  .name {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .panel {
    position: absolute;
    z-index: 20;
    top: 100%;
    left: 0;
    width: min(22rem, 80vw);
    max-height: 60vh;
    overflow: auto;
    padding: 0.4rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.2);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem 0.25rem;
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    border-color: transparent;
    background: transparent;
  }
  .title[aria-current="true"] {
    font-weight: 700;
  }
  .title:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .badge {
    font-size: 0.8em;
    color: var(--muted, #777);
  }
  .remove {
    border-color: transparent;
    background: transparent;
    padding: 0 0.4rem;
  }
  .foot {
    display: grid;
    gap: 0.25rem;
    margin-top: 0.3rem;
    padding-top: 0.3rem;
    border-top: 1px solid var(--line);
  }
  .foot button {
    text-align: left;
    border-color: transparent;
    background: transparent;
  }
</style>
