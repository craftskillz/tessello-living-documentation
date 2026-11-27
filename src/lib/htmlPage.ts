// A Document as the page of an HTML template (docs/spec/html-generation.md, rules R6-R8): the title taken out of the
// content, a lead, one section per top-level `##` and a table of contents. Built on the hast tree of the reading
// view's renderer (render.ts), so directives, footnotes and Tag markers come out as they do there. Two modes: the
// View's (no `href` to an address, the View handles clicks) and the standalone file's (anchors, images and diagrams
// embedded, no script).

import type { Element, ElementContent, Root, RootContent } from "hast";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import type { DocumentModel } from "./document.ts";
import type { HtmlTemplate } from "./htmlTemplates.ts";
import { SHARED_CSS } from "./htmlTemplates/shared.ts";
import { headingId } from "./links.ts";
import { renderDocumentTree, type RenderLabels } from "./render.ts";

export interface HtmlPage {
  /** Plain text: the Document's leading top-level heading (Tag markers left out), else model.title. */
  title: string;
  /** model.language, null when it has none. */
  language: string | null;
  /** The template's stylesheet followed by the shared page styles (callouts, image and code sizes, columns, compare, Kanban preview, missing image, Tag markers). */
  css: string;
  /** The page's markup, to be placed inside an element of class `ld-html-page` (the View puts it in a shadow root; the standalone file in <body class="ld-html-page">). */
  html: string;
  /** The Project image paths the page shows (the `data-image` values, each once, in order): the View reads their bytes for the standalone file. */
  images: string[];
}

export interface StandaloneAssets {
  /** Data URLs by Project image path. */
  images: Record<string, string>;
  /** SVG markup of the Mermaid diagrams, in document order. */
  diagrams: string[];
}

const stringify = (tree: Root): string => unified().use(rehypeStringify, { allowDangerousHtml: true }).stringify(tree);

const HEADER_CLASS = { "interview-sheet": ["sheet-header", "sheet-nav"], article: ["article-header", "article-nav"] } as const;

export function htmlPage(
  model: DocumentModel,
  path: string,
  template: HtmlTemplate,
  labels: Partial<RenderLabels>,
  options: { softBreaks: boolean; standalone?: StandaloneAssets },
): HtmlPage {
  const nodes = renderDocumentTree(model, path, labels, { softBreaks: options.softBreaks, sourceTargets: !options.standalone }).children.filter((node) => !isBlank(node));
  const first = nodes[0];
  const leading = first?.type === "element" && first.tagName === "h1" ? first : null;
  const title = (leading && textOf(leading).trim()) || model.title;
  const content = leading ? nodes.slice(1) : nodes;

  const firstSection = content.findIndex(isH2);
  const lead = firstSection < 0 ? content : content.slice(0, firstSection);
  const sections: { anchor: string; text: string; node: Element }[] = [];
  const used = new Map<string, number>();
  const rest = firstSection < 0 ? [] : content.slice(firstSection);
  for (const node of rest) {
    if (isH2(node)) {
      const text = textOf(node).trim();
      const anchor = uniqueAnchor(text, used);
      delete node.properties.id;
      sections.push({ anchor, text, node: element("section", { className: ["ld-section"], id: anchor }, [node]) });
    } else sections.at(-1)!.node.children.push(node as ElementContent);
  }

  const images = [...new Set(findAll(content, (node) => node.properties.dataImage !== undefined).map((node) => String(node.properties.dataImage)))];
  const headingAnchors = new Map(sections.map((section) => [headingId(section.text), section.anchor]));
  const standalone = options.standalone;
  const body = retarget([...(lead.length ? [element("div", { className: ["ld-lead"] }, lead as ElementContent[])] : []), ...sections.map((each) => each.node)], headingAnchors, standalone);

  const [headerClass, navClass] = HEADER_CLASS[template.id];
  const toc = sections.map((section) =>
    element("li", {}, [
      element("a", standalone ? { href: `#${section.anchor}` } : { role: "link", tabIndex: 0, dataAnchor: section.anchor }, [{ type: "text", value: section.text }]),
    ]),
  );
  const page: Root = {
    type: "root",
    children: [
      element("header", { className: [headerClass] }, [element("h1", {}, [{ type: "text", value: title }])]),
      element("div", { className: ["layout"] }, [
        element("nav", { className: [navClass], ariaLabel: title }, toc.length ? [element("ol", {}, toc)] : []),
        element("main", {}, body as ElementContent[]),
      ]),
    ],
  };
  return { title, language: model.language, css: `${template.css}\n${SHARED_CSS}`, html: stringify(page), images };
}

/** One standalone file: no script, no external stylesheet. */
export function standaloneHtml(page: HtmlPage): string {
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const lang = page.language === null ? "" : ` lang="${escape(page.language)}"`;
  return [
    "<!DOCTYPE html>",
    `<html${lang}>`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escape(page.title)}</title>`,
    `<style>\n${page.css.replace(/<\/style/gi, "<\\/style")}\n</style>`,
    "</head>",
    '<body class="ld-html-page">',
    page.html,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

// ---- the tree ----

const isBlank = (node: RootContent): boolean => node.type === "text" && node.value.trim() === "";
const isH2 = (node: RootContent): node is Element => node.type === "element" && node.tagName === "h2";

function element(tagName: string, properties: Element["properties"], children: ElementContent[]): Element {
  return { type: "element", tagName, properties, children };
}

/** The text of a node, the Tag marker pills left out. */
const textOf = (node: RootContent): string =>
  node.type === "text" ? node.value : node.type === "element" && node.tagName !== "mark" ? node.children.map(textOf).join("") : "";

function uniqueAnchor(text: string, used: Map<string, number>): string {
  const slug =
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
  const count = (used.get(slug) ?? 0) + 1;
  used.set(slug, count);
  return count === 1 ? slug : `${slug}-${count}`;
}

function findAll(nodes: RootContent[], match: (element: Element) => boolean): Element[] {
  return nodes.flatMap((node) => (node.type === "element" ? [...(match(node) ? [node] : []), ...findAll(node.children, match)] : []));
}

/**
 * Links to a `##` heading go to its section (the heading's own id is dropped). In standalone mode: anchors become
 * `href="#…"`, links to other Documents and files become their text, images are embedded and diagrams drawn, and the
 * source ranges are dropped.
 */
function retarget(body: RootContent[], headings: Map<string, string>, standalone: StandaloneAssets | undefined): RootContent[] {
  let diagram = 0;
  const walk = (nodes: RootContent[]): RootContent[] =>
    nodes.flatMap((node): RootContent[] => {
      if (node.type !== "element") return [node];
      const props = node.properties;
      if (typeof props.dataAnchor === "string") props.dataAnchor = headings.get(props.dataAnchor) ?? headings.get(headingId(props.dataAnchor)) ?? props.dataAnchor;
      if (!standalone) {
        node.children = walk(node.children) as ElementContent[];
        return [node];
      }
      delete props.dataSrc;
      delete props.dataMd;
      if (node.tagName === "img" && props.dataImage !== undefined) {
        const { dataImage, ...rest } = props;
        const data = standalone.images[String(dataImage)];
        if (data !== undefined) {
          node.properties = { ...rest, src: data };
          return [node];
        }
        const alt = String(props.alt ?? "");
        return [element("span", { className: ["image-missing"], role: "img", ariaLabel: alt }, [{ type: "text", value: alt }])];
      }
      if (node.tagName === "div" && props.dataMermaid !== undefined) {
        const { dataMermaid, ...rest } = props;
        const drawn = standalone.diagrams[diagram++];
        if (drawn === undefined) return [element("pre", {}, [element("code", {}, node.children)])];
        node.properties = rest;
        node.children = [{ type: "raw", value: drawn } as never];
        return [node];
      }
      node.children = walk(node.children) as ElementContent[];
      if (node.tagName === "a" && (props.dataDoc !== undefined || props.dataFile !== undefined)) return [element("span", {}, node.children)];
      if (node.tagName === "a" && props.dataAnchor !== undefined) {
        // The other attributes stay: a footnote reference keeps the id its back-link points to.
        const { dataAnchor, role, tabIndex, ...rest } = props;
        node.properties = { href: `#${String(dataAnchor)}`, ...rest };
      }
      return [node];
    });
  return walk(body);
}
