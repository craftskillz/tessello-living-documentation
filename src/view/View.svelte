<script lang="ts">
  // The Active Project: its Tree, the open Document (read or edited), agent edits and conflicts (docs/spec/cross-cutting.md).
  import type { ConnectedModule } from "@tessello/sdk";
  import { onDestroy, onMount } from "svelte";
  import { parseDocument } from "../lib/document.ts";
  import { t } from "../lib/i18n.ts";
  import { Conflict, type DocumentText, type Project, type TreeEntry } from "../lib/project.ts";
  import { createProjects, type ListedProject } from "../lib/projects.ts";
  import { renderMarkdown } from "../lib/render.ts";
  import Editor from "./Editor.svelte";
  import Tree from "./Tree.svelte";

  let { host }: { host: ConnectedModule } = $props();

  const CHECK_MS = 5000;
  const AUTOSAVE_MS = 1000;
  const projects = $derived(createProjects(host));

  let loaded = $state(false);
  let active = $state<ListedProject | null>(null);
  let project: Project | null = null;
  let tree = $state.raw<TreeEntry[]>([]);
  let path = $state<string | null>(null);
  let current = $state.raw<DocumentText | null>(null);
  let error = $state<string | null>(null);

  let editing = $state(false);
  let draft = $state("");
  let saving = $state(false);
  /** What is on disk when an agent changed the Document during an edit; null: deleted. */
  let conflict = $state.raw<{ theirs: DocumentText | null } | null>(null);
  let comparing = $state(false);
  let autosave: ReturnType<typeof setTimeout> | undefined;
  let checking: ReturnType<typeof setInterval> | undefined;
  let stopParams: (() => void) | undefined;

  const model = $derived(current && path ? parseDocument(current.text, path) : null);
  const html = $derived(model ? renderMarkdown(model.body) : "");
  const hasHeading = $derived(model ? /^ {0,3}# /m.test(model.body) : false);

  const fail = (reason: unknown) => (error = t("failed", { reason: reason instanceof Error ? reason.message : String(reason) }));

  /**
   * The Document the View is opened on, from the Host's params (`project`, `doc`), as from the Widget. The View is an
   * about:srcdoc page in the Host: it has no address of its own, so navigation never goes through the URL.
   */
  function route(params: Record<string, string> | undefined): { project: string; path: string | null } | null {
    return params?.project ? { project: params.project, path: params.doc ?? null } : null;
  }

  async function start() {
    const list = await projects.list();
    const wanted = route(host.context.params);
    const activeId = (await projects.active())?.id;
    // A deep link opens its Project; else the Active Project.
    active = list.find((each) => each.id === wanted?.project) ?? list.find((each) => each.id === activeId) ?? null;
    if (active && active.id !== activeId) await projects.setActive(active);
    loaded = true;
    if (active?.state === "available") await openActive(wanted?.path ?? null);
  }

  async function openActive(wantedPath: string | null) {
    project = projects.open(active!);
    tree = await project.tree();
    await project.check();
    const target = wantedPath ?? (await projects.startDocument(active!));
    if (target) await show(target);
    clearInterval(checking);
    checking = setInterval(() => void checkOutside(), CHECK_MS);
  }

  async function show(target: string) {
    stopEditing();
    path = target;
    error = null;
    try {
      current = await project!.read(target);
      await projects.opened(active!, target);
    } catch (reason) {
      current = null;
      fail(reason);
    }
  }

  async function connectFolder() {
    try {
      const connected = await projects.connect();
      if (!connected) return;
      active = { ...connected, state: "available" };
      await openActive(null);
    } catch (reason) {
      fail(reason);
    }
  }

  async function reconnect() {
    try {
      if (await projects.reconnect(active!)) {
        active = { ...active!, state: "available" };
        await openActive(null);
      }
    } catch (reason) {
      fail(reason);
    }
  }

  /** Agent edits: the Tree updates silently; the open Document reloads, or is a conflict while edited. */
  async function checkOutside() {
    if (!project || document.hidden) return;
    try {
      const changes = await project.check();
      if (changes.tree) tree = await project.tree();
      if (!path || !changes.documents.includes(path)) return;
      const theirs = await project.read(path).catch(() => null);
      if (editing) {
        if (theirs?.text !== draft) conflict = { theirs };
        else current = theirs;
      } else if (theirs) {
        current = theirs;
      }
    } catch (reason) {
      fail(reason);
    }
  }

  function startEditing() {
    draft = current!.text;
    editing = true;
  }

  function stopEditing() {
    clearTimeout(autosave);
    editing = false;
    conflict = null;
    comparing = false;
  }

  function typed(text: string) {
    draft = text;
    clearTimeout(autosave);
    if (!conflict) autosave = setTimeout(() => void save(), AUTOSAVE_MS);
  }

  async function save(over?: string) {
    if (!current || !path || draft === current.text && over === undefined) return;
    saving = true;
    const text = draft;
    try {
      const version = await project!.save(path, text, over ?? current.version);
      current = { text, version };
      conflict = null;
      comparing = false;
    } catch (reason) {
      if (reason instanceof Conflict) conflict = { theirs: reason.theirs };
      else fail(reason);
    } finally {
      saving = false;
    }
  }

  function takeTheirs() {
    if (conflict?.theirs) {
      current = conflict.theirs;
      draft = conflict.theirs.text;
    }
    conflict = null;
    comparing = false;
  }

  function keepMine() {
    const theirs = conflict?.theirs;
    if (theirs) void save(theirs.version);
  }

  async function done() {
    clearTimeout(autosave);
    if (!conflict) await save();
    if (!conflict) stopEditing();
  }

  /** The View, already loaded, opened again on a Document, as from the Widget. */
  function onParams(params: Record<string, string>) {
    const wanted = route(params);
    if (wanted?.path && project && active?.id === wanted.project && wanted.path !== path) void show(wanted.path);
  }

  function onVisibility() {
    if (!document.hidden) void checkOutside();
  }

  onMount(() => {
    void start().catch(fail);
    stopParams = host.onNavigationParams(onParams);
    document.addEventListener("visibilitychange", onVisibility);
  });

  onDestroy(() => {
    clearInterval(checking);
    clearTimeout(autosave);
    stopParams?.();
    document.removeEventListener("visibilitychange", onVisibility);
  });
</script>

{#if !loaded}
  <p class="center muted">…</p>
{:else if !active}
  <main class="welcome">
    <h1>{t("title")}</h1>
    <p>{t("intro")}</p>
    <p class="muted">{t("connectHint")}</p>
    <button class="primary" onclick={connectFolder}>{t("connect")}</button>
  </main>
{:else if active.state === "unavailable"}
  <main class="welcome">
    <h1>{t("unavailable", { name: active.name })}</h1>
    <p>{t("unavailableText")}</p>
    <button class="primary" onclick={reconnect}>{t("reconnect")}</button>
  </main>
{:else}
  <div class="layout">
    <nav aria-label={t("documents")}>
      <p class="project">{active.name}</p>
      {#if tree.length === 0}
        <p class="muted">{t("emptyProject")}</p>
      {:else}
        <Tree entries={tree} current={path} open={(target) => void show(target)} />
      {/if}
    </nav>
    <main>
      {#if error}<p class="error" role="status">{error}</p>{/if}
      {#if current && model}
        <div class="toolbar">
          {#if editing}
            <span class="muted">{saving ? t("saving") : t("saved")}</span>
            <button class="primary" onclick={done}>{t("done")}</button>
          {:else}
            <button onclick={startEditing}>{t("edit")}</button>
          {/if}
        </div>
        {#if conflict}
          <div class="banner" role="alert">
            <p>{conflict.theirs ? t("changedOutside") : t("deletedOutside")}</p>
            {#if conflict.theirs}
              <button onclick={() => (comparing = !comparing)}>{t("compare")}</button>
              <button onclick={keepMine}>{t("keepMine")}</button>
              <button class="primary" onclick={takeTheirs}>{t("takeTheirs")}</button>
            {/if}
          </div>
          {#if comparing && conflict.theirs}
            <section class="compare" aria-label={t("compare")}>
              <div><h2>{t("mine")}</h2><pre>{draft}</pre></div>
              <div><h2>{t("theirs")}</h2><pre>{conflict.theirs.text}</pre></div>
            </section>
          {/if}
        {/if}
        {#if editing}
          <Editor text={draft} label={t("markdown")} onchange={typed} />
        {:else}
          <article>
            {#if !hasHeading}<h1>{model.title}</h1>{/if}
            {@html html}
          </article>
        {/if}
      {/if}
    </main>
  </div>
{/if}

<style>
  .center {
    text-align: center;
  }
  .muted {
    color: var(--ink-muted, #777);
  }
  .welcome {
    max-width: 36rem;
    margin: 15vh auto;
    padding: 0 1rem;
  }
  .layout {
    display: grid;
    grid-template-columns: 16rem 1fr;
    height: 100%;
  }
  nav {
    border-right: 1px solid var(--line);
    padding: 1rem;
    overflow: auto;
  }
  .project {
    font-weight: 600;
    margin-top: 0;
  }
  main {
    padding: 1rem 2rem;
    overflow: auto;
  }
  .toolbar {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    align-items: center;
  }
  .banner {
    border: 1px solid #d9a400;
    background: color-mix(in srgb, #ffd54a 25%, transparent);
    border-radius: 6px;
    padding: 0.5rem 1rem;
    margin: 0.5rem 0;
  }
  .compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .compare pre {
    white-space: pre-wrap;
    border: 1px solid var(--line);
    padding: 0.5rem;
  }
  .error {
    color: #c62828;
  }
</style>
