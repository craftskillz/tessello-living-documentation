<script lang="ts">
  // The HTML view of the open Document: the page of its template in the shadow root of an element, so the template's
  // stylesheet stays out of the View (and the View's out of the page). A View state, never an address (the View is an
  // about:srcdoc page): links carry data attributes and are handled here. Download HTML makes one standalone file.
  import type { DocumentModel } from "../lib/document.ts";
  import { htmlPage, standaloneHtml } from "../lib/htmlPage.ts";
  import { htmlTemplateOf } from "../lib/htmlTemplates.ts";
  import { loadImages, mimeOf } from "../lib/images.ts";
  import { t } from "../lib/i18n.ts";
  import { drawDiagrams } from "./mermaid.ts";

  let {
    model,
    path,
    softBreaks,
    readBytes,
    onback,
    onchoose,
    onfollow,
    onfile,
    onfail,
  }: {
    model: DocumentModel;
    path: string;
    softBreaks: boolean;
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
  } = $props();

  const template = $derived(htmlTemplateOf(model.htmlTemplate));
  const labels = $derived({ footnotes: t("footnotes"), footnoteBack: t("footnoteBack"), compareSource: t("compareSource"), compareRender: t("compareRender") });
  const page = $derived(template ? htmlPage(model, path, template, labels, { softBreaks }) : null);
  let host = $state<HTMLElement>();
  let inner: HTMLElement | null = null;

  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  // The page is drawn into the shadow root after each change of the Document or the settings; its images and diagrams after it.
  $effect(() => {
    if (!host || !page) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${page.css}</style><style>.ld-html-page [id] { scroll-margin-top: 4rem; }</style><div class="ld-html-page"${page.language ? ` lang="${escape(page.language).replace(/"/g, "&quot;")}"` : ""}>${page.html}</div>`;
    const element = root.querySelector<HTMLElement>(".ld-html-page")!;
    inner = element;
    const stopImages = loadImages(element, readBytes, (imagePath) => t("imageNotFound", { path: imagePath }));
    const stopDiagrams = drawDiagrams(element, { dark: false, failed: (reason) => t("diagramFailed", { reason }) });
    const click = (event: Event) => activate(event, element);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.target as Element).matches("[role=link]")) activate(event, element);
    };
    element.addEventListener("click", click);
    element.addEventListener("keydown", key);
    return () => {
      element.removeEventListener("click", click);
      element.removeEventListener("keydown", key);
      stopImages();
      stopDiagrams();
      inner = null;
    };
  });

  function activate(event: Event, element: HTMLElement) {
    const link = (event.target as Element).closest<HTMLElement>("[data-doc], [data-file], [data-anchor]");
    if (!link) return;
    const { doc, file, anchor } = link.dataset;
    if (doc) onfollow(doc, anchor ?? null);
    else if (file) onfile(file);
    else element.querySelector(`#${CSS.escape(anchor!)}`)?.scrollIntoView();
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
  <button type="button" onclick={onchoose}>{t("htmlChange")}</button>
  <button type="button" class="primary" disabled={!page} onclick={() => void download()}>{t("htmlDownload")}</button>
</div>
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
  .page {
    display: block;
  }
  .missing {
    padding: 1rem 0;
    overflow-wrap: anywhere;
  }
</style>
