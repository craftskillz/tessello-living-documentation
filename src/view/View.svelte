<script lang="ts">
  // The Active Project: its Tree, the open Document (read or edited), agent edits and conflicts (docs/spec/cross-cutting.md).
  import type { ConnectedModule } from "@tessello/sdk";
  import { onDestroy, onMount, tick } from "svelte";
  import { parseDocument } from "../lib/document.ts";
  import { loadImages } from "../lib/images.ts";
  import { t } from "../lib/i18n.ts";
  import { Conflict, NotFound, type DocumentText, type Project, type TreeEntry } from "../lib/project.ts";
  import { createProjects, type ListedProject } from "../lib/projects.ts";
  import { renderDocument } from "../lib/render.ts";
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
  /** The raw text of the failure behind `error`, shown only as a detail. */
  let detail = $state<string | null>(null);
  /** The Documents left through links, oldest first; the Tree clears it. */
  let trail = $state.raw<{ path: string; title: string }[]>([]);
  let article = $state<HTMLElement>();

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
  const html = $derived(model ? renderDocument(model, path) : "");
  const hasHeading = $derived(model ? /^ {0,3}# /m.test(model.body) : false);

  /** Shows `message`, the raw reason, if any, only as a detail (docs/spec/cross-cutting.md, Failures). */
  function report(message: string, reason?: unknown) {
    error = message;
    detail = reason === undefined ? null : t("detail", { reason: reason instanceof Error ? reason.message : String(reason) });
  }

  const fail = (reason: unknown) => report(t("failed"), reason);

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

  async function show(target: string, loaded?: DocumentText) {
    stopEditing();
    path = target;
    error = null;
    detail = null;
    try {
      current = loaded ?? (await project!.read(target));
      await projects.opened(active!, target);
    } catch (reason) {
      current = null;
      if (reason instanceof NotFound) report(t("notFound"));
      else fail(reason);
    }
  }

  /** Opens a Document from the Tree (or the Host): a new reading, without a back trail. */
  function openFresh(target: string) {
    trail = [];
    void show(target);
  }

  /** Follows a link to a Document: it is read first, so a missing one leaves the open Document in place. */
  async function follow(target: string, anchor: string | null) {
    // A link to the open Document only moves within it.
    if (target === path) return scrollTo(anchor);
    let loaded: DocumentText;
    try {
      loaded = await project!.read(target);
    } catch (reason) {
      if (reason instanceof NotFound) report(t("linkMissing", { path: target }));
      else report(t("linkFailed", { path: target }), reason);
      return;
    }
    if (current && path && model) trail = [...trail, { path, title: model.title }];
    await show(target, loaded);
    await tick();
    scrollTo(anchor);
  }

  async function back(index: number) {
    const entry = trail[index]!;
    trail = trail.slice(0, index);
    await show(entry.path);
  }

  /** Scrolls to the element of the article with this id, or to the top. */
  function scrollTo(anchor: string | null) {
    const target = anchor ? article?.querySelector(`#${CSS.escape(anchor)}`) : null;
    if (target) target.scrollIntoView();
    else article?.closest("main")?.scrollTo(0, 0);
  }

  /** Links of the article carry data attributes, never an address: the View is an about:srcdoc page. */
  function activate(event: Event) {
    const link = (event.target as Element).closest<HTMLElement>("[data-doc], [data-file], [data-anchor]");
    if (!link) return;
    const { doc, file, anchor } = link.dataset;
    if (doc) void follow(doc, anchor ?? null);
    else if (file) report(t("fileUnavailable", { path: file }));
    else scrollTo(anchor!);
  }

  function activateKey(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.target as Element).matches("[role=link]")) activate(event);
  }

  // Images are read after each render; a newer render (or leaving) releases the object URLs of this one.
  $effect(() => {
    html;
    if (!article || !project) return;
    return loadImages(article, (imagePath) => project!.readImage(imagePath), (imagePath) => t("imageNotFound", { path: imagePath }));
  });

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
    if (wanted?.path && project && active?.id === wanted.project && wanted.path !== path) openFresh(wanted.path);
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
        <Tree entries={tree} current={path} open={openFresh} />
      {/if}
    </nav>
    <main>
      {#if error}<p class="error" role="status">{error}{#if detail}<br /><small>{detail}</small>{/if}</p>{/if}
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
          {#if trail.length > 0}
            <div class="trail" role="group" aria-label={t("trail")}>
              {#each trail as entry, index (index)}
                <button onclick={() => void back(index)}>← {entry.title}</button>
              {/each}
            </div>
          {/if}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
          <article class="document" bind:this={article} onclick={activate} onkeydown={activateKey}>
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
  .trail {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.5rem 0;
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
