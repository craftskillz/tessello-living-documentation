<script lang="ts">
  // The Active Project: its Tree, the open Document (read or edited), agent edits and conflicts (docs/spec/cross-cutting.md).
  import type { ConnectedModule } from "@tessello/sdk";
  import { onDestroy, onMount, tick } from "svelte";
  import { parseDocument } from "../lib/document.ts";
  import { decorateCollapsible } from "./collapsible.ts";
  import { loadImages } from "../lib/images.ts";
  import { t } from "../lib/i18n.ts";
  import { Conflict, FOLDER_MANIFEST, NotFound, type DocumentText, type Project, type TreeEntry } from "../lib/project.ts";
  import { createProjects, TOC_WIDTH, type DisplayPreferences, type ListedProject } from "../lib/projects.ts";
  import { renderDocument } from "../lib/render.ts";
  import ArticleTools from "./ArticleTools.svelte";
  import { applyLineLabels } from "./lines.ts";
  import Editor from "./Editor.svelte";
  import Header from "./Header.svelte";
  import Toc, { type Heading } from "./Toc.svelte";
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
  /** The sticky header's height: the table of contents and scrolled-to headings sit below it. */
  let headerHeight = $state(0);
  /** The failure toast is red; a confirmation (`tone` "success") is not, and goes away by itself. */
  let tone = $state<"failure" | "success">("failure");
  let confirmation: ReturnType<typeof setTimeout> | undefined;
  /** The User's display preferences (Lines, White background, table of contents), kept in the Module's storage. */
  let display = $state<DisplayPreferences>({ lines: false, whiteBackground: false, toc: { open: false, width: TOC_WIDTH.default } });
  let headings = $state.raw<Heading[]>([]);

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
  /** A Folder manifest is read, never edited or deleted (docs/spec/documents-reading-and-editing.md, rule 14). */
  const readOnly = $derived(path !== null && path.split("/").pop() === FOLDER_MANIFEST);
  const html = $derived(model ? renderDocument(model, path, {
        footnotes: t("footnotes"),
        footnoteBack: t("footnoteBack"),
        compareSource: t("compareSource"),
        compareRender: t("compareRender"),
      }, { frontmatter: readOnly }) : "");
  const hasHeading = $derived(model ? /^ {0,3}# /m.test(model.body) : false);

  /** Shows `message`, the raw reason, if any, only as a detail (docs/spec/cross-cutting.md, Failures). */
  function report(message: string, reason?: unknown) {
    clearTimeout(confirmation);
    tone = "failure";
    error = message;
    detail = reason === undefined ? null : t("detail", { reason: reason instanceof Error ? reason.message : String(reason) });
  }

  function dismiss() {
    clearTimeout(confirmation);
    error = null;
    detail = null;
  }

  /** A short confirmation in the toast, gone after a moment. */
  function notify(message: string) {
    clearTimeout(confirmation);
    tone = "success";
    error = message;
    detail = null;
    confirmation = setTimeout(dismiss, 2000);
  }

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(path!);
      notify(t("pathCopied"));
    } catch (reason) {
      report(t("pathCopyFailed"), reason);
    }
  }

  async function setDisplay(changes: Parameters<typeof projects.setPreferences>[0]) {
    try {
      display = await projects.setPreferences(changes);
    } catch (reason) {
      fail(reason);
    }
  }

  /** Scrolls to a heading of the table of contents, opening the folded sections around it first. */
  function goToHeading(id: string) {
    const target = article?.querySelector(`#${CSS.escape(id)}`);
    for (let each = target?.closest("details"); each; each = each.parentElement?.closest("details")) each.open = true;
    target?.scrollIntoView();
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
    display = await projects.preferences();
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

  // Long code blocks fold after each render; the next render (or leaving) undoes this one.
  $effect(() => {
    html;
    if (!article) return;
    return decorateCollapsible(article, { more: t("showMore"), less: t("showLess") });
  });

  // Lines: each block of the article names the lines it comes from, after each render and each change of the setting.
  $effect(() => {
    html;
    if (!article || !display.lines || !current) return;
    return applyLineLabels(article, current.text);
  });

  // The table of contents lists the headings of each render.
  $effect(() => {
    html;
    if (!article) return;
    headings = [...article.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")]
      .map((each) => ({ id: each.id, text: (each.textContent ?? "").trim(), level: Number(each.tagName.slice(1)) }))
      .filter((each) => each.id && each.text);
  });

  // White background lives on the root, where the dark theme of the Document is switched off.
  $effect(() => {
    document.documentElement.classList.toggle("ld-white-background", display.whiteBackground);
    return () => document.documentElement.classList.remove("ld-white-background");
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
    clearTimeout(confirmation);
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
    <main style:--header-height="{headerHeight}px">
      {#if current && model}
        <!-- The header stays on top while the Document scrolls, while reading and while editing. -->
        <div class="sticky" bind:offsetHeight={headerHeight}>
        <Header
          {editing}
          {saving}
          {readOnly}
          lines={display.lines}
          whiteBackground={display.whiteBackground}
          tocOpen={display.toc.open}
          oncopypath={() => void copyPath()}
          onlines={() => void setDisplay({ lines: !display.lines })}
          onwhite={() => void setDisplay({ whiteBackground: !display.whiteBackground })}
          ontoc={() => void setDisplay({ toc: { open: !display.toc.open } })}
          onedit={startEditing}
          ondone={done}
        />
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
          <div class="reading">
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
            <article class="document" class:ld-show-source-lines={display.lines} bind:this={article} onclick={activate} onkeydown={activateKey}>
              {#if !hasHeading}<h1>{model.title}</h1>{/if}
              {@html html}
            </article>
            {#if display.toc.open && headings.length > 0}
              <Toc
                {headings}
                width={display.toc.width}
                onselect={goToHeading}
                onresized={(width) => void setDisplay({ toc: { width } })}
              />
            {/if}
          </div>
          <ArticleTools {article} {notify} fail={report} />
        {/if}
      {/if}
    </main>
  </div>
{/if}

{#if error}
  <div class="toast" class:success={tone === "success"} role="status">
    <p>{error}{#if detail}<br /><small>{detail}</small>{/if}</p>
    <button class="close" aria-label={t("close")} onclick={dismiss}>×</button>
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
    padding: 0 2rem 1rem;
    overflow: auto;
  }
  .sticky {
    position: sticky;
    top: 0;
    z-index: 5;
    padding: 1rem 0 0.5rem;
    background: var(--bg);
  }
  main :global(.document [id]) {
    scroll-margin-top: calc(var(--header-height, 0px) + 0.5rem);
  }
  .reading {
    display: flex;
    align-items: flex-start;
    gap: 1.5rem;
  }
  .reading article {
    flex: 1;
    min-width: 0;
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
  /* Failures float at the bottom of the screen, wherever the reader has scrolled (Sonner-like). */
  .toast {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 10;
    max-width: min(28rem, calc(100vw - 2rem));
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem 0.75rem 0.75rem 1rem;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-left: 4px solid #c62828;
    border-radius: 8px;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
    animation: toast-in 160ms ease-out;
  }
  .toast.success {
    border-left-color: #2e7d32;
  }
  .toast p {
    margin: 0;
  }
  .toast .close {
    border: none;
    background: none;
    padding: 0 0.25rem;
    font-size: 1.2em;
    line-height: 1;
  }
  @keyframes toast-in {
    from {
      transform: translateY(0.5rem);
      opacity: 0;
    }
  }
</style>
