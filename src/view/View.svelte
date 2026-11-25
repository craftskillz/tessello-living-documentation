<script lang="ts">
  // The Active Project: its Tree, the open Document (read or edited), agent edits and conflicts (docs/spec/cross-cutting.md).
  import type { ConnectedModule } from "@tessello/sdk";
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import { createAutosave, type Autosave } from "../lib/autosave.ts";
  import { sideBySide } from "../lib/diff.ts";
  import { applyEdits, type TextRange } from "../lib/edits.ts";
  import { replaceSection, sectionAt } from "../lib/sections.ts";
  import { parseDocument, setField, setType } from "../lib/document.ts";
  import { htmlTemplateOf, type HtmlTemplateId } from "../lib/htmlTemplates.ts";
  import HtmlTemplateDialog from "./HtmlTemplateDialog.svelte";
  import HtmlView from "./HtmlView.svelte";
  import DocumentMeta from "./DocumentMeta.svelte";
  import { decorateCollapsible } from "./collapsible.ts";
  import { drawDiagrams } from "./mermaid.ts";
  import Annotations from "./Annotations.svelte";
  import { addAnnotation, ANNOTATIONS_FILE, type MarkerState, NEXT_MARKER, readAnnotations } from "../lib/annotations.ts";
  import { loadImages } from "../lib/images.ts";
  import { t, tn, type MessageKey } from "../lib/i18n.ts";
  import { previewOf, type FilePreview } from "../lib/otherFiles.ts";
  import { Conflict, documentFile, FOLDER_MANIFEST, isInsideReserved, isReservedFolder, NotFound, Refused, refusalOf, type Deletion, type DocumentText, type Project, type RefusalReason, type TreeDocument, type TreeEntry, type TreeFolder } from "../lib/project.ts";
  import { entryMapper } from "../lib/links.ts";
  import { compileLabelFilter, NO_LABEL_FILTER, type LabelFilter } from "../lib/labels.ts";
  import { DEFAULT_SETTINGS, readSettings, setSoftBreaks, SETTINGS_FILE, type ProjectSettings } from "../lib/projectSettings.ts";
  import { createProjects, FolderRefused, MAX_FAVORITES, SIDEBAR_WIDTH, TOC_WIDTH, type DisplayPreferences, type Favorite, type ListedProject, type ProjectInfo, projectLabel } from "../lib/projects.ts";
  import ProjectSettingsPanel from "./ProjectSettings.svelte";
  import ProjectSwitcher from "./ProjectSwitcher.svelte";
  import { createLiveSearch, documentsIn, filterTree, searchProject, titleResults, type SearchResult } from "../lib/search.ts";
  import { renderDocument } from "../lib/render.ts";
  import ArticleTools from "./ArticleTools.svelte";
  import { applyLineLabels } from "./lines.ts";
  import Editor from "./Editor.svelte";
  import Favorites from "./Favorites.svelte";
  import Header from "./Header.svelte";
  import ResizeHandle from "./ResizeHandle.svelte";
  import Toc, { type Heading } from "./Toc.svelte";
  import Tree, { type Dragging, type DropPosition } from "./Tree.svelte";

  let { host }: { host: ConnectedModule } = $props();

  const CHECK_MS = 5000;
  const AUTOSAVE_MS = 1000;
  const projects = $derived(createProjects(host));

  let loaded = $state(false);
  let active = $state<ListedProject | null>(null);
  /** Every Project, for the switcher: read again when its menu opens. */
  let allProjects = $state.raw<ListedProject[]>([]);
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
  let display = $state<DisplayPreferences>({ lines: false, whiteBackground: false, showHidden: false, treeLabels: "name", toc: { open: false, width: TOC_WIDTH.default }, sidebar: { width: SIDEBAR_WIDTH.default } });
  /** The annotation Marker: Normal shows the annotations, Active also creates them, Hidden shows none. Normal and Hidden are kept. */
  let marker = $state<MarkerState>("normal");
  /** Changes when the open Document or the annotations file changed on disk: the annotations are read again. */
  let annotationsChanged = $state(0);
  let headings = $state.raw<Heading[]>([]);
  /** The Project's favorites in the User's order (personal, ADR 0007), with the Documents' current titles. */
  let favorites = $state.raw<Favorite[]>([]);
  /** The Project's own settings (shared in its .living-doc.json), read when it is opened and when an agent changes the file. */
  let settings = $state<ProjectSettings>(DEFAULT_SETTINGS);
  let settingEdits = 0;
  let favoritesSaving: Promise<void> = Promise.resolve();
  /** The Project's label filter (kept per Project): only the Tree's display uses it. */
  let labelFilter = $state<LabelFilter>({ ...NO_LABEL_FILTER });
  let labelFilterSaving: Promise<void> = Promise.resolve();
  let treeNav = $state<HTMLElement>();
  /** The search field's text, and what it found: null when the field is blank (the whole Tree shows). */
  let query = $state("");
  let searchResults = $state.raw<SearchResult[] | null>(null);
  const liveSearch = createLiveSearch({
    titles: (text) => titleResults(tree, text),
    fullText: (text) => searchProject(project!, tree, text),
    onresults: (results) => (searchResults = results),
    onfailure: (reason) => report(t("searchFailed"), reason),
  });
  onDestroy(() => liveSearch.dispose());
  // The Tree reloaded (agent edits, Show hidden items, a rename…) during a search: search it again.
  $effect(() => {
    void tree;
    untrack(() => liveSearch.refresh());
  });
  /** What the Tree shows: the whole Tree, or only the search results and the Folders leading to them. */
  const shownTree = $derived(searchResults ? filterTree(tree, new Set(searchResults.map((result) => result.path))) : tree);
  const excerpts = $derived(new Map((searchResults ?? []).filter((result) => result.excerpt !== "").map((result) => [result.path, result.excerpt])));
  const compiledFilter = $derived(compileLabelFilter(labelFilter));
  /** What a Tree row shows: a Document's file name or title as chosen, a Folder's name, then the filter. */
  const treeLabel = (entry: TreeFolder | TreeDocument) => {
    const base = entry.kind === "document" && display.treeLabels === "title" ? entry.title : entry.name;
    return compiledFilter.ok ? compiledFilter.apply(base) : base;
  };

  /** Applies a valid filter at once, then keeps it for the Project (one write after the other). */
  function setLabelFilter(next: LabelFilter) {
    labelFilter = next;
    const asked = active!;
    const turn = labelFilterSaving.then(() => projects.setLabelFilter(asked, next));
    labelFilterSaving = turn.then(() => undefined, () => undefined);
    turn.catch((reason) => report(t("labelFilterFailed"), reason));
  }
  let favoriteEdits = 0;
  const starred = $derived(path !== null && favorites.some((each) => each.path === path));

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
      }, { frontmatter: readOnly, softBreaks: settings.softBreaks }) : "");
  /** The live preview of the section being edited, rendered as a Document of its own; its links do nothing. */
  const previewHtml = $derived(
    session?.kind === "section" && path
      ? renderDocument(parseDocument(draft, path), path, {
          footnotes: t("footnotes"),
          footnoteBack: t("footnoteBack"),
          compareSource: t("compareSource"),
          compareRender: t("compareRender"),
        }, { softBreaks: settings.softBreaks })
      : "",
  );
  const hasHeading = $derived(model ? /^ {0,3}# /m.test(model.body) : false);

  /** The HTML view is open on the Document (a View state, never an address), and the template dialog with its saving state. */
  let htmlOpen = $state(false);
  let choosing = $state<{ saving: boolean; failure: string | null } | null>(null);
  const templateOf = $derived(model ? htmlTemplateOf(model.htmlTemplate) : null);

  /** Opens the template dialog, nothing saving and no failure yet. */
  function openChooser() {
    choosing = { saving: false, failure: null };
  }

  /** Writes `html_template` (only that line, version-checked); the dialog stays open on a conflict or a failure. */
  async function chooseTemplate(id: HtmlTemplateId) {
    if (!current || !path || !project || !choosing || choosing.saving) return;
    if (templateOf?.id === id) return void (choosing = null);
    const edit = setField(current.text, "html_template", id);
    if (!edit) {
      choosing = null;
      htmlOpen = false;
      report(t("htmlFixFrontmatter"));
      startEditing();
      return;
    }
    const asked = path;
    const text = applyEdits(current.text, [edit]);
    choosing = { saving: true, failure: null };
    try {
      const version = await project.save(asked, text, current.version);
      if (path === asked) current = { text, version };
      choosing = null;
    } catch (reason) {
      if (reason instanceof Conflict) {
        if (reason.theirs && path === asked) current = reason.theirs;
        choosing = { saving: false, failure: t("htmlChangedOnDisk") };
      } else choosing = { saving: false, failure: t("htmlSaveFailed", { reason: reason instanceof Error ? reason.message : String(reason) }) };
    }
  }

  /** When the open Document's file was last modified; refetched when the path or its version changes (an own save, an agent edit). */
  let modifiedAt = $state<number | null>(null);
  $effect(() => {
    const asked = path;
    void current?.version;
    const open = project;
    if (!asked || !open) {
      modifiedAt = null;
      return;
    }
    void open.modified(asked).then(
      (at) => {
        if (path === asked) modifiedAt = at;
      },
      () => {
        if (path === asked) modifiedAt = null;
      },
    );
  });

  /** Writes the Type (only that line, version-checked); an empty value clears it. */
  async function saveType(value: string) {
    if (!current || !path || !project) return;
    const edit = setType(current.text, value);
    if (!edit) {
      report(t("htmlFixFrontmatter"));
      startEditing();
      return;
    }
    const text = applyEdits(current.text, [edit]);
    if (text === current.text) return;
    const asked = path;
    try {
      const version = await project.save(asked, text, current.version);
      if (path === asked) current = { text, version };
    } catch (reason) {
      if (reason instanceof Conflict) {
        if (reason.theirs && path === asked) current = reason.theirs;
        report(t("typeChangedOnDisk"));
      } else report(t("typeSaveFailed", { reason: reason instanceof Error ? reason.message : String(reason) }));
    }
  }

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

  /**
   * Widths not yet kept: the pointer or the keys change them at once, the write comes after, and a later write may land
   * before an earlier one is answered. Null when nothing is pending, and the kept width shows.
   */
  let pendingSidebar = $state<number | null>(null);
  let pendingToc = $state<number | null>(null);
  /** The sidebar's width while its handle is dragged, before it is written. */
  let draggedWidth = $state<number | null>(null);
  const sidebarWidth = $derived(draggedWidth ?? pendingSidebar ?? display.sidebar.width);
  const tocWidth = $derived(pendingToc ?? display.toc.width);

  /**
   * The widths asked so far: only the last write clears the pending width. Comparing widths would not do: 272, 288, 272
   * cleared it when the first 272 was kept, and 288 showed until the last write landed.
   */
  let sidebarWrites = 0;
  let tocWrites = 0;

  async function keepSidebar(width: number) {
    const write = ++sidebarWrites;
    pendingSidebar = width;
    await setDisplay({ sidebar: { width } });
    if (write === sidebarWrites) pendingSidebar = null;
  }

  async function keepToc(width: number) {
    const write = ++tocWrites;
    pendingToc = width;
    await setDisplay({ toc: { width } });
    if (write === tocWrites) pendingToc = null;
  }

  /** Writes follow one another, so that key presses in a row are kept in order. */
  let writing: Promise<void> = Promise.resolve();

  function setDisplay(changes: Parameters<typeof projects.setPreferences>[0]) {
    writing = writing.then(async () => {
      try {
        display = await projects.setPreferences(changes);
      } catch (reason) {
        fail(reason);
      }
    });
    return writing;
  }

  /** Normal → Active → Hidden → Normal; only Normal and Hidden are remembered (docs/spec/annotations.md rule 5). */
  function cycleMarker() {
    marker = NEXT_MARKER[marker];
    if (marker !== "active") void setDisplay({ markerHidden: marker === "hidden" });
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
    marker = display.markerHidden ? "hidden" : "normal";
    const list = await projects.list();
    const wanted = route(host.context.params);
    const activeId = (await projects.active())?.id;
    // A deep link opens its Project; else the Active Project.
    allProjects = list;
    active = list.find((each) => each.id === wanted?.project) ?? list.find((each) => each.id === activeId) ?? null;
    if (active && active.id !== activeId) await projects.setActive(active);
    loaded = true;
    if (active?.state === "available") await openActive(wanted?.path ?? null);
  }

  /** The favorites read again: after a rename, move, delete or agent edit, and when the menu opens. */
  async function loadFavorites() {
    if (!active) return;
    const asked = active;
    const edits = favoriteEdits;
    try {
      const latest = await projects.favorites(asked);
      // A list read before the User's last change would put it back.
      if (active === asked && edits === favoriteEdits) favorites = latest;
    } catch (reason) {
      fail(reason);
    }
  }

  /** The Project's settings read again: when it is opened, and when an agent or a teammate changed the file. */
  async function loadSettings() {
    if (!project) return;
    const asked = project;
    const edits = settingEdits;
    try {
      const latest = await readSettings(asked);
      // A read made before the User's last change would put the old value back.
      if (project === asked && edits === settingEdits) settings = latest;
    } catch (reason) {
      fail(reason);
    }
  }

  /** Shows the new value at once, then keeps it in the Project's file; if it cannot be kept, the disk's value comes back with a message. */
  async function changeSoftBreaks(on: boolean) {
    if (!project) return;
    const asked = project;
    const previous = settings;
    const edit = ++settingEdits;
    settings = { ...settings, softBreaks: on };
    try {
      await setSoftBreaks(asked, on);
    } catch (reason) {
      if (project !== asked) return;
      if (edit === settingEdits) settings = previous;
      if (reason instanceof Refused) report(refusalMessage(reason.reason));
      else if (reason instanceof Conflict) {
        report(t("settingsConflict"));
        settingEdits++;
        void loadSettings();
      } else fail(reason);
    }
  }

  /** Shows `next` at once, then keeps it; if it cannot be kept, the previous list comes back with a message. */
  async function saveFavorites(next: Favorite[]) {
    const previous = favorites;
    favorites = next;
    const edit = ++favoriteEdits;
    const project = active!;
    // One save after the other, so that a quick series (Alt + ↓ twice) is kept in the order it was made.
    const turn = favoritesSaving.then(() => projects.setFavorites(project, next.map(({ path, title }) => ({ path, title }))));
    favoritesSaving = turn.then(() => undefined, () => undefined);
    try {
      await turn;
    } catch (reason) {
      // A later change, already shown, carries this one on: putting this list back would hide it.
      if (edit === favoriteEdits) favorites = previous;
      report(t("favoritesFailed"), reason);
    }
  }

  function toggleFavorite() {
    if (path === null || !model) return;
    if (starred) return void saveFavorites(favorites.filter((each) => each.path !== path));
    if (favorites.length >= MAX_FAVORITES) return report(t("favoritesFull", { max: MAX_FAVORITES }));
    void saveFavorites([...favorites, { path, title: model.title, missing: false }]);
  }

  function moveFavorite(from: number, to: number) {
    const next = [...favorites];
    next.splice(to, 0, ...next.splice(from, 1));
    void saveFavorites(next);
  }

  /** The Tree as the display preferences want it: with the hidden items when Show hidden items is on. */
  const loadTree = () => project!.tree({ hidden: display.showHidden });

  async function openActive(wantedPath: string | null) {
    project = projects.open(active!);
    labelFilter = { ...NO_LABEL_FILTER };
    const asked = active;
    void projects.labelFilter(active!).then((kept) => {
      if (active === asked) labelFilter = kept;
    }, fail);
    tree = await loadTree();
    await project.check();
    void loadFavorites();
    settings = DEFAULT_SETTINGS;
    void loadSettings();
    const target = wantedPath ?? (await projects.startDocument(active!));
    if (target) await show(target);
    clearInterval(checking);
    checking = setInterval(() => void checkOutside(), CHECK_MS);
  }

  async function show(target: string, loaded?: DocumentText) {
    // The text typed is saved before another Document opens; on a conflict or a failure, the open one stays.
    if (!(await leave())) return;
    stopEditing();
    closeFile();
    htmlOpen = false;
    choosing = null;
    path = target;
    error = null;
    detail = null;
    try {
      const text = loaded ?? (await project!.read(target));
      // Another Document was asked for while this one was read (a click while the start Document loads): it wins.
      if (path !== target) return;
      current = text;
      await projects.opened(active!, target);
    } catch (reason) {
      if (path !== target) return;
      current = null;
      if (reason instanceof NotFound) report(t("notFound"));
      else fail(reason);
      return;
    }
    await revealInTree(target);
  }

  /** Opens the closed Folders around the Document and scrolls its row into view in the Tree. */
  async function revealInTree(target: string) {
    const folders: string[] = [];
    for (let slash = target.indexOf("/"); slash !== -1; slash = target.indexOf("/", slash + 1)) folders.push(target.slice(0, slash));
    if (folders.some((folder) => closed.has(folder))) closed = new Set([...closed].filter((folder) => !folders.includes(folder)));
    await tick();
    treeNav?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
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
    return loadImages(article, (imagePath) => project!.readBytes(imagePath), (imagePath) => t("imageNotFound", { path: imagePath }));
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
        const reading = project!.readBytes(imagePath);
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

  /** The message for a folder the Host refused, null for any other failure. */
  function refusedText(reason: unknown): string | null {
    if (!(reason instanceof FolderRefused)) return null;
    return reason.reason === "overlapping" ? (reason.project ? t("overlapNamed", { name: projectLabel(reason.project) }) : t("overlapUnnamed")) : null;
  }

  async function loadProjects() {
    try {
      allProjects = await projects.list();
    } catch (reason) {
      fail(reason);
    }
  }

  /** Forgets what the open Project showed, before another one opens (its text was saved by `leave`). */
  function resetOpen() {
    clearInterval(checking);
    project = null;
    stopEditing();
    closeFile();
    htmlOpen = false;
    choosing = null;
    path = null;
    current = null;
    trail = [];
    tree = [];
    favorites = [];
    settings = DEFAULT_SETTINGS;
    closed = new Set();
    query = "";
    liveSearch.search("");
    error = null;
    detail = null;
    menu = null;
    creating = renaming = moving = deleting = null;
    settingsOpen = false;
  }

  /** Makes `next` the Active Project and opens it (an Unavailable one shows its screen). */
  async function openProjectAs(next: ListedProject | null) {
    resetOpen();
    active = next;
    if (!next) return;
    try {
      await projects.setActive(next);
      if (next.state === "available") await openActive(null);
    } catch (reason) {
      fail(reason);
    }
  }

  /** Switches to another Project, once the open Document's text is saved. */
  async function switchTo(next: ListedProject) {
    if (active?.id === next.id) return;
    if (!(await leave())) return;
    await openProjectAs(next);
  }

  /** The Host's folder prompt opens first, straight from the click; the text typed is saved after. */
  async function connectFolder() {
    const previous = active;
    try {
      const connected = await projects.connect();
      if (!connected) return;
      if (!(await leave())) {
        // The open Document could not be saved: it stays the Active Project.
        if (previous) await projects.setActive(previous);
        void loadProjects();
        return;
      }
      await loadProjects();
      await openProjectAs({ ...connected, state: "available" });
    } catch (reason) {
      const refused = refusedText(reason);
      if (refused) report(refused);
      else fail(reason);
    }
  }

  /** Asks the User to allow the Project's folder again, straight from the click, then opens it. */
  function reconnectProject(target: ListedProject) {
    const asked = projects.reconnect(target);
    void (async () => {
      try {
        if (!(await asked)) return;
        await loadProjects();
        const now = { ...target, state: "available" as const };
        if (active?.id === target.id) await openProjectAs(now);
        else await switchTo(now);
      } catch (reason) {
        fail(reason);
      }
    })();
  }

  let removing = $state<{ project: ListedProject; running: boolean } | null>(null);

  async function confirmRemoval() {
    const asked = removing;
    if (!asked || asked.running) return;
    asked.running = true;
    const wasActive = asked.project.id === active?.id;
    try {
      if (wasActive && !(await leave())) return void (removing = null);
      await projects.remove(asked.project);
      removing = null;
      await loadProjects();
      if (wasActive) {
        // The first Project left that can open; else one that waits for its folder; else the welcome screen.
        await openProjectAs(allProjects.find((each) => each.state === "available") ?? allProjects[0] ?? null);
      }
    } catch (reason) {
      removing = null;
      report(t("removeProjectFailed"), reason);
    }
  }

  // The Project settings panel of the Active Project.
  let settingsOpen = $state(false);
  let repository = $state<{ name: string; state: "available" | "unavailable" } | null>(null);
  let repositoryFailure = $state<string | null>(null);

  async function loadRepository() {
    const asked = active;
    if (!asked) return;
    try {
      const kept = await projects.repository(asked);
      if (active === asked) repository = kept && { name: kept.name, state: kept.state };
    } catch (reason) {
      fail(reason);
    }
  }

  function openSettings() {
    repository = null;
    repositoryFailure = null;
    settingsOpen = true;
    void loadRepository();
  }

  /** The Host's folder prompt opens straight from the click. */
  function connectRepository() {
    const asked = active!;
    const prompt = projects.connectRepository(asked);
    void (async () => {
      try {
        const connected = await prompt;
        if (!connected) return;
        repositoryFailure = null;
        await loadRepository();
      } catch (reason) {
        repositoryFailure = reason instanceof FolderRefused && reason.reason === "notContaining" ? t("notContaining", { name: asked.name }) : t("repositoryFailed");
      }
    })();
  }

  async function disconnectRepository() {
    try {
      await projects.disconnectRepository(active!);
      repositoryFailure = null;
      await loadRepository();
    } catch {
      repositoryFailure = t("repositoryFailed");
    }
  }

  /** Keeps a change of the Active Project's own name or location, then shows the Project as kept. */
  async function changeProject(change: (project: ListedProject) => Promise<ProjectInfo>, failure: string) {
    const asked = active;
    if (!asked) return;
    try {
      const kept = await change(asked);
      if (active?.id === asked.id) active = { ...kept, state: asked.state };
      allProjects = allProjects.map((each) => (each.id === kept.id ? { ...kept, state: each.state } : each));
    } catch (reason) {
      report(failure, reason);
    }
  }

  /** An empty name shows the folder's name again. */
  const renameProject = (name: string) => changeProject((project) => projects.setDisplayName(project, name), t("projectNameFailed"));
  /** An empty location forgets it. */
  const locateProject = (location: string) => changeProject((project) => projects.setLocation(project, location), t("projectLocationFailed"));

  const reconnect = () => reconnectProject(active!);

  /** Agent edits: the Tree updates silently; the open Document reloads, or is a conflict while edited. */
  async function checkOutside() {
    if (!project || document.hidden) return;
    const checked = path;
    try {
      const changes = await project.check();
      if (changes.tree) tree = await loadTree();
      if (changes.tree || changes.documents.length > 0) void loadFavorites();
      if (changes.documents.includes(SETTINGS_FILE)) void loadSettings();
      if (changes.documents.includes(ANNOTATIONS_FILE) || (checked && changes.documents.includes(checked))) annotationsChanged++;
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
    reservedFolder: "refusedReservedFolder",
    invalidSettings: "refusedInvalidSettings",
  };
  /** The message of a refusal; `change` for a rename or a move, whose invalid-manifest wording is not about adding entries. */
  const refusalMessage = (reason: RefusalReason, change = false) =>
    t(reason === "invalidManifest" && change ? "refusedInvalidManifestChange" : REFUSALS[reason]);
  /** What a dialog shows for a failed request: a refusal's message, else the generic failure with the raw reason as detail. */
  const failureText = (reason: unknown, change: boolean) =>
    reason instanceof Refused ? refusalMessage(reason.reason, change) : `${t("failed")} ${t("detail", { reason: reason instanceof Error ? reason.message : String(reason) })}`;
  const refusal = $derived(creating ? refusalOf(creating.kind, creating.name, entriesOf(creating.folder).map((entry) => entry.name), creating.folder) : null);
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
      tree = await loadTree();
      creating = null;
      if (kind === "document") await openFresh(made);
    } catch (reason) {
      if (!creating) return;
      creating.failure = failureText(reason, false);
    }
  }

  // Renaming and moving: from the entry menu, and by drag and drop.
  type Movable = TreeFolder | TreeDocument;
  const isMovable = (entry: TreeEntry | null): entry is Movable => entry?.kind === "folder" || entry?.kind === "document";
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

  let menu = $state.raw<{ entry: Movable; x: number; y: number } | null>(null);
  let renaming = $state<{ entry: Movable; name: string; failure: string | null } | null>(null);
  let moving = $state<{ entry: Movable; destination: string | null; failure: string | null } | null>(null);
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
          folderOf(renaming.entry.path),
        )
      : null,
  );
  /** The Folders an entry can move to: not its own, and for a Folder not itself nor one of its descendants. */
  const moveOptions = $derived.by(() => {
    if (!moving) return [];
    const { entry } = moving;
    return ["", ...folderPaths(tree).filter((folder) => !isInsideReserved(folder))].filter(
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
      tree = await loadTree();
      void loadFavorites();
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

  function openMenu(entry: Movable, x: number, y: number) {
    menu = { entry, x: Math.max(0, Math.min(x, window.innerWidth - 200)), y: Math.max(0, Math.min(y, window.innerHeight - 160)) };
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

  async function dropped(target: Movable, position: DropPosition) {
    const sourcePath = dragSource;
    endDrag();
    const source = sourcePath ? findEntry(sourcePath) : null;
    if (!isMovable(source) || !project) return;
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

  /** Reports a failure: a refusal's message after `message`, else `message` with the raw reason as detail. */
  function reportFailure(message: string, reason: unknown) {
    if (reason instanceof Refused) report(`${message} ${refusalMessage(reason.reason, true)}`);
    else report(message, reason);
  }

  async function setHidden(entry: Movable) {
    menu = null;
    if (!project) return;
    try {
      await project.setHidden(entry.path, !entry.hidden);
      tree = await loadTree();
    } catch (reason) {
      reportFailure(t(entry.hidden ? "showFailed" : "hideFailed", { name: entry.name }), reason);
    }
  }

  /** Show hidden items: the Tree reloads with or without them; the panel of an other file goes when they are hidden. */
  async function toggleHidden() {
    await setDisplay({ showHidden: !display.showHidden });
    if (!display.showHidden) closeFile();
    try {
      if (project) tree = await loadTree();
    } catch (reason) {
      fail(reason);
    }
  }

  // Deleting a Document or a Folder, after a confirmation that says what goes with it.
  let deleting = $state<{ entry: { kind: "document" | "folder"; name: string; path: string }; counts: Deletion; running: boolean; failure: string | null } | null>(null);

  async function askDeletion(entry: { kind: "document" | "folder"; name: string; path: string }) {
    menu = null;
    if (!project) return;
    try {
      deleting = { entry, counts: await project.deletion(entry.path), running: false, failure: null };
    } catch (reason) {
      reportFailure(t("deleteFailed", { name: entry.name }), reason);
    }
  }

  /** What a deletion removes, as a sentence: only the kinds that are there. */
  const holds = (counts: Deletion) =>
    [
      counts.documents > 0 ? tn("countDocuments", counts.documents) : "",
      counts.images > 0 ? tn("countImages", counts.images) : "",
      counts.others > 0 ? tn("countOthers", counts.others) : "",
    ]
      .filter(Boolean)
      .join(", ");

  /** The Documents of the Tree, in the order it shows them. */
  function documentPaths(entries: TreeEntry[]): string[] {
    return entries.flatMap((entry) => (entry.kind === "document" ? [entry.path] : entry.kind === "folder" ? documentPaths(entry.children) : []));
  }

  async function confirmDeletion() {
    const asked = deleting;
    if (!asked || asked.running || !project) return;
    const { entry } = asked;
    asked.running = true;
    asked.failure = null;
    if (!(await beforeChange())) {
      deleting = null;
      return;
    }
    const gone = (each: string) => each === entry.path || each.startsWith(`${entry.path}/`);
    // The Document to open next, chosen in the Tree as it was: the one after, else the one before.
    const documents = documentPaths(tree);
    const at = path === null ? -1 : documents.indexOf(path);
    const next = at < 0 ? null : (documents.slice(at + 1).find((each) => !gone(each)) ?? documents.slice(0, at).reverse().find((each) => !gone(each)) ?? null);
    try {
      await project.remove(entry.path);
    } catch (reason) {
      asked.running = false;
      asked.failure = `${t("deleteFailed", { name: entry.name })} ${failureText(reason, true)}`;
      return;
    }
    deleting = null;
    try {
      tree = await loadTree();
      void loadFavorites();
      trail = trail.filter((each) => !gone(each.path));
      closed = new Set([...closed].filter((folder) => !gone(folder)));
      if (openFile && gone(openFile.path)) closeFile();
      if (path !== null && gone(path)) {
        if (next) await show(next);
        else {
          path = null;
          current = null;
        }
      } else if (path !== null) {
        // Links to what went are text now.
        current = await project.read(path);
      }
    } catch (reason) {
      fail(reason);
    }
  }

  // The panel of an other file, in place of the Document, which stays loaded behind it.
  let openFile = $state.raw<{ name: string; path: string; preview: FilePreview; url: string | null; bytes: Uint8Array | null } | null>(null);
  let fileRead = 0;

  function closeFile() {
    fileRead++;
    if (openFile?.url) URL.revokeObjectURL(openFile.url);
    openFile = null;
  }

  async function openOther(file: string) {
    if (!project) return;
    const reading = ++fileRead;
    const name = nameOf(file);
    if (!(await beforeChange()) || reading !== fileRead) return;
    try {
      const bytes = await project.readBytes(file);
      // A later click wins over this slower one.
      if (reading !== fileRead) return;
      const preview = previewOf(name, bytes);
      const url = preview.kind === "image" || preview.kind === "video" ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: preview.mime })) : null;
      closeFile();
      fileRead = reading;
      openFile = { name, path: file, preview, url, bytes: preview.kind === "binary" ? bytes : null };
    } catch (reason) {
      if (reading === fileRead) report(t("openFileFailed", { name }), reason);
    }
  }

  /** The file is handed to the browser through a link made here, never one in the markup (the View has no address). */
  function download() {
    if (!openFile?.bytes) return;
    const url = URL.createObjectURL(new Blob([openFile.bytes as BlobPart]));
    const link = document.createElement("a");
    link.download = openFile.name;
    link.href = url;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    closeFile();
    stopParams?.();
    document.removeEventListener("visibilitychange", onVisibility);
  });
</script>

{#snippet filePanel(file: NonNullable<typeof openFile>)}
  <section class="file" aria-labelledby="file-title">
    <h2 id="file-title">{file.name}</h2>
    {#if file.preview.kind === "image"}
      <img src={file.url} alt={file.name} />
    {:else if file.preview.kind === "video"}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video src={file.url} controls></video>
    {:else if file.preview.kind === "text"}
      {#if file.preview.truncated}<p class="muted">{t("truncated")}</p>{/if}
      <pre>{file.preview.text}</pre>
    {:else}
      <p>{t("cannotShowFile")}</p>
      <button type="button" class="primary" onclick={download}>{t("download")}</button>
    {/if}
  </section>
{/snippet}

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

{#snippet switcher(withSettings: boolean)}
  <ProjectSwitcher
    active={active!}
    projects={allProjects}
    settings={withSettings}
    onshow={() => void loadProjects()}
    onswitch={(next) => void switchTo(next)}
    onreconnect={reconnectProject}
    onremove={(target) => (removing = { project: target, running: false })}
    onconnect={() => void connectFolder()}
    onsettings={openSettings}
  />
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
    <h1>{t("unavailable", { name: projectLabel(active) })}</h1>
    <p>{t("unavailableText")}</p>
    <button class="primary" onclick={reconnect}>{t("reconnect")}</button>
    <div class="other-projects">
      {@render switcher(false)}
    </div>
  </main>
{:else}
  <div class="layout" style:--sidebar-width="{sidebarWidth}px">
    <nav aria-label={t("documents")} bind:this={treeNav}>
      <div class="nav-head">
        {@render switcher(true)}
        <div class="ld-form search"><input type="search" aria-label={t("searchDocuments")} placeholder={t("searchDocuments")} bind:value={query} oninput={() => liveSearch.search(query)} /></div>
        <div class="nav-tools">
        <Favorites
          entries={favorites}
          onshow={() => void loadFavorites()}
          onopen={(target) => void openFresh(target)}
          onremove={(target) => void saveFavorites(favorites.filter((each) => each.path !== target))}
          onmove={moveFavorite}
        />
        <div class="creators">
          <button type="button" class="icon" aria-label={t("newDocument")} title={t("newDocument")} onclick={() => startCreating("document")}>
            {@render entryIcon("document")}
          </button>
          <button type="button" class="icon" aria-label={t("newFolder")} title={t("newFolder")} onclick={() => startCreating("folder")}>
            {@render entryIcon("folder")}
          </button>
          <button type="button" class="icon" aria-label={t("showHidden")} title={t("showHidden")} aria-pressed={display.showHidden} onclick={() => void toggleHidden()}>
            {@render entryIcon(display.showHidden ? "eye" : "eyeOff")}
          </button>
        </div>
        </div>
      </div>
      <p class="count muted" aria-live="polite">{tn("countDocuments", documentsIn(shownTree).length)}</p>
      {#if searchResults && shownTree.length === 0}
        <p class="muted">{t("noDocumentsFound")}</p>
      {:else if tree.length === 0}
        <p class="muted">{t("emptyProject")}</p>
      {:else}
        <Tree entries={shownTree} current={path} open={(target) => void openFresh(target)} onfile={(target) => void openOther(target)} {drag} label={treeLabel} searching={searchResults !== null} {excerpts} />
      {/if}
    </nav>
    <ResizeHandle
      label={t("resizeSidebar")}
      width={sidebarWidth}
      bounds={SIDEBAR_WIDTH}
      widens="right"
      left="calc(var(--sidebar-width) - 3px)"
      onmove={(moved) => (draggedWidth = moved)}
      onkept={(kept) => {
        void keepSidebar(kept);
        draggedWidth = null;
      }}
    />
    <main style:--header-height="{headerHeight}px">
      {#if openFile}
        {@render filePanel(openFile)}
      {:else if path === null}
        <p class="muted choose">{t("chooseDocument")}</p>
      {:else if current && model}
        {#if htmlOpen && !editing && !readOnly}
          <HtmlView
            {model}
            path={path!}
            softBreaks={settings.softBreaks}
            readBytes={(imagePath) => project!.readBytes(imagePath)}
            onback={() => (htmlOpen = false)}
            onchoose={openChooser}
            onfollow={(doc, anchor) => {
              htmlOpen = false;
              void follow(doc, anchor);
            }}
            onfile={(file) => report(t("fileUnavailable", { path: file }))}
            onfail={report}
          />
        {:else}
        <!-- The header stays on top while the Document scrolls, while reading and while editing. -->
        <div class="sticky" bind:offsetHeight={headerHeight}>
        <Header
          {editing}
          {saving}
          {readOnly}
          lines={display.lines}
          whiteBackground={display.whiteBackground}
          tocOpen={display.toc.open}
          {marker}
          onmarker={cycleMarker}
          favorite={starred}
          treeLabels={display.treeLabels}
          {labelFilter}
          softBreaks={settings.softBreaks}
          htmlAction={templateOf ? "view" : "generate"}
          onhtml={() => (templateOf ? (htmlOpen = true) : openChooser())}
          onhtmlchange={openChooser}
          onsoftbreaks={(on) => void changeSoftBreaks(on)}
          onlabels={(treeLabels) => void setDisplay({ treeLabels })}
          onfilter={setLabelFilter}
          oncopypath={() => void copyPath()}
          onlines={() => void setDisplay({ lines: !display.lines })}
          onwhite={() => void setDisplay({ whiteBackground: !display.whiteBackground })}
          ontoc={() => void setDisplay({ toc: { open: !display.toc.open } })}
          onfavorite={toggleFavorite}
          onedit={startEditing}
          ondelete={() => void askDeletion({ kind: "document", name: nameOf(path!), path: path! })}
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
            <div class="page">
            {#if !readOnly}
              <DocumentMeta
                created={model.created}
                modified={modifiedAt}
                type={model.type}
                description={model.description}
                tags={model.tags}
                invalid={model.frontmatter.valid ? null : { line: model.frontmatter.line }}
                suggest={() => project!.types()}
                onsave={saveType}
              />
            {/if}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
            <article class="document" class:ld-show-source-lines={display.lines} bind:this={article} onclick={activate} onkeydown={activateKey}>
              {#if !hasHeading}<h1>{model.title}</h1>{/if}
              {@html html}
            </article>
            </div>
            {#if display.toc.open && headings.length > 0}
              <Toc
                {headings}
                width={tocWidth}
                onselect={goToHeading}
                onresized={(width) => void keepToc(width)}
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
          {#if !readOnly}
            <Annotations
              {article}
              {html}
              path={path!}
              {marker}
              {headerHeight}
              changeCount={annotationsChanged}
              read={() => readAnnotations(project!, path!)}
              add={(draft) => addAnnotation(project!, path!, draft)}
              fail={report}
            />
          {/if}
        {/if}
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
{#snippet entryIcon(kind: "document" | "folder" | "rename" | "move" | "delete" | "eye" | "eyeOff")}
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    {#if kind === "delete"}
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" />
    {:else if kind === "eye"}
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />
    {:else if kind === "eyeOff"}
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" />
    {:else if kind === "rename"}
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
            {#each folderPaths(tree).filter((each) => !isInsideReserved(each)) as folder (folder)}
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

{#if deleting}
  {@const { entry, counts } = deleting}
  <dialog use:modal aria-labelledby="delete-title" class="create" oncancel={(event) => { event.preventDefault(); if (!deleting?.running) deleting = null; }}>
    <form onsubmit={(event) => { event.preventDefault(); void confirmDeletion(); }}>
      <header>
        <span class="badge-icon danger">{@render entryIcon("delete")}</span>
        <h2 id="delete-title">{entry.kind === "document" ? t("deleteDocument") : t("deleteFolder")}</h2>
      </header>
      <p>{entry.kind === "document" ? t("deleteDocumentText", { name: entry.name }) : t("deleteFolderText", { name: entry.name })}</p>
      {#if entry.kind === "folder"}
        <p>{holds(counts) ? t("folderHolds", { list: holds(counts) }) : t("folderEmpty")}</p>
      {/if}
      {#if counts.linking > 0}
        <p>{tn(entry.kind === "document" ? "linkingDocument" : "linkingFolder", counts.linking)}</p>
      {/if}
      <p>{t("cannotUndo")}</p>
      {#if deleting.failure}<p class="problem" role="alert">{deleting.failure}</p>{/if}
      <div class="actions">
        <button type="button" disabled={deleting.running} onclick={() => (deleting = null)}>{t("cancel")}</button>
        <button type="submit" class="danger" disabled={deleting.running}>{deleting.running ? t("deleting") : t("delete")}</button>
      </div>
    </form>
  </dialog>
{/if}

{#if removing}
  {@const { project: leaving } = removing}
  <dialog use:modal aria-labelledby="remove-project-title" class="create" oncancel={(event) => { event.preventDefault(); if (!removing?.running) removing = null; }}>
    <form onsubmit={(event) => { event.preventDefault(); void confirmRemoval(); }}>
      <header>
        <span class="badge-icon danger">{@render entryIcon("delete")}</span>
        <h2 id="remove-project-title">{t("removeProjectTitle", { name: projectLabel(leaving) })}</h2>
      </header>
      <p>{t("removeProjectText")}</p>
      <div class="actions">
        <button type="button" disabled={removing.running} onclick={() => (removing = null)}>{t("cancel")}</button>
        <button type="submit" class="danger" disabled={removing.running}>{removing.running ? t("removing") : t("remove")}</button>
      </div>
    </form>
  </dialog>
{/if}

{#if settingsOpen && active}
  <ProjectSettingsPanel
    folderName={active.name}
    displayName={active.displayName ?? ""}
    onname={(name) => void renameProject(name)}
    location={active.location ?? ""}
    onlocation={(location) => void locateProject(location)}
    {repository}
    failure={repositoryFailure}
    softBreaks={settings.softBreaks}
    onconnectrepository={connectRepository}
    ondisconnectrepository={() => void disconnectRepository()}
    onsoftbreaks={(on) => void changeSoftBreaks(on)}
    onclose={() => (settingsOpen = false)}
  />
{/if}

{#if menu}
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="menu" role="menu" aria-label={menu.entry.name} style:left="{menu.x}px" style:top="{menu.y}px" use:focusFirst onkeydown={menuKey}>
    <button type="button" role="menuitem" onclick={() => void setHidden(menu!.entry)}>{menu.entry.hidden ? t("show") : t("hide")}</button>
    {#if !(menu.entry.kind === "folder" && isReservedFolder(menu.entry.path))}
      <button type="button" role="menuitem" onclick={() => startRenaming(menu!.entry)}>{t("rename")}</button>
      <button type="button" role="menuitem" onclick={() => startMoving(menu!.entry)}>{t("moveTo")}</button>
      <button type="button" role="menuitem" onclick={() => void askDeletion(menu!.entry)}>{t("delete")}</button>
    {/if}
  </div>
{/if}

<svelte:window
  onkeydown={(event) => { if (event.key === "Escape" && menu) menu = null; }}
  onpointerdown={(event) => { if (menu && !(event.target as Element).closest("[role=menu]")) menu = null; }}
/>

{#if choosing && model}
  <HtmlTemplateDialog
    current={templateOf?.id ?? null}
    unknown={model.htmlTemplate !== null && !templateOf ? model.htmlTemplate : null}
    saving={choosing.saving}
    failure={choosing.failure}
    onchoose={(id) => void chooseTemplate(id)}
    onclose={() => (choosing = null)}
  />
{/if}

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
    grid-template-columns: var(--sidebar-width) 1fr;
    height: 100%;
    position: relative;
  }
  nav {
    border-right: 1px solid var(--line);
    padding: 1rem;
    overflow: auto;
  }
  .other-projects {
    margin-top: 1.5rem;
    display: flex;
    justify-content: center;
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
  .reading .page {
    flex: 1;
    min-width: 0;
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
  /* The Project's name on its own line, the sidebar's tools below it. */
  .nav-head {
    display: grid;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
  }
  .search input {
    width: 100%;
    box-sizing: border-box;
  }
  .count {
    margin: 0 0 0.35rem;
    font-size: 0.75rem;
  }
  .nav-tools {
    display: flex;
    align-items: center;
    gap: 0.5rem;
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
  .choose {
    margin-top: 2rem;
  }
  .file {
    padding-top: 1rem;
  }
  .file h2 {
    margin-top: 0;
    overflow-wrap: anywhere;
  }
  .file img,
  .file video {
    max-width: 100%;
    max-height: 80vh;
  }
  .file pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .badge-icon.danger {
    color: #e53935;
    background: color-mix(in srgb, #e53935 14%, transparent);
  }
  button.danger {
    background: #e53935;
    border-color: #e53935;
    color: #fff;
  }
  button.danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  button[aria-pressed="true"].icon {
    color: var(--accent);
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
