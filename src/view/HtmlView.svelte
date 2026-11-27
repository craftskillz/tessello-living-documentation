<script lang="ts">
  // The HTML view of the open Document: the page of its template in the shadow root of an element, so the template's
  // stylesheet stays out of the View (and the View's out of the page). A View state, never an address (the View is an
  // about:srcdoc page): links carry data attributes and are handled here. Download HTML makes one standalone file.
  import type { Snippet } from "svelte";
  import type { DocumentModel } from "../lib/document.ts";
  import type { TextEdit, TextRange } from "../lib/edits.ts";
  import { blockEdit, blockLines, blockToMarkdown, sameIgnoringWhitespace } from "../lib/htmlEdits.ts";
  import { htmlSectionAt } from "../lib/sections.ts";
  import type { DocumentText } from "../lib/project.ts";
    import { htmlPage, standaloneHtml } from "../lib/htmlPage.ts";
  import { headingId } from "../lib/links.ts";
  import { htmlTemplateOf } from "../lib/htmlTemplates.ts";
  import { loadImages, mimeOf } from "../lib/images.ts";
  import { t } from "../lib/i18n.ts";
  import { editableBlockAt, hasSelectedText, rangeOf, selectionOf, startInlineEdit, startSourceEdit, type CommitResult } from "./htmlEditing.ts";
  import { drawDiagrams } from "./mermaid.ts";

  let {
    model,
    current,
    path,
    softBreaks,
    paused,
    readBytes,
    onback,
    onchoose,
    onfollow,
    onfile,
    onfail,
    onedit,
    onsection,
    trailBar,
  }: {
    model: DocumentModel;
    /** The Document's text and version `model` comes from: what an edit in the page is applied to and checked against. */
    current: DocumentText;
    path: string;
    softBreaks: boolean;
    /** The page is not drawn again while true (the section editor is open over it). */
    paused: boolean;
    readBytes: (path: string) => Promise<Uint8Array>;
    /** Back to the reading view of the Document. */
    onback: () => void;
    /** Opens the template dialog. */
    onchoose: () => void;
    /** A link to another Document (leaves the HTML view). */
    onfollow: (doc: string, anchor: string | null) => void;
    /** A link to another file. */
    onfile: (file: string) => void;
    onfail: (message: string, reason?: unknown) => void;
    /** Writes `edit` over `base` (the text the page was drawn from). A conflict or a failure leaves the file alone. */
    onedit: (base: DocumentText, edit: TextEdit) => Promise<"saved" | "conflict" | "failed">;
    /** Right-click, or a block that cannot be edited in place: the section editor on this range. */
    onsection: (range: TextRange) => void;
    /** The back trail, shown under the bar. */
    trailBar?: Snippet;
  } = $props();

  const template = $derived(htmlTemplateOf(model.htmlTemplate));
  const labels = $derived({ footnotes: t("footnotes"), footnoteBack: t("footnoteBack"), compareSource: t("compareSource"), compareRender: t("compareRender") });
  const page = $derived(template ? htmlPage(model, path, template, labels, { softBreaks }) : null);
  let host = $state<HTMLElement>();
  let inner: HTMLElement | null = null;

  // What the page is drawn from. It is not drawn again while an edit is open or the section editor is: the change
  // waits for the edit to close.
  let shown = $state.raw<{ page: typeof page; base: DocumentText } | null>(null);
  let editOpen = $state(false);
  let status = $state<string | null>(null);
  let drawnPage: typeof page | undefined;
  let drawnBase: DocumentText | undefined;
  $effect.pre(() => {
    const next = page;
    const base = current;
    if (editOpen || paused || (next === drawnPage && base === drawnBase)) return;
    drawnPage = next;
    drawnBase = base;
    shown = { page: next, base };
  });

  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  // The page is drawn into the shadow root after each change of the Document or the settings; its images and diagrams after it.
  $effect(() => {
    const drawn = shown;
    if (!host || !drawn?.page) return;
    const { page: drawing, base } = drawn;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    // The scroll container is the View's main: drawing again keeps where the User was reading.
    const scroller = host.closest("main");
    const scrolled = root.querySelector(".ld-html-page") ? scroller?.scrollTop : undefined;
    // A caret in the old page would be moved, and scrolled to, when its text goes.
    (root.activeElement as HTMLElement | null)?.blur();
    selectionOf(root)?.removeAllRanges();
    root.innerHTML = `<style>${drawing.css}</style><style>.ld-html-page [id] { scroll-margin-top: 4rem; }</style><div class="ld-html-page"${drawing.language ? ` lang="${escape(drawing.language).replace(/"/g, "&quot;")}"` : ""}>${drawing.html}</div>`;
    if (scroller && scrolled !== undefined) scroller.scrollTop = scrolled;
    const element = root.querySelector<HTMLElement>(".ld-html-page")!;
    inner = element;
    const stopImages = loadImages(element, readBytes, (imagePath) => t("imageNotFound", { path: imagePath }));
    const stopDiagrams = drawDiagrams(element, { dark: false, failed: (reason) => t("diagramFailed", { reason }) });
    const click = (event: Event) => {
      if (!editOpen) activate(event, element);
    };
    const key = (event: KeyboardEvent) => {
      if (!editOpen && event.key === "Enter" && (event.target as Element).matches("[role=link]")) activate(event, element);
    };
    // A right click on selected text keeps the browser's menu: the selection is read before the click changes it.
    let selectedBeforeClick: boolean | null = null;
    const mousedown = (event: MouseEvent) => {
      if (event.button === 2 || event.ctrlKey) selectedBeforeClick = hasSelectedText(root);
    };
    const contextmenu = (event: MouseEvent) => {
      const selected = selectedBeforeClick ?? hasSelectedText(root);
      selectedBeforeClick = null;
      if (selected || editOpen) return;
      const target = event.target as Element;
      const from = target.closest(".ld-lead, section.ld-section") ? rangeOf(target.closest("[data-src]"))?.from : undefined;
      const section = from === undefined ? null : htmlSectionAt(base.text, from);
      if (!section) return;
      event.preventDefault();
      onsection(section);
    };
    const dblclick = (event: MouseEvent) => {
      if (!editOpen) edit(event.target, base, root);
    };
    element.addEventListener("click", click);
    element.addEventListener("keydown", key);
    element.addEventListener("mousedown", mousedown, true);
    element.addEventListener("contextmenu", contextmenu);
    element.addEventListener("dblclick", dblclick);
    return () => {
      element.removeEventListener("click", click);
      element.removeEventListener("keydown", key);
      element.removeEventListener("mousedown", mousedown, true);
      element.removeEventListener("contextmenu", contextmenu);
      element.removeEventListener("dblclick", dblclick);
      stopImages();
      stopDiagrams();
      inner = null;
    };
  });

  const closed = () => {
    editOpen = false;
    status = null;
  };

  /** Writes `markdown` over the lines of the block; what the edit does next depends on the answer. */
  async function commit(base: DocumentText, range: TextRange, markdown: string): Promise<CommitResult> {
    const change = blockEdit(base.text, range, markdown);
    if (!change) return "unchanged";
    const result = await onedit(base, change);
    status = result === "conflict" ? t("htmlConflict") : null;
    return result === "saved" ? "saved" : "stay";
  }

  /** The double click: a paragraph or heading in place, the other blocks as Markdown in a field. */
  function edit(target: EventTarget | null, base: DocumentText, root: ShadowRoot) {
    const found = editableBlockAt(target);
    if (!found) return;
    const { block, range, mode } = found;
    const lines = blockLines(base.text, range);
    const handlers = { onCommit: (markdown: string) => commit(base, range, markdown), onClose: closed };
    if (mode === "source") {
      editOpen = true;
      startSourceEdit(block, base.text.slice(lines.from, lines.to), t("htmlSourceLabel"), handlers);
      return;
    }
    const read = () => blockToMarkdown(block, { softBreaks });
    const markdown = read();
    if (markdown === null || !sameIgnoringWhitespace(markdown, base.text.slice(lines.from, lines.to))) {
      // What the page shows is not what the source says (an escape, an entity): only the section editor is safe.
      const section = htmlSectionAt(base.text, range.from);
      if (section) onsection(section);
      return;
    }
    editOpen = true;
    startInlineEdit(block, { ...handlers, read, softBreaks, onUnconvertible: () => (status = t("htmlUnconvertible")) });
  }

  function activate(event: Event, element: HTMLElement) {
    const link = (event.target as Element).closest<HTMLElement>("[data-doc], [data-file], [data-anchor]");
    if (!link) return;
    const { doc, file, anchor } = link.dataset;
    if (doc) onfollow(doc, anchor ?? null);
    else if (file) onfile(file);
    else scrollToAnchor(anchor);
  }

  /** Scrolls to the section (or element) of the page with this anchor, or to the top; the id of a heading maps to its section. */
  export function scrollToAnchor(anchor: string | null) {
    if (!inner) return;
    const target = anchor ? (inner.querySelector(`#${CSS.escape(anchor)}`) ?? sectionOfHeading(inner, anchor)) : null;
    if (target) target.scrollIntoView();
    else host?.closest("main")?.scrollTo(0, 0);
  }

  function sectionOfHeading(element: HTMLElement, anchor: string): Element | null {
    for (const heading of element.querySelectorAll("section.ld-section > h2")) if (headingId(heading.textContent ?? "") === anchor) return heading.parentElement;
    return null;
  }

  function dataUrl(bytes: Uint8Array, mime: string): string {
    let binary = "";
    for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    return `data:${mime};base64,${btoa(binary)}`;
  }

  /** One file, handed to the browser through a link made here, never one in the markup (the View has no address). */
  async function download() {
    if (!template || !page || !inner) return;
    try {
      const images: Record<string, string> = {};
      await Promise.all(
        page.images.map(async (imagePath) => {
          // An image that cannot be read stays out: the page shows its missing-image text.
          try {
            images[imagePath] = dataUrl(await readBytes(imagePath), mimeOf(imagePath));
          } catch {}
        }),
      );
      const diagrams: string[] = [];
      inner.querySelectorAll("[data-mermaid]").forEach((each, index) => {
        const drawn = each.querySelector("svg");
        if (drawn) diagrams[index] = drawn.outerHTML;
      });
      const text = standaloneHtml(htmlPage(model, path, template, labels, { softBreaks, standalone: { images, diagrams } }));
      const url = URL.createObjectURL(new Blob([text], { type: "text/html" }));
      const link = document.createElement("a");
      link.download = `${path.split("/").pop()!.replace(/\.md$/i, "")}.html`;
      link.href = url;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      onfail(t("htmlDownloadFailed"), reason);
    }
  }
</script>

<div class="bar">
  <button type="button" onclick={onback}>{t("htmlBack")}</button>
  <strong class="title">{page?.title ?? model.title}</strong>
  {#if page}<span class="status" class:muted={!status} role="status">{status ?? t("htmlHint")}</span>{/if}
  <button type="button" onclick={onchoose}>{t("htmlChange")}</button>
  <button type="button" class="primary" disabled={!page} onclick={() => void download()}>{t("htmlDownload")}</button>
</div>
{@render trailBar?.()}
{#if page}
  <div class="page" role="region" aria-label={t("htmlRegion")} bind:this={host}></div>
{:else}
  <div class="missing" role="region" aria-label={t("htmlRegion")}>
    <p>{model.htmlTemplate ? t("htmlUnknownTemplate", { name: model.htmlTemplate }) : t("htmlNoTemplate")}</p>
    <button type="button" class="primary" onclick={onchoose}>{t("htmlChoose")}</button>
  </div>
{/if}

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 0 0.5rem;
    background: var(--bg);
  }
  .title {
    flex: 1;
    min-width: 8rem;
    overflow-wrap: anywhere;
  }
  .status {
    flex-basis: 100%;
    order: 9;
    font-size: 0.85rem;
  }
  .status:not(.muted) {
    color: light-dark(#c0392b, #f87171);
  }
  .page {
    display: block;
  }
  .missing {
    padding: 1rem 0;
    overflow-wrap: anywhere;
  }
</style>
