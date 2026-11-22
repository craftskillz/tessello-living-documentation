<script lang="ts">
  import type { ConnectedModule } from "@tessello/sdk";
  import { onMount } from "svelte";
  import { t } from "../lib/i18n.ts";
  import { createProjects, type ListedProject } from "../lib/projects.ts";

  let { host }: { host: ConnectedModule } = $props();
  let active = $state<ListedProject | null>(null);

  async function load() {
    const id = (await createProjects(host).active())?.id;
    active = (await createProjects(host).list()).find((project) => project.id === id) ?? null;
  }

  onMount(() => {
    void load();
    return host.onVisibilityChange((visible) => visible && void load());
  });
</script>

<button class="widget" onclick={() => host.openView()}>
  <strong>{t("title")}</strong>
  <span>{active ? active.name : t("connect")}</span>
</button>

<style>
  .widget {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border: 0;
  }
</style>
