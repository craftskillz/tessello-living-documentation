<script lang="ts">
  // The Widget (size M): the Active Project and its favorites in order. A click on a favorite opens the View on that
  // Document (View params); a click on the title opens the View as it was.
  import type { ConnectedModule } from "@tessello/sdk";
  import { onMount } from "svelte";
  import { t } from "../lib/i18n.ts";
  import { createProjects, type Favorite, type ListedProject } from "../lib/projects.ts";

  let { host }: { host: ConnectedModule } = $props();
  const projects = $derived(createProjects(host));
  let active = $state<ListedProject | null>(null);
  let favorites = $state.raw<Favorite[]>([]);
  let failed = $state(false);

  async function load() {
    try {
      const id = (await projects.active())?.id;
      active = (await projects.list()).find((project) => project.id === id) ?? null;
      favorites = active?.state === "available" ? await projects.favorites(active) : [];
      failed = false;
    } catch {
      failed = true;
    }
  }

  async function reconnect() {
    if (!active) return;
    try {
      await projects.reconnect(active);
    } catch {
      // The User cancelled or the browser refused: the Project stays unavailable.
    }
    await load();
  }

  onMount(() => {
    void load();
    return host.onVisibilityChange((visible) => visible && void load());
  });
</script>

<section class="widget">
  {#if !active}
    <button class="head" onclick={() => host.openView()}>
      <strong>{t("title")}</strong>
      <span>{failed ? t("failed") : t("connect")}</span>
    </button>
  {:else if active.state === "unavailable"}
    <div class="head">
      <strong>{t("title")}</strong>
      <span>{t("unavailable", { name: active.name })}</span>
    </div>
    <button class="primary" onclick={() => void reconnect()}>{t("reconnect")}</button>
  {:else}
    <button class="head" onclick={() => host.openView()}>
      <strong>{t("title")}</strong>
      <span>{active.name}</span>
    </button>
    {#if failed}
      <p class="muted" role="alert">{t("failed")}</p>
    {/if}
    {#if favorites.length === 0}
      <p class="muted">{t("widgetNoFavorites")}</p>
    {:else}
      <ul>
        {#each favorites as favorite (favorite.path)}
          <li>
            <button
              class:missing={favorite.missing}
              disabled={favorite.missing}
              title={favorite.path}
              onclick={() => host.openView({ project: active!.id, doc: favorite.path })}
            >
              <span class="name">{favorite.title}</span>
              {#if favorite.missing}<small>{t("favoriteMissing")}</small>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .widget {
    box-sizing: border-box;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.5rem;
  }
  .head {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    border: 0;
    background: transparent;
    padding: 0.1rem 0.25rem;
  }
  .head span {
    color: var(--muted, #777);
    font-size: 0.85em;
  }
  .muted {
    margin: 0 0.25rem;
    color: var(--muted, #777);
    font-size: 0.85em;
  }
  ul {
    flex: 1;
    min-height: 0;
    overflow: auto;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li button {
    display: flex;
    width: 100%;
    align-items: baseline;
    gap: 0.4rem;
    border: 0;
    background: transparent;
    text-align: left;
    padding: 0.2rem 0.25rem;
  }
  li button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .missing {
    opacity: 0.55;
  }
</style>
