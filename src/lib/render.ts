// A Document as HTML (docs/design.md §5): CommonMark and GitHub tables, task lists and strikethrough. Raw HTML in the
// Document is left out. Blocks carry their source range, headings their id, and links and images never carry an
// address the View could navigate to: the View is an about:srcdoc page (see links.ts). Directives and Tag markers
// come later.

import type { Element, ElementContent, Root } from "hast";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import type { DocumentModel } from "./document.ts";
import { headingId, resolveImage, resolveLink } from "./links.ts";

const BLOCKS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "pre", "table", "hr"]);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/** The unified pipeline; `rehypeDocument` reads the path and offset of the Document being rendered from `data`. */
const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeDocument).use(rehypeStringify);

/**
 * The HTML of `model`'s body, for the Document at `path`. Every block has `data-src="<from>-<to>"`, UTF-16 offsets
 * into the Document's full text. Internal links have no `href`; only external links do.
 */
export function renderDocument(model: DocumentModel, path: string): string {
  const file = { value: model.body, data: { path, bodyStart: model.bodyStart } };
  return String(processor.processSync(file));
}

function rehypeDocument() {
  return (tree: Root, file: { data: object }) => {
    const { path = "", bodyStart = 0 } = file.data as { path?: string; bodyStart?: number };
    tree.children = visit(tree.children as ElementContent[], (element) => annotate(element, path, bodyStart)) as Root["children"];
  };
}

/** Walks `nodes` depth first, letting `change` rewrite each element; the result replaces the element by its nodes. */
function visit(nodes: ElementContent[], change: (element: Element) => ElementContent[] | null): ElementContent[] {
  return nodes.flatMap((node) => {
    if (node.type !== "element") return [node];
    node.children = visit(node.children, change);
    return change(node) ?? [node];
  });
}

function annotate(element: Element, path: string, bodyStart: number): ElementContent[] | null {
  const start = element.position?.start.offset;
  const end = element.position?.end.offset;
  if (HEADINGS.has(element.tagName)) element.properties.id = headingId(textOf(element));
  if (BLOCKS.has(element.tagName) && start !== undefined && end !== undefined) {
    element.properties.dataSrc = `${bodyStart + start}-${bodyStart + end}`;
  }
  if (element.tagName === "a") return linkOf(element, path);
  if (element.tagName === "img") return imageOf(element, path);
  return null;
}

/** The link without an `href` unless it is external; an unresolvable one becomes its children in a span. */
function linkOf(element: Element, path: string): ElementContent[] | null {
  const { href, ...rest } = element.properties;
  const target = resolveLink(path, String(href ?? ""));
  switch (target.kind) {
    case "document":
      element.properties = { role: "link", tabIndex: 0, dataDoc: target.path, ...(target.anchor === null ? {} : { dataAnchor: target.anchor }), ...rest };
      break;
    case "anchor":
      element.properties = { role: "link", tabIndex: 0, dataAnchor: target.anchor, ...rest };
      break;
    case "file":
      element.properties = { role: "link", tabIndex: 0, dataFile: target.path, ...rest };
      break;
    case "external":
      element.properties = { href: target.url, target: "_blank", rel: ["noopener", "noreferrer"], ...rest };
      break;
    case "none":
      return [{ type: "element", tagName: "span", properties: { className: ["link-unresolved"] }, children: element.children }];
  }
  return null;
}

/** A Project image has no `src`: the View reads it through the Host. An unresolvable one becomes its alt text. */
function imageOf(element: Element, path: string): ElementContent[] | null {
  const { src, alt, ...rest } = element.properties;
  const text = String(alt ?? "");
  const target = resolveImage(path, String(src ?? ""));
  switch (target.kind) {
    case "project":
      element.properties = { dataImage: target.path, alt: text, ...rest };
      return null;
    case "external":
      element.properties = { src: target.url, alt: text, ...rest };
      return null;
    case "none":
      return [
        {
          type: "element",
          tagName: "span",
          properties: { className: ["image-missing"], role: "img", ariaLabel: text },
          children: [{ type: "text", value: text }],
        },
      ];
  }
}

const textOf = (node: ElementContent): string =>
  node.type === "text" ? node.value : node.type === "element" ? node.children.map(textOf).join("") : "";
