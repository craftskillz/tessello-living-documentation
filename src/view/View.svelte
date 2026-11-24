<script lang="ts">
  // The Active Project: its Tree, the open Document (read or edited), agent edits and conflicts (docs/spec/cross-cutting.md).
  import type { ConnectedModule } from "@tessello/sdk";
  import { onDestroy, onMount, tick } from "svelte";
  import { createAutosave, type Autosave } from "../lib/autosave.ts";
  import { sideBySide } from "../lib/diff.ts";
  import { applyEdits, type TextRange } from "../lib/edits.ts";
  import { replaceSection, sectionAt } from "../lib/sections.ts";
  import { parseDocument } from "../lib/document.ts";
  import { decorateCollapsible } from "./collapsible.ts";
  import { drawDiagrams } from "./mermaid.ts";
  import { loadImages } from "../lib/images.ts";
  import { t, type MessageKey } from "../lib/i18n.ts";
  import { Conflict, documentFile, FOLDER_MANIFEST, NotFound, Refused, refusalOf, type DocumentText, type Project, type RefusalReason, type TreeEntry } from "../lib/project.ts";
  import { entryMapper } from "../lib/links.ts";
  import { createProjects, TOC_WIDTH, type DisplayPreferences, type ListedProject } from "../lib/projects.ts";
  import { renderDocument } from "../lib/render.ts";
  import ArticleTools from "./ArticleTools.svelte";
  import { applyLineLabels } from "./lines.ts";
  import Editor from "./Editor.svelte";
  import Header from "./Header.svelte";
  import Toc, { type Heading } from "./Toc.svelte";
  import Tree, { type Dragging, type DropPosition } from "./Tree.svelte";

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

  type Session = { kind: "document" } | { kind: "section"; range: TextRange };
  let session = $state.raw<Session | null>(null);
  const editing = $derived(session?.kind === "document");
  /** The file's text when Edit was clicked, for Revert. */
  let original = "";
  let draft = $state("");
  let saving = $state(false);
  let autosave: Autosave | null = null;
  /** What is on disk when an agent changed the Document during an edit; null: deleted. */
  let conflict = $state.raw<{ theirs: DocumentText | null } | null>(null);
  let comparing = $state(false);
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
  /** The live preview of the section being edited, rendered as a Document of its own; its links do nothing. */
  const previewHtml = $derived(
    session?.kind === "section" && path
      ? renderDocument(parseDocument(draft, path), path, {
          footnotes: t("footnotes"),
          footnoteBack: t("footnoteBack"),
          compareSource: t("compareSource"),
          compareRender: t("compareRender"),
        })
      : "",
  );
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
    // The text typed is saved before another Document opens; on a conflict or a failure, the open one stays.
    if (!(await leave())) return;
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
  async function openFresh(target: string) {
    if (!(await leave())) return;
    trail = [];
    await show(target);
  }

  /** Follows a link to a Document: it is read first, so a missing one leaves the open Document in place. */
  async function follow(target: string, anchor: string | null) {
    // A link to the open Document only moves within it.
    if (target === path) return scrollTo(anchor);
    if (!(await leave())) return;
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

  // The preview of the section editor shows its Images like the reading; each is read once while the editor is open
  // (not again at every keystroke).
  let preview = $state<HTMLElement>();
  let previewImages = new Map<string, Promise<Uint8Array>>();
  $effect(() => {
    previewHtml;
    if (!preview || !project) return;
    const read = (imagePath: string) => {
      if (!previewImages.has(imagePath)) {
        // A failed read is tried again at the next render: the Image may have been added meanwhile.
        const reading = project!.readImage(imagePath);
        reading.catch(() => previewImages.delete(imagePath));
        previewImages.set(imagePath, reading);
      }
      return previewImages.get(imagePath)!;
    };
    return loadImages(preview, read, (imagePath) => t("imageNotFound", { path: imagePath }));
  });

  // Long code blocks fold after each render; the next render (or leaving) undoes this one.
  $effect(() => {
    html;
    if (!article) return;
    return decorateCollapsible(article, { more: t("showMore"), less: t("showLess") });
  });

  // Diagrams are drawn after each render; they follow the theme of the Document (dark, unless the white background is on).
  let hostDark = $state(document.documentElement.dataset.mode === "dark");
  const dark = $derived(hostDark && !display.whiteBackground);
  $effect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => (hostDark = root.dataset.mode === "dark"));
    observer.observe(root, { attributes: true, attributeFilter: ["data-mode"] });
    return () => observer.disconnect();
  });
  $effect(() => {
    html;
    if (!article) return;
    return drawDiagrams(article, { dark, failed: (reason) => t("diagramFailed", { reason }) });
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
    const checked = path;
    try {
      const changes = await project.check();
      if (changes.tree) tree = await project.tree();
      // A save of ours still running shows as a change: it is not an agent's edit (theirs would fail that save instead).
      if (!checked || !changes.documents.includes(checked) || autosave?.saving) return;
      const theirs = await project.read(checked).catch(() => null);
      if (path !== checked) return;
      if (session) {
        if (theirs?.text !== composed(draft)) {
          conflict = { theirs };
          autosave?.pause();
        } else current = theirs;
      } else if (theirs) {
        current = theirs;
      }
    } catch (reason) {
      fail(reason);
    }
  }

  /** Saves what was typed before the open Document is left; false, with the reason shown, when it cannot be. */
  async function leave(): Promise<boolean> {
    if (!autosave || (await autosave.flush())) return true;
    if (conflict) report(t("conflictPending"));
    return false;
  }

  /** The full file text of the editing session for the editor's `text`. */
  function composed(text: string): string {
    if (!session || !current) return text;
    if (session.kind === "document") return text;
    return applyEdits(current.text, [replaceSection(current.text, session.range, text)]);
  }

  function startEditing() {
    open({ kind: "document" }, current!.text);
  }

  function startSection(range: TextRange) {
    open({ kind: "section", range }, current!.text.slice(range.from, range.to));
  }

  function open(kind: Session, text: string) {
    original = current!.text;
    previewImages = new Map();
    draft = text;
    session = kind;
    saving = false;
    autosave = createAutosave({
      saved: text,
      delay: AUTOSAVE_MS,
      save: async (full) => {
        const whole = composed(full);
        const version = await project!.save(path!, whole, current!.version);
        if (session?.kind === "section") {
          const edit = replaceSection(current!.text, session.range, full);
          session = { kind: "section", range: { from: session.range.from, to: session.range.from + edit.text.length } };
        }
        current = { text: whole, version };
      },
      onchange: () => (saving = autosave?.saving ?? false),
      onerror: (reason) => {
        if (reason instanceof Conflict) {
          conflict = { theirs: reason.theirs };
          autosave?.pause();
        } else report(t("saveFailed"), reason);
      },
    });
  }

  /** Ends the editing session without saving anything (the caller has flushed or stopped the autosave). */
  function stopEditing() {
    session = null;
    autosave = null;
    conflict = null;
    comparing = false;
    saving = false;
  }

  function typed(text: string) {
    draft = text;
    autosave?.typed(text);
  }

  /** Keep mine: my text overwrites what is on disk. */
  async function keepMine() {
    const theirs = conflict?.theirs;
    if (!theirs || !autosave) return;
    try {
      // Mine is the whole file as I edit it: my section in the text I started from, not in theirs.
      const whole = composed(draft);
      const version = await project!.save(path!, whole, theirs.version);
      if (session?.kind === "section") {
        const edit = replaceSection(current!.text, session.range, draft);
        session = { kind: "section", range: { from: session.range.from, to: session.range.from + edit.text.length } };
      }
      current = { text: whole, version };
      autosave.reset(draft);
      autosave.resume();
      conflict = null;
      comparing = false;
    } catch (reason) {
      if (reason instanceof Conflict) conflict = { theirs: reason.theirs };
      else report(t("saveFailed"), reason);
    }
  }

  /** Take theirs: the disk's text is loaded, after my text went to the clipboard so that nothing is lost. */
  async function takeTheirs() {
    const theirs = conflict?.theirs;
    if (!theirs || !autosave) return;
    try {
      await navigator.clipboard.writeText(draft);
    } catch (reason) {
      report(t("textCopyFailed"), reason);
      return;
    }
    current = theirs;
    if (session?.kind === "document") {
      draft = theirs.text;
      autosave.reset(theirs.text);
      autosave.resume();
      conflict = null;
      comparing = false;
    } else {
      // The section's range no longer applies to the disk's version: the editor closes on it.
      await autosave.stop();
      stopEditing();
      notify(t("textCopied"));
    }
  }

  async function done() {
    if (!autosave) return;
    if (await autosave.flush()) stopEditing();
  }

  let reverting = $state(false);

  // The New document / New folder dialog.
  let creating = $state<{ kind: "document" | "folder"; name: string; folder: string; failure: string | null } | null>(null);

  /** Every Folder of the Tree, by path, in Tree order. */
  function folderPaths(entries: TreeEntry[]): string[] {
    return entries.flatMap((entry) => (entry.kind === "folder" ? [entry.path, ...folderPaths(entry.children)] : []));
  }
  const folderOf = (file: string) => file.slice(0, Math.max(0, file.lastIndexOf("/")));
  /** The entries of the Folder `folder` ("" = Project root) as the Tree shows them. */
  function entriesOf(folder: string, entries: TreeEntry[] = tree): TreeEntry[] {
    if (folder === "") return entries;
    for (const entry of entries) {
      if (entry.kind !== "folder") continue;
      if (entry.path === folder) return entry.children;
      const found = entriesOf(folder, entry.children);
      if (found.length > 0) return found;
    }
    return [];
  }
  const REFUSALS: Record<RefusalReason, MessageKey> = {
    empty: "refusedEmpty",
    characters: "refusedCharacters",
    edges: "refusedEdges",
    extension: "refusedExtension",
    reserved: "refusedReserved",
    taken: "refusedTaken",
    invalidManifest: "refusedInvalidManifest",
    intoItself: "refusedIntoItself",
    missing: "refusedMissing",
  };
  /** The message of a refusal; `change` for a rename or a move, whose invalid-manifest wording is not about adding entries. */
  const refusalMessage = (reason: RefusalReason, change = false) =>
    t(reason === "invalidManifest" && change ? "refusedInvalidManifestChange" : REFUSALS[reason]);
  /** What a dialog shows for a failed request: a refusal's message, else the generic failure with the raw reason as detail. */
  const failureText = (reason: unknown, change: boolean) =>
    reason instanceof Refused ? refusalMessage(reason.reason, change) : `${t("failed")} ${t("detail", { reason: reason instanceof Error ? reason.message : String(reason) })}`;
  const refusal = $derived(creating ? refusalOf(creating.kind, creating.name, entriesOf(creating.folder).map((entry) => entry.name)) : null);
  /** The path the entry will have: a Name already ending in .md is the file name itself. */
  const createdPath = $derived.by(() => {
    if (!creating) return "";
    const file = creating.kind === "document" ? documentFile(creating.name) : creating.name;
    return creating.folder === "" ? file : `${creating.folder}/${file}`;
  });

  function startCreating(kind: "document" | "folder") {
    creating = { kind, name: "", folder: path ? folderOf(path) : "", failure: null };
  }

  async function create() {
    if (!creating || !project || refusal) return;
    const { kind, name, folder } = creating;
    try {
      const made = kind === "document" ? await project.createDocument(folder, name) : await project.createFolder(folder, name);
      tree = await project.tree();
      creating = null;
      if (kind === "document") await openFresh(made);
    } catch (reason) {
      if (!creating) return;
      creating.failure = failureText(reason, false);
    }
  }

  // Renaming and moving: from the entry menu, and by drag and drop.
  const nameOf = (file: string) => file.slice(file.lastIndexOf("/") + 1);
  /** The name the User types for an entry: a Document's without .md. */
  const displayName = (entry: TreeEntry) => (entry.kind === "document" ? entry.name.replace(/\.md$/i, "") : entry.name);
  function findEntry(target: string, entries: TreeEntry[] = tree): TreeEntry | null {
    for (const entry of entries) {
      if (entry.path === target) return entry;
      if (entry.kind === "folder" && target.startsWith(`${entry.path}/`)) return findEntry(target, entry.children);
    }
    return null;
  }

  let menu = $state.raw<{ entry: TreeEntry; x: number; y: number } | null>(null);
  let renaming = $state<{ entry: TreeEntry; name: string; failure: string | null } | null>(null);
  let moving = $state<{ entry: TreeEntry; destination: string | null; failure: string | null } | null>(null);
  /** The Folders the User closed; the others are open. */
  let closed = $state.raw<ReadonlySet<string>>(new Set());
  let dragSource = $state<string | null>(null);
  let dropMark = $state.raw<{ path: string; position: DropPosition } | null>(null);
  let hover: { path: string; timer: ReturnType<typeof setTimeout> } | null = null;
  const HOVER_OPENS_MS = 600;

  const renameRefusal = $derived(
    renaming
      ? refusalOf(
          renaming.entry.kind,
          renaming.name,
          entriesOf(folderOf(renaming.entry.path))
            .filter((entry) => entry.path !== renaming!.entry.path)
            .map((entry) => entry.name),
        )
      : null,
  );
  /** The Folders an entry can move to: not its own, and for a Folder not itself nor one of its descendants. */
  const moveOptions = $derived.by(() => {
    if (!moving) return [];
    const { entry } = moving;
    return ["", ...folderPaths(tree)].filter(
      (folder) => folder !== folderOf(entry.path) && !(entry.kind === "folder" && (folder === entry.path || folder.startsWith(`${entry.path}/`))),
    );
  });
  const moveTaken = $derived(
    moving !== null && moving.destination !== null && entriesOf(moving.destination).some((entry) => entry.name.toLowerCase() === moving!.entry.name.toLowerCase()),
  );
  const movedPath = $derived(moving && moving.destination !== null ? (moving.destination === "" ? moving.entry.name : `${moving.destination}/${moving.entry.name}`) : "");

  /** Before a rename or a move, which may rewrite the open file: its autosave is flushed and its editing ended. */
  async function beforeChange(): Promise<boolean> {
    if (!(await leave())) return false;
    stopEditing();
    return true;
  }

  /** After an entry went from `from` to `to`: the Tree reloads and the open Document and the back trail follow it. */
  async function afterChange(from: string, to: string, isFolder: boolean, reveal?: string) {
    const map = entryMapper(from, to, isFolder);
    try {
      tree = await project!.tree();
      trail = trail.map((entry) => ({ ...entry, path: map(entry.path) ?? entry.path }));
      const folders = new Set([...closed].map((folder) => map(folder) ?? folder));
      if (reveal !== undefined) folders.delete(reveal);
      closed = folders;
      if (!path) return;
      const previous = path;
      const next = map(previous) ?? previous;
      path = next;
      // Its links may have been rewritten: it is read again.
      try {
        current = await project!.read(next);
        if (next !== previous) await projects.opened(active!, next);
      } catch (reason) {
        current = null;
        if (reason instanceof NotFound) report(t("notFound"));
        else throw reason;
      }
    } catch (reason) {
      fail(reason);
    }
  }

  function openMenu(entry: TreeEntry, x: number, y: number) {
    menu = { entry, x: Math.max(0, Math.min(x, window.innerWidth - 200)), y: Math.max(0, Math.min(y, window.innerHeight - 90)) };
  }

  function startRenaming(entry: TreeEntry) {
    menu = null;
    renaming = { entry, name: displayName(entry), failure: null };
  }

  function startMoving(entry: TreeEntry) {
    menu = null;
    moving = { entry, destination: null, failure: null };
    moving.destination = moveOptions[0] ?? null;
  }

  async function rename() {
    if (!renaming || !project || renameRefusal) return;
    const { entry, name } = renaming;
    if (name === displayName(entry)) {
      renaming = null;
      return;
    }
    if (!(await beforeChange())) {
      renaming = null;
      return;
    }
    let to: string;
    try {
      to = await project.rename(entry.path, name);
    } catch (reason) {
      if (renaming) renaming.failure = failureText(reason, true);
      return;
    }
    renaming = null;
    await afterChange(entry.path, to, entry.kind === "folder");
  }

  async function moveFromDialog() {
    if (!moving || !project || moving.destination === null || moveTaken) return;
    const { entry, destination } = moving;
    if (!(await beforeChange())) {
      moving = null;
      return;
    }
    let to: string;
    try {
      to = await project.move(entry.path, destination);
    } catch (reason) {
      if (moving) moving.failure = failureText(reason, true);
      return;
    }
    moving = null;
    await afterChange(entry.path, to, entry.kind === "folder", destination);
  }

  function cancelHover() {
    if (hover) clearTimeout(hover.timer);
    hover = null;
  }

  function endDrag() {
    cancelHover();
    dragSource = null;
    dropMark = null;
  }

  async function dropped(target: TreeEntry, position: DropPosition) {
    const sourcePath = dragSource;
    endDrag();
    const source = sourcePath ? findEntry(sourcePath) : null;
    if (!source || !project) return;
    if (source.path === target.path) return;
    const folder = position === "inside" ? target.path : folderOf(target.path);
    const place = position === "before" ? { before: target.name } : position === "after" ? { after: target.name } : undefined;
    if (!(await beforeChange())) return;
    let to: string;
    try {
      to = await project.move(source.path, folder, place);
    } catch (reason) {
      if (reason instanceof Refused) report(`${t("moveFailed", { name: source.name })} ${refusalMessage(reason.reason, true)}`);
      else report(t("moveFailed", { name: source.name }), reason);
      return;
    }
    await afterChange(source.path, to, source.kind === "folder", folder);
  }

  const drag: Dragging = {
    get source() {
      return dragSource;
    },
    get mark() {
      return dropMark;
    },
    get closed() {
      return closed;
    },
    start: (source) => (dragSource = source),
    over(entry, position) {
      if (dropMark?.path !== entry.path || dropMark.position !== position) dropMark = { path: entry.path, position };
      if (entry.kind === "folder" && position === "inside" && closed.has(entry.path)) {
        if (hover?.path === entry.path) return;
        cancelHover();
        hover = {
          path: entry.path,
          timer: setTimeout(() => {
            hover = null;
            closed = new Set([...closed].filter((folder) => folder !== entry.path));
          }, HOVER_OPENS_MS),
        };
      } else cancelHover();
    },
    leave(entry) {
      if (dropMark?.path === entry.path) dropMark = null;
      cancelHover();
    },
    drop: (entry, position) => void dropped(entry, position),
    end: endDrag,
    toggle(folder, open) {
      if (open === closed.has(folder)) closed = open ? new Set([...closed].filter((each) => each !== folder)) : new Set([...closed, folder]);
    },
    menu: openMenu,
  };

  /** Selects the text of a field when it appears. */
  function selectAll(node: HTMLInputElement) {
    void tick().then(() => node.select());
  }

  /** Arrow keys move through the items of the entry menu. */
  function menuKey(event: KeyboardEvent) {
    const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[role=menuitem]")];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") items[(at + 1) % items.length]?.focus();
    else if (event.key === "ArrowUp") items[(at - 1 + items.length) % items.length]?.focus();
    else return;
    event.preventDefault();
  }

  function focusFirst(node: HTMLElement) {
    node.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }

  /** Opens a `<dialog>` as a modal when it appears (the Host's frame blocks window.confirm). */
  function modal(node: HTMLDialogElement) {
    node.showModal();
  }

  async function revert() {
    if (!autosave) return;
    if (composed(draft) !== original || current!.text !== original) {
      reverting = true;
      return;
    }
    await doRevert();
  }

  async function doRevert() {
    reverting = false;
    if (!autosave) return;
    await autosave.stop();
    if (current!.text !== original) {
      try {
        // Reverting overwrites a change made on disk meanwhile, as Keep mine does.
        await project!.save(path!, original, conflict?.theirs?.version ?? current!.version);
      } catch (reason) {
        if (reason instanceof Conflict) {
          conflict = { theirs: reason.theirs };
          autosave.reset(draft);
          autosave.pause();
        } else report(t("revertFailed"), reason);
        return;
      }
    }
    const reread = await project!.read(path!).catch(() => null);
    stopEditing();
    if (reread) current = reread;
  }

  /** The View, already loaded, opened again on a Document, as from the Widget. */
  function onParams(params: Record<string, string>) {
    const wanted = route(params);
    if (wanted?.path && project && active?.id === wanted.project && wanted.path !== path) void openFresh(wanted.path);
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
    clearTimeout(confirmation);
    stopParams?.();
    document.removeEventListener("visibilitychange", onVisibility);
  });
</script>

{#snippet compareTable(mine: string, theirs: string)}
  <section class="compare" aria-label={t("compare")}>
    <table>
      <thead><tr><th></th><th>{t("mine")}</th><th></th><th>{t("theirs")}</th></tr></thead>
      <tbody>
        {#each sideBySide(mine, theirs) as row, index (index)}
          <tr class={row.kind}>
            <td class="n">{row.mineLine ?? ""}</td>
            <td><pre>{row.mine ?? ""}</pre></td>
            <td class="n">{row.theirsLine ?? ""}</td>
            <td><pre>{row.theirs ?? ""}</pre></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/snippet}

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
      <div class="nav-head">
        <p class="project">{active.name}</p>
        <div class="creators">
          <button type="button" class="icon" aria-label={t("newDocument")} title={t("newDocument")} onclick={() => startCreating("document")}>
            {@render entryIcon("document")}
          </button>
          <button type="button" class="icon" aria-label={t("newFolder")} title={t("newFolder")} onclick={() => startCreating("folder")}>
            {@render entryIcon("folder")}
          </button>
        </div>
      </div>
      {#if tree.length === 0}
        <p class="muted">{t("emptyProject")}</p>
      {:else}
        <Tree entries={tree} current={path} open={(target) => void openFresh(target)} {drag} />
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
          ondone={() => void done()}
          onrevert={() => void revert()}
        />
        </div>
        {#if conflict}
          <div class="banner" role="alert">
            <p>{conflict.theirs ? t("changedOutside") : t("deletedOutside")}</p>
            {#if conflict.theirs}
              <button onclick={() => (comparing = !comparing)}>{t("compare")}</button>
              <button onclick={() => void keepMine()}>{t("keepMine")}</button>
              <button class="primary" onclick={() => void takeTheirs()}>{t("takeTheirs")}</button>
            {/if}
          </div>
          {#if comparing && conflict.theirs}
            {@render compareTable(composed(draft), conflict.theirs.text)}
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
          <ArticleTools
            {article}
            {notify}
            fail={report}
            sectionAt={(offset) => (readOnly || session || !current ? null : sectionAt(current.text, offset))}
            onsection={startSection}
          />
        {/if}
      {/if}
    </main>
  </div>
{/if}

{#if session?.kind === "section" && current}
  {@const compareWith = conflict?.theirs}
  <dialog
    use:modal
    class="section"
    aria-label={t("editSection")}
    oncancel={(event) => { event.preventDefault(); void done(); }}
    onkeydown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void done(); } }}
  >
    <header class="toolbar">
      <h2>{t("editSection")}</h2>
      <p class="muted hint">{t("sectionHint")}</p>
      {#if saving}<span class="muted" role="status">{t("saving")}</span>{/if}
      <button onclick={() => void revert()}>{t("revert")}</button>
      <button class="primary" onclick={() => void done()}>{t("done")}</button>
    </header>
    {#if conflict}
      <div class="banner" role="alert">
        <p>{compareWith ? t("changedOutside") : t("deletedOutside")}</p>
        {#if compareWith}
          <button onclick={() => (comparing = !comparing)}>{t("compare")}</button>
          <button onclick={() => void keepMine()}>{t("keepMine")}</button>
          <button class="primary" onclick={() => void takeTheirs()}>{t("takeTheirs")}</button>
        {/if}
      </div>
      {#if comparing && compareWith}
        {@render compareTable(composed(draft), compareWith.text)}
      {/if}
    {/if}
    <div class="panes">
      <Editor text={draft} label={t("markdown")} onchange={typed} />
      <section class="preview" aria-label={t("preview")}>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <article class="document" bind:this={preview} onclick={(event) => event.preventDefault()}>{@html previewHtml}</article>
      </section>
    </div>
  </dialog>
{/if}

<!-- Lucide's file-plus, folder-plus, pencil and folder-input (ISC licence), drawn with the text's colour. -->
{#snippet entryIcon(kind: "document" | "folder" | "rename" | "move")}
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    {#if kind === "rename"}
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" />
    {:else if kind === "move"}
      <path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1" /><path d="M2 13h10" /><path d="m9 16 3-3-3-3" />
    {:else if kind === "document"}
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M12 12v6" /><path d="M9 15h6" />
    {:else}
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /><path d="M12 10v6" /><path d="M9 13h6" />
    {/if}
  </svg>
{/snippet}

{#if creating}
  <dialog use:modal aria-labelledby="create-title" class="create" oncancel={() => (creating = null)}>
    <form onsubmit={(event) => { event.preventDefault(); void create(); }}>
      <header>
        <span class="badge-icon">{@render entryIcon(creating.kind)}</span>
        <h2 id="create-title">{creating.kind === "document" ? t("newDocument") : t("newFolder")}</h2>
      </header>
      <div class="field">
        <label for="create-name">{t("name")}</label>
        <input
          id="create-name"
          type="text"
          class:invalid={creating.failure !== null || (refusal !== null && refusal !== "empty")}
          bind:value={creating.name}
          oninput={() => creating && (creating.failure = null)}
          aria-describedby="create-problem"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
      <div class="field">
        <label for="create-location">{t("location")}</label>
        <div class="select">
          <select id="create-location" bind:value={creating.folder} onchange={() => creating && (creating.failure = null)}>
            <option value="">{t("rootLocation")}</option>
            {#each folderPaths(tree) as folder (folder)}
              <option value={folder}>/{folder}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="preview-path">
        <span>{t("willBeCreatedAt")}</span>
        <code>{createdPath}</code>
      </div>
      <div id="create-problem">
        {#if creating.failure}
          <p class="problem" role="alert">{creating.failure}</p>
        {:else if refusal && refusal !== "empty"}
          <p class="problem" role="alert">{refusalMessage(refusal)}</p>
        {/if}
      </div>
      <div class="actions">
        <button type="button" onclick={() => (creating = null)}>{t("cancel")}</button>
        <button type="submit" class="primary" disabled={refusal !== null}>{t("create")}</button>
      </div>
    </form>
  </dialog>
{/if}

{#if renaming}
  <dialog use:modal aria-labelledby="rename-title" class="create" oncancel={() => (renaming = null)}>
    <form onsubmit={(event) => { event.preventDefault(); void rename(); }}>
      <header>
        <span class="badge-icon">{@render entryIcon("rename")}</span>
        <h2 id="rename-title">{renaming.entry.kind === "document" ? t("renameDocument") : t("renameFolder")}</h2>
      </header>
      <div class="field">
        <label for="rename-name">{t("newName")}</label>
        <input
          id="rename-name"
          type="text"
          use:selectAll
          class:invalid={renaming.failure !== null || (renameRefusal !== null && renameRefusal !== "empty")}
          bind:value={renaming.name}
          oninput={() => renaming && (renaming.failure = null)}
          aria-describedby="rename-problem"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
      <p class="hint">{t("renameHint")}</p>
      <div id="rename-problem">
        {#if renaming.failure}
          <p class="problem" role="alert">{renaming.failure}</p>
        {:else if renameRefusal && renameRefusal !== "empty"}
          <p class="problem" role="alert">{refusalMessage(renameRefusal, true)}</p>
        {/if}
      </div>
      <div class="actions">
        <button type="button" onclick={() => (renaming = null)}>{t("cancel")}</button>
        <button type="submit" class="primary" disabled={renameRefusal !== null}>{t("rename")}</button>
      </div>
    </form>
  </dialog>
{/if}

{#if moving}
  <dialog use:modal aria-labelledby="move-title" class="create" oncancel={() => (moving = null)}>
    <form onsubmit={(event) => { event.preventDefault(); void moveFromDialog(); }}>
      <header>
        <span class="badge-icon">{@render entryIcon("move")}</span>
        <h2 id="move-title">{moving.entry.kind === "document" ? t("moveDocument") : t("moveFolder")}</h2>
      </header>
      <div class="field">
        <label for="move-destination">{t("destination")}</label>
        <div class="select">
          <select id="move-destination" bind:value={moving.destination} onchange={() => moving && (moving.failure = null)}>
            {#each moveOptions as folder (folder)}
              <option value={folder}>{folder === "" ? t("rootLocation") : `/${folder}`}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="preview-path">
        <span>{t("willBeMovedTo")}</span>
        <code>{movedPath}</code>
      </div>
      <div id="move-problem">
        {#if moving.failure}
          <p class="problem" role="alert">{moving.failure}</p>
        {:else if moveTaken}
          <p class="problem" role="alert">{refusalMessage("taken")}</p>
        {/if}
      </div>
      <div class="actions">
        <button type="button" onclick={() => (moving = null)}>{t("cancel")}</button>
        <button type="submit" class="primary" disabled={moving.destination === null || moveTaken}>{t("move")}</button>
      </div>
    </form>
  </dialog>
{/if}

{#if menu}
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="menu" role="menu" aria-label={menu.entry.name} style:left="{menu.x}px" style:top="{menu.y}px" use:focusFirst onkeydown={menuKey}>
    <button type="button" role="menuitem" onclick={() => startRenaming(menu!.entry)}>{t("rename")}</button>
    <button type="button" role="menuitem" onclick={() => startMoving(menu!.entry)}>{t("moveTo")}</button>
  </div>
{/if}

<svelte:window
  onkeydown={(event) => { if (event.key === "Escape" && menu) menu = null; }}
  onpointerdown={(event) => { if (menu && !(event.target as Element).closest("[role=menu]")) menu = null; }}
/>

{#if reverting}
  <dialog use:modal aria-labelledby="revert-title" oncancel={() => (reverting = false)}>
    <h2 id="revert-title">{t("revertTitle")}</h2>
    <p>{t("revertText")}</p>
    <div class="actions">
      <button onclick={() => (reverting = false)}>{t("keepEditing")}</button>
      <button class="primary" onclick={() => void doRevert()}>{t("revert")}</button>
    </div>
  </dialog>
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
  .compare {
    display: block;
    overflow: auto;
    max-height: 40vh;
  }
  .compare table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .compare th {
    text-align: left;
  }
  .compare pre {
    white-space: pre-wrap;
    margin: 0;
  }
  .compare td.n {
    width: 2.5rem;
    color: var(--ink-muted, #777);
    text-align: right;
    vertical-align: top;
  }
  .compare tr.changed {
    background: color-mix(in srgb, #ffd54a 30%, transparent);
  }
  .compare tr.removed {
    background: color-mix(in srgb, #e53935 22%, transparent);
  }
  .compare tr.added {
    background: color-mix(in srgb, #43a047 22%, transparent);
  }
  dialog {
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  dialog.section {
    width: min(96vw, 90rem);
    height: 90vh;
    padding: 0.75rem 1rem;
  }
  dialog.section[open] {
    display: flex;
    flex-direction: column;
  }
  dialog.section .toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  dialog.section h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  dialog.section .hint {
    margin: 0 auto 0 0;
  }
  .panes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    flex: 1;
    min-height: 0;
  }
  .panes > :global(*) {
    min-height: 0;
    overflow: auto;
  }
  .preview {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 0 1rem;
  }
  .nav-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .nav-head .project {
    flex: 1;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .creators {
    display: flex;
    gap: 0.125rem;
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
    transition: background-color 120ms, color 120ms;
  }
  button.icon:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
  }
  button.icon:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  dialog.create {
    width: min(92vw, 28rem);
    padding: 1.25rem 1.5rem 1.25rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
  }
  dialog.create::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  dialog.create header {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 1.25rem;
  }
  dialog.create h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .badge-icon {
    display: inline-grid;
    place-items: center;
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 8px;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 1rem;
  }
  .field label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted, #777);
  }
  .field input,
  .field select {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    color: var(--ink);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 0.5rem 0.7rem;
    transition: border-color 120ms, box-shadow 120ms;
  }
  .field input:hover,
  .field select:hover {
    border-color: color-mix(in srgb, var(--ink) 30%, var(--line));
  }
  .field input:focus,
  .field select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .field input.invalid {
    border-color: #e53935;
  }
  .field input.invalid:focus {
    box-shadow: 0 0 0 3px rgb(229 57 53 / 0.2);
  }
  /* The select draws its own chevron, in the text's colour, instead of the browser's. */
  .select {
    position: relative;
  }
  .select select {
    appearance: none;
    padding-right: 2.2rem;
    cursor: pointer;
  }
  .select::after {
    content: "";
    position: absolute;
    right: 0.9rem;
    top: 50%;
    width: 0.45rem;
    height: 0.45rem;
    border-right: 1.75px solid var(--muted, #777);
    border-bottom: 1.75px solid var(--muted, #777);
    transform: translateY(-70%) rotate(45deg);
    pointer-events: none;
  }
  .preview-path {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.55rem 0.75rem;
    margin-bottom: 1rem;
    border-radius: 6px;
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    font-size: 0.8rem;
    color: var(--muted, #777);
  }
  .preview-path code {
    color: var(--ink);
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }
  .problem {
    color: #e53935;
    font-size: 0.875rem;
    margin: -0.25rem 0 1rem;
  }
  dialog.create .actions {
    margin-top: 0.5rem;
  }
  dialog.create .actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .hint {
    margin: -0.5rem 0 1rem;
    font-size: 0.8rem;
    color: var(--muted, #777);
  }
  .menu {
    position: fixed;
    z-index: 20;
    min-width: 10rem;
    display: flex;
    flex-direction: column;
    padding: 0.25rem;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
  }
  .menu button {
    text-align: left;
    border: none;
    background: transparent;
    padding: 0.4rem 0.7rem;
    border-radius: 5px;
  }
  .menu button:hover,
  .menu button:focus-visible {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    outline: none;
  }
  dialog .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
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
