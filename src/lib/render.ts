// A Document as HTML (docs/design.md §5): CommonMark and GitHub tables, task lists and strikethrough. Raw HTML in the
// Document is left out, but for a bare `<br>`, a line break. Blocks carry their source range, headings their id, and links and images never carry an
// address the View could navigate to: the View is an about:srcdoc page (see links.ts). The original's directives
// (ADR 0005, catalogue in directives.ts), column layouts, `:::compare`, footnotes and code highlighting are rendered
// here, with Mermaid placeholders, the Kanban preview and Tag markers.

import type { Html, Image, Nodes, Parents, Root as MdastRoot, Text } from "mdast";
import type { Element, ElementContent, Root } from "hast";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import type { DocumentModel } from "./document.ts";
import type { TextRange } from "./edits.ts";
import { calloutIcon, gridTemplate, parseColumnComment, type Directive, parseDirective, quoteAttrs, type QuoteAttrs, sizeAttrs, tableAttrs } from "./directives.ts";
import { type KanbanBlock, parseKanbanBlock } from "./kanban.ts";
import { isMarkerName, pillLabel, TAG_SOURCE } from "./tagMarkers.ts";
import { headingId, resolveImage, resolveLink } from "./links.ts";

const BLOCKS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "pre", "table", "hr"]);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

export interface RenderLabels {
  footnotes: string;
  footnoteBack: string;
  compareSource: string;
  compareRender: string;
}

const ENGLISH: RenderLabels = { footnotes: "Footnotes", footnoteBack: "Back to reference", compareSource: "Markdown", compareRender: "Result" };

/** What one pass of the pipeline reads from its file: where the Document is, and its `:::compare` regions. */
type Pass = {
  path: string;
  bodyStart: number;
  /** Compare placeholders by their offset in the masked text; the matching rendered nodes by the same index. */
  compares: Map<number, number>;
  rendered: Element[];
  /** Whether a Kanban block counts here: not inside a `:::compare`, so the Document shows at most one board. */
  kanban: boolean;
  /** Whether the View draws the board itself: the Kanban block is then left out instead of previewed. */
  board: boolean;
  /** The text this pass parses (offsets of its nodes are in it), and the whole Document's, for closing tags. */
  text: string;
  documentText: string;
  /** Every newline of a paragraph is a line break (the Project setting), not only two trailing spaces. */
  softBreaks: boolean;
  /** Links and Project/external images keep their target as written in the Markdown, in `data-md` (the HTML view's editing). */
  sourceTargets: boolean;
};

/** The unified pipeline, up to the hast tree. `clobberPrefix` starts the ids of footnotes. */
function pipeline(labels: RenderLabels, clobberPrefix: string) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirectives)
    .use(remarkSoftBreaks)
    .use(remarkRehype, {
      clobberPrefix,
      footnoteLabel: labels.footnotes,
      footnoteBackLabel: labels.footnoteBack,
      footnoteLabelProperties: { className: ["ld-footnotes-label"] },
    })
    .use(rehypeHighlight, { detect: true, plainText: ["mermaid"] })
    .use(rehypeDocument)
    .use(function () {
      this.compiler = ((tree: Root) => tree) as never;
    });
}

/**
 * The HTML of `model`'s body, for the Document at `path`. Every block has `data-src="<from>-<to>"`, UTF-16 offsets
 * into the Document's full text. Internal links have no `href`; only external links do. With `frontmatter`, the
 * frontmatter block comes first as a highlighted YAML code block (the Folder manifest, opened read-only).
 */
export function renderDocument(
  model: DocumentModel,
  path: string,
  labels: Partial<RenderLabels>,
  options: { frontmatter?: boolean; softBreaks: boolean; board?: boolean },
): string {
  const tree = renderDocumentTree(model, path, labels, options);
  return unified().use(rehypeStringify, { allowDangerousHtml: true }).stringify(tree);
}

/** The hast tree `renderDocument` stringifies: what another renderer of the same Document (the HTML page) builds on. */
export function renderDocumentTree(
  model: DocumentModel,
  path: string,
  labels: Partial<RenderLabels>,
  options: { frontmatter?: boolean; softBreaks: boolean; board?: boolean; sourceTargets?: boolean },
): Root {
  const all = { ...ENGLISH, ...labels };
  const documentText = `${model.frontmatterText ?? ""}\n${model.body}`;
  const tree = renderTree(model.body, path, model.bodyStart, all, "ld-", { documentText, topLevel: true, softBreaks: options.softBreaks, board: options.board ?? false, sourceTargets: options.sourceTargets ?? false });
  if (options.frontmatter && model.frontmatterText !== null && model.frontmatterEnd !== null) {
    const fence = "`".repeat(Math.max(3, ...(model.frontmatterText.match(/`+/g) ?? []).map((run) => run.length + 1)));
    const block = renderTree(`${fence}yaml\n${model.frontmatterText}\n${fence}`, path, 0, all, "ld-frontmatter-", { softBreaks: false });
    for (const node of block.children) if (node.type === "element") node.properties.dataSrc = `0-${model.frontmatterEnd}`;
    tree.children = [...block.children, { type: "text", value: "\n" }, ...tree.children];
  }
  return tree;
}

/** `text` starts at offset `bodyStart` of the Document. Each `:::compare` region is rendered apart, then swapped in. */
/**
 * `documentText`: the whole Document's text, for closing tags (`text` by default). `topLevel`: the pass of the Document
 * itself, not of a `:::compare` or the frontmatter (only it shows a Kanban block). `softBreaks`: the Project setting.
 * `board`: the View draws the board, so the Kanban block is left out.
 */
function renderTree(
  text: string,
  path: string,
  bodyStart: number,
  labels: RenderLabels,
  clobberPrefix: string,
  { documentText = text, topLevel = false, softBreaks, board = false, sourceTargets = false }: { documentText?: string; topLevel?: boolean; softBreaks: boolean; board?: boolean; sourceTargets?: boolean },
): Root {
  const regions = compareRegions(text);
  const rendered = regions.map((region, index) => {
    const source = region.inner.endsWith("\n") ? region.inner.slice(0, -1) : region.inner;
    const inner = renderTree(source, path, bodyStart + region.innerFrom, labels, `${clobberPrefix}compare-${index}-`, { documentText, softBreaks, sourceTargets });
    return compareElement(source, inner, labels, region, bodyStart);
  });
  const masked = maskCompares(text, regions);
  const compares = new Map(regions.map((region, index) => [region.from, index]));
  const pass: Pass = { path, bodyStart, compares, rendered, kanban: topLevel, board, text, documentText, softBreaks, sourceTargets };
  return pipeline(labels, clobberPrefix).processSync({ value: masked, data: pass }).result as Root;
}

export interface CompareRegion {
  from: number;
  to: number;
  innerFrom: number;
  inner: string;
}

/** The `:::compare` … `:::` regions at column 0, outside fenced code. A compare never closed is not a region. */
export function compareRegions(text: string): CompareRegion[] {
  const regions: CompareRegion[] = [];
  const lines = text.split("\n");
  const offsets: number[] = [];
  lines.reduce((at, line, i) => ((offsets[i] = at), at + line.length + 1), 0);
  let fence: RegExpExecArray | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const opening = /^(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (opening && opening[1]![0] === fence[1]![0] && opening[1]!.length >= fence[1]!.length && /^[`~]+[ \t]*$/.test(line)) fence = null;
      continue;
    }
    if (opening) fence = opening;
    else if (/^:::compare[ \t]*$/.test(line)) {
      const close = lines.findIndex((each, j) => j > i && /^:::[ \t]*$/.test(each));
      if (close < 0) continue;
      const innerFrom = offsets[i + 1]!;
      regions.push({ from: offsets[i]!, to: offsets[close]! + lines[close]!.length, innerFrom, inner: text.slice(innerFrom, offsets[close]!) });
      i = close;
    }
  }
  return regions;
}

/** `text` with each of its `:::compare` `regions` turned into a comment as long, so that it counts as nothing there. */
const maskCompares = (text: string, regions: CompareRegion[]): string =>
  regions.reduceRight((rest, region) => rest.slice(0, region.from) + placeholder(rest.slice(region.from, region.to)) + rest.slice(region.to), text);

/** An HTML comment as long as `region`, newlines kept: the rest of the text keeps its offsets and its lines. */
const placeholder = (region: string): string => "<!--" + region.slice(4, -3).replace(/[^\n]/g, " ") + "-->";

function compareElement(source: string, inner: Root, labels: RenderLabels, region: CompareRegion, bodyStart: number): Element {
  const div = (className: string, label: string, children: ElementContent[]): Element => ({
    type: "element",
    tagName: "div",
    properties: { className: [className], dataLabel: label },
    children,
  });
  const code: Element = { type: "element", tagName: "code", properties: { className: ["language-markdown"] }, children: [{ type: "text", value: source }] };
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["ld-compare"], dataSrc: `${bodyStart + region.from}-${bodyStart + region.to}` },
    children: [
      div("ld-compare-source", labels.compareSource, [{ type: "element", tagName: "pre", properties: {}, children: [code] }]),
      div("ld-compare-render", labels.compareRender, inner.children as ElementContent[]),
    ],
  };
}

function rehypeDocument() {
  return (tree: Root, file: { data: object }) => {
    const pass = file.data as Pass;
    recordSources(tree, pass);
    tree.children = visit(tree.children as ElementContent[], (element) => annotate(element, pass)) as Root["children"];
  };
}

/** Where each text node written in the Document stands: its source slice and the offset of that slice in the Document's full text. */
type TextSource = { from: number; source: string };

/** Puts the `TextSource` of every positioned text node in its `data` (rehype-stringify ignores it): `locateClick` reads it. */
function recordSources(node: Root | Element, { bodyStart, text }: Pass): void {
  for (const child of node.children as ElementContent[]) {
    if (child.type === "element") recordSources(child, { bodyStart, text } as Pass);
    else if (child.type === "text") {
      const start = child.position?.start.offset;
      const end = child.position?.end.offset;
      if (start !== undefined && end !== undefined) ((child.data ??= {}) as Record<string, TextSource>)[SOURCE_KEY] = { from: bodyStart + start, source: text.slice(start, end) } satisfies TextSource;
    }
  }
}

const SOURCE_KEY = "ldSource";

/** Walks `nodes` depth first, letting `change` rewrite each element; the result replaces the element by its nodes. */
function visit(nodes: ElementContent[], change: (element: Element) => ElementContent[] | null): ElementContent[] {
  return nodes.flatMap((node) => {
    if (node.type !== "element") return [node];
    node.children = visit(node.children, change);
    return change(node) ?? [node];
  });
}

function annotate(element: Element, { path, bodyStart, rendered, sourceTargets }: Pass): ElementContent[] | null {
  if (element.properties.dataCompare !== undefined) return [rendered[Number(element.properties.dataCompare)]!];
  const start = element.position?.start.offset;
  const end = element.position?.end.offset;
  if (HEADINGS.has(element.tagName) && element.properties.id !== "footnote-label") element.properties.id = headingId(textOf(element));
  if (element.tagName === "pre") {
    const code = element.children.find((each): each is Element => each.type === "element" && each.tagName === "code");
    const { ldPre, ...rest } = code?.properties ?? {};
    if (code && ldPre) {
      code.properties = rest;
      Object.assign(element.properties, ldPre);
    }
    if (code && /^language-mermaid$/i.test(String((code.properties.className as string[] | undefined)?.find((each) => /^language-/.test(each)) ?? ""))) {
      mermaidOf(element, code);
    }
  }
  if (element.tagName === "blockquote" && element.properties.ldCallout) {
    const quote = element.properties.ldCallout as unknown as QuoteAttrs;
    delete element.properties.ldCallout;
    decorateCallout(element, quote);
  }
  if ((BLOCKS.has(element.tagName) || isMermaid(element) || element.properties.dataKanban !== undefined) && start !== undefined && end !== undefined) {
    element.properties.dataSrc = `${bodyStart + start}-${bodyStart + end}`;
  }
  if (element.tagName === "table") return [{ type: "element", tagName: "div", properties: { className: ["overflow-x-auto"] }, children: [element] }];
  if (element.tagName === "td" || element.tagName === "th") {
    if (element.children.length === 0) element.children = [{ type: "text", value: "\u00a0" }];
  }
  if (element.tagName === "a") return linkOf(element, path, sourceTargets);
  if (element.tagName === "img") return imageOf(element, path, sourceTargets);
  return null;
}

const isMermaid = (element: Element): boolean => element.tagName === "div" && element.properties.dataMermaid !== undefined;

/** A mermaid code block as a placeholder holding the diagram source; the View draws it. The code layout stays on it. */
function mermaidOf(pre: Element, code: Element): void {
  const { className = [], ...layout } = pre.properties;
  pre.tagName = "div";
  pre.properties = { className: ["ld-mermaid", ...(className as string[])], dataMermaid: "", ...layout };
  pre.children = [{ type: "text", value: textOf(code).replace(/\n$/, "") }];
}

/** The link without an `href` unless it is external; an unresolvable one becomes its children in a span. */
function linkOf(element: Element, path: string, sourceTargets: boolean): ElementContent[] | null {
  const { href, ...others } = element.properties;
  const rest = sourceTargets ? { dataMd: String(href ?? ""), ...others } : others;
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
function imageOf(element: Element, path: string, sourceTargets: boolean): ElementContent[] | null {
  const { src, alt, ...others } = element.properties;
  const rest = sourceTargets ? { dataMd: String(src ?? ""), ...others } : others;
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

/** The text of a node, the Tag marker pills left out (a heading's id does not depend on them). */
const textOf = (node: ElementContent): string =>
  node.type === "text" ? node.value : node.type === "element" && node.tagName !== "mark" ? node.children.map(textOf).join("") : "";

// ---- line breaks: with the Project setting, every newline of a text node is a `<br>` ----

/** Splits `text` nodes (never code, inline code or html) at newlines into text and `break` nodes, dropping the spaces around them. */
function remarkSoftBreaks() {
  return (tree: MdastRoot, file: { data: object }) => {
    const pass = file.data as Pass;
    if (!pass.softBreaks) return;
    const walk = (parent: Parents): void => {
      const children: Nodes[] = [];
      for (const node of parent.children as Nodes[]) {
        if (node.type === "text" && /\r?\n/.test(node.value)) {
          const base = node.position?.start.offset;
          const end = node.position?.end.offset;
          const aligned = base === undefined || end === undefined ? null : align(node.value, pass.text.slice(base, end));
          let lineStart = 0;
          const lines = node.value.split(/\r?\n/);
          lines.forEach((line, at) => {
            if (at > 0) children.push({ type: "break" });
            let value = line;
            let from = lineStart;
            if (at > 0) {
              value = value.replace(/^[ \t]+/, "");
              from += line.length - value.length;
            }
            if (at < lines.length - 1) value = value.replace(/[ \t]+$/, "");
            lineStart += line.length + (node.value.slice(lineStart + line.length).startsWith("\r\n") ? 2 : 1);
            if (value !== "") children.push(textPiece(node, aligned, from, from + value.length, value));
          });
        } else {
          if ("children" in node) walk(node as Parents);
          children.push(node);
        }
      }
      (parent as { children: Nodes[] }).children = children;
    };
    walk(tree);
  };
}

// ---- directives: the comments before a block, read on the Markdown tree and left on it as properties ----

/** Consumes every comment of the tree; the ones that are directives decorate the block that follows them. */
function remarkDirectives() {
  return (tree: MdastRoot, file: { data: object }) => {
    const { compares } = file.data as Pass;
    htmlSnippets(tree, (file.data as Pass).bodyStart);
    columns(tree, (file.data as Pass).bodyStart);
    if ((file.data as Pass).kanban) kanbanPreview(tree, (file.data as Pass).board);
    tagMarkers(tree, file.data as Pass);
    directives(tree, compares);
  };
}

// ---- raw HTML snippets: the four shapes the original's snippets write; any other raw HTML stays out ----

const SNIPPET_COLOR = /^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]+)$/i;
const OPENING_DETAILS = /^<details(?:\s[^>]*)?>\s*<summary>([\s\S]*?)<\/summary>\s*$/i;
const OPENING_SECTION = /^<div\s+style\s*=\s*(?:"([^"]*)"|'([^']*)')\s*>\s*$/i;
const OPENING_SPAN = /^<span\s+style\s*=\s*(?:"([^"]*)"|'([^']*)')\s*>$/i;
const OPENING_LINK = /^<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>$/i;

type FlowKind = "collapsible" | "colored-section";

/** A colour of a style declaration (`name`, read at a declaration start) when it is a hex or plain colour name. */
function styleColor(style: string, declaration: RegExp): string | null {
  const value = declaration.exec(style)?.[1]?.trim();
  return value !== undefined && SNIPPET_COLOR.test(value) ? value : null;
}

/** The style a colored section is rebuilt with: only the colours read in the original's style, nothing else is copied. */
function sectionStyle(style: string): string {
  const background = styleColor(style, /(?:^|;)\s*background\s*:\s*([^;]+)/i);
  const border = styleColor(style, /(?:^|;)\s*border-left\s*:\s*4px\s+solid\s+([^;\s]+)/i);
  const color = styleColor(style, /(?:^|;)\s*color\s*:\s*([^;]+)/i);
  return [background && `background:${background}`, border && `border-left:4px solid ${border}`, color && `color:${color}`].filter((each): each is string => !!each).join(";");
}

/** What a flow html node opens: a collapsible (its summary) or a colored section (its style), else null. */
function flowOpening(node: Nodes): { kind: FlowKind; summary?: string; style?: string } | null {
  if (node.type !== "html") return null;
  const value = node.value.trim();
  const details = OPENING_DETAILS.exec(value);
  if (details) return { kind: "collapsible", summary: details[1]!.replace(/<[^>]*>/g, "").trim() };
  const section = OPENING_SECTION.exec(value);
  const style = section && (section[1] ?? section[2] ?? "");
  return style !== null && /border-left/i.test(style) ? { kind: "colored-section", style } : null;
}

const flowClosing = (node: Nodes): FlowKind | null =>
  node.type === "html" ? (/^<\/details\s*>$/i.test(node.value.trim()) ? "collapsible" : /^<\/div\s*>$/i.test(node.value.trim()) ? "colored-section" : null) : null;

const FLOW_PARENTS = new Set(["root", "blockquote", "listItem", "footnoteDefinition"]);

/**
 * Wraps, in every container of the tree, the blocks between a collapsible's or a colored section's opening and closing
 * html nodes, and turns inline colored text and HTML links into nodes of their own. The opening and closing nodes are
 * consumed. `bodyStart` turns the offsets of the pass into the Document's.
 */
function htmlSnippets(parent: Parents, bodyStart: number): void {
  const flow = FLOW_PARENTS.has(parent.type) || parent.type.startsWith("ld");
  const nodes = parent.children as Nodes[];
  const out: Nodes[] = [];
  for (let at = 0; at < nodes.length; at++) {
    const node = nodes[at]!;
    const opening = flow ? flowOpening(node) : null;
    if (opening) {
      let depth = 0;
      let close = -1;
      for (let next = at + 1; next < nodes.length && close < 0; next++) {
        const other = flowOpening(nodes[next]!);
        if (other?.kind === opening.kind) depth++;
        else if (flowClosing(nodes[next]!) === opening.kind && depth-- === 0) close = next;
      }
      const from = node.position?.start.offset;
      const to = nodes[close]?.position?.end.offset;
      if (close >= 0 && from !== undefined && to !== undefined) {
        const inner: Parents = { type: "blockquote", children: nodes.slice(at + 1, close) as never };
        htmlSnippets(inner, bodyStart);
        const dataSrc = `${bodyStart + from}-${bodyStart + to}`;
        const position = { start: node.position!.start, end: nodes[close]!.position!.end };
        if (opening.kind === "collapsible") {
          const summary = { type: "ldSummary", children: [{ type: "text", value: opening.summary! }], data: { hName: "summary" } };
          out.push({ type: "ldCollapsible", children: [summary, ...inner.children], position, data: { hName: "details", hProperties: { dataSrc } } } as never);
        } else {
          const style = sectionStyle(opening.style!);
          out.push({ type: "ldColoredSection", children: inner.children, position, data: { hName: "div", hProperties: { className: ["ld-colored-section"], ...(style && { style }), dataSrc } } } as never);
        }
        at = close;
        continue;
      }
    }
    out.push(node);
    if ("children" in node) htmlSnippets(node as Parents, bodyStart);
  }
  parent.children = (flow ? out : inlineSnippets(out)) as never;
}

/** Inline html `<span style="color:X">` … `</span>` as colored text, `<a href>` … `</a>` as a link, among phrasing `nodes`. */
function inlineSnippets(nodes: Nodes[]): Nodes[] {
  const out: Nodes[] = [];
  for (let at = 0; at < nodes.length; at++) {
    const node = nodes[at]!;
    const value = node.type === "html" ? node.value.trim() : "";
    const span = OPENING_SPAN.exec(value);
    const link = OPENING_LINK.exec(value);
    const closing = span ? /^<\/span\s*>$/i : link ? /^<\/a\s*>$/i : null;
    const close = closing ? nodes.findIndex((each, index) => index > at && each.type === "html" && closing.test(each.value.trim())) : -1;
    const start = node.position?.start;
    const end = nodes[close]?.position?.end;
    if (close < 0 || !start || !end) {
      out.push(node);
      continue;
    }
    const children = nodes.slice(at + 1, close);
    const position = { start, end };
    if (span) {
      const color = styleColor(span[1] ?? span[2] ?? "", /(?:^|;)\s*color\s*:\s*([^;]+)/i);
      out.push({ type: "coloredText", children, position, data: { hName: "span", hProperties: { className: ["ld-colored-text"], ...(color && { style: `color:${color}` }) } } } as never);
    } else {
      out.push({ type: "link", url: (link![1] ?? link![2])!, title: null, children, position } as never);
    }
    at = close;
  }
  return out;
}

/** A wrapper the raw HTML snippets of a text make: its kind and its range in the text. */
export interface HtmlWrapper {
  kind: FlowKind;
  from: number;
  to: number;
}

/**
 * The collapsibles and colored sections of `text` by the rules the rendering uses (opening and closing html nodes at the
 * same level, in any container, nested ones too), in document order. `:::compare` regions are left out.
 */
export function htmlWrappers(text: string): HtmlWrapper[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(maskCompares(text, compareRegions(text)));
  htmlSnippets(tree, 0);
  const found: HtmlWrapper[] = [];
  const walk = (node: Nodes): void => {
    const type: string = node.type;
    const kind = type === "ldCollapsible" ? "collapsible" : type === "ldColoredSection" ? "colored-section" : null;
    const { start, end } = node.position ?? {};
    if (kind && start?.offset !== undefined && end?.offset !== undefined) found.push({ kind, from: start.offset, to: end.offset });
    if ("children" in node) (node.children as Nodes[]).forEach(walk);
  };
  walk(tree);
  return found;
}

/** The first Kanban block of the tree (an `html` flow node, in a quote or a list too), where it stands and what it says. */
function findKanban(root: MdastRoot): { parent: Parents; index: number; block: KanbanBlock; node: Html } | null {
  const find = (parent: Parents): { parent: Parents; index: number; block: KanbanBlock; node: Html } | null => {
    for (const [index, node] of (parent.children as Nodes[]).entries()) {
      const block = node.type === "html" ? parseKanbanBlock((node as Html).value) : null;
      if (block) return { parent, index, block, node: node as Html };
      const inner = "children" in node ? find(node as Parents) : null;
      if (inner) return inner;
    }
    return null;
  };
  return find(root);
}

/**
 * The Kanban block that makes the Document a board, by the rule its rendering uses, and its range in the Document's full
 * text (the block line itself, not a quote or list marker); null when it is not a board.
 */
export function kanbanBlockAt(model: DocumentModel): { block: KanbanBlock; range: TextRange } | null {
  const masked = maskCompares(model.body, compareRegions(model.body));
  const found = findKanban(unified().use(remarkParse).use(remarkGfm).parse(masked));
  const { start, end } = found?.node.position ?? {};
  if (!found || start?.offset === undefined || end?.offset === undefined) return null;
  return { block: found.block, range: { from: model.bodyStart + start.offset, to: model.bodyStart + end.offset } };
}

/** The Kanban block that makes the Document a board, by the rule its rendering uses; null when it is not a board. */
export const kanbanBlockOf = (model: DocumentModel): KanbanBlock | null => kanbanBlockAt(model)?.block ?? null;

/** Replaces the first Kanban block of the tree by a read-only preview of its columns, or removes it when `leaveOut`. */
function kanbanPreview(root: MdastRoot, leaveOut: boolean): void {
  const found = findKanban(root);
  if (!found) return;
  const { parent, index, block } = found;
  if (leaveOut) {
    parent.children.splice(index, 1);
    return;
  }
  const column = (label: string, color: string) => ({
    type: "ldKanbanColumn",
    children: [{ type: "ldKanbanTitle", children: [{ type: "text", value: label }], data: { hName: "div", hProperties: { className: ["ld-kanban-column-title"] } } }],
    data: { hName: "div", hProperties: { className: ["ld-kanban-column", `ld-kanban-${color}`] } },
  });
  parent.children[index] = {
    type: "ldKanban",
    children: block.columns.map((each) => column(each.label, each.color)),
    position: parent.children[index]!.position,
    data: { hName: "div", hProperties: { className: ["ld-kanban"], dataKanban: "" } },
  } as never;
}

// ---- aligning a text node's value with its source ----

const ENTITY = /^&(?:#\d+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/;
const ASCII_PUNCTUATION = /^[!-/:-@[-`{-~]$/;

/**
 * For each character of `value` (the text of a node), where it starts and ends in `source` (what the Document wrote):
 * values differ from sources by backslash escapes (the escape belongs to its character), entities (one unit each), and,
 * after a newline, the quote or list indentation. Null when the two cannot be aligned.
 */
function align(value: string, source: string): { starts: number[]; ends: number[] } | null {
  const starts: number[] = [];
  const ends: number[] = [];
  let j = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (c === "\n") while (source[j] === " " || source[j] === "\t") j++;
    const entity = source[j] === "&" ? ENTITY.exec(source.slice(j)) : null;
    if (entity && !value.startsWith(entity[0], i)) {
      const body = entity[0].slice(1, -1);
      const code = body[0] !== "#" ? 0 : body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      const units = code > 0xffff ? 2 : 1;
      for (let k = 0; k < units && i + k < value.length; k++) (starts[i + k] = j), (ends[i + k] = j + entity[0].length);
      i += units - 1;
      j += entity[0].length;
      continue;
    }
    if (source[j] === "\\" && source[j + 1] === c && ASCII_PUNCTUATION.test(c)) {
      starts[i] = j;
      j += 2;
      ends[i] = j;
      continue;
    }
    if (source[j] !== c) return null;
    starts[i] = j;
    ends[i] = ++j;
    if (c === "\n") while ((source[j] === " " || source[j] === "\t" || source[j] === ">") && value[i + 1] !== source[j]) j++;
  }
  starts[value.length] = j;
  return { starts, ends };
}

/** A position of the Markdown tree at `offset` of the pass's text (only the offset is ever read). */
const positionAt = (offset: number) => ({ line: 1, column: 1, offset });

/** The part `from`-`to` of the text node `node` (value indexes), with the position it has in the pass's text. */
function textPiece(node: Text, aligned: ReturnType<typeof align>, from: number, to: number, value: string): Nodes {
  const base = node.position?.start.offset;
  if (!aligned || base === undefined || to <= from) return { type: "text", value };
  return { type: "text", value, position: { start: positionAt(base + aligned.starts[from]!), end: positionAt(base + aligned.ends[to - 1]!) } };
}

// ---- Tag markers: lone tags of unknown names, found on the Markdown tree so code and comments never hold one ----

const loneTag = (): RegExp => new RegExp(TAG_SOURCE, "g");
const RAW_OPENING = /^<(pre|code|script|style|textarea)\b[^>]*>$/i;

type Tag = { text: string; name: string; free: string | undefined };

/** The pill of a tag whose range in the Document is `from` to `to` (offsets of the pass's text). */
function pill({ name, free }: Tag, from: number, to: number, bodyStart: number): Nodes {
  const title = free === undefined || free === "" ? `<${name}>` : `<${name} ${free.trim()}>`;
  return {
    type: "ldMarker",
    children: [{ type: "text", value: pillLabel(name) }],
    data: { hName: "mark", hProperties: { className: ["ld-tag-marker"], title, dataTag: name, dataSrc: `${bodyStart + from}-${bodyStart + to}` } },
  } as never;
}

const tagOf = (match: RegExpExecArray): Tag => ({ text: match[0], name: match[1]!, free: match[2] });

/** Turns lone marker tags of inline `html`, `text` and block `html` nodes into pills; skips code, comments and Kanban. */
function tagMarkers(root: MdastRoot, { text, documentText, bodyStart }: Pass): void {
  const isMarker = (tag: Tag) => isMarkerName(tag.name, documentText);
  /** A bare `<br>` (`<br/>`, `<br />`), the one raw HTML tag kept inline: the usual way to break a line in a table cell. */
  const LINE_BREAK = /^<br\s*\/?>$/i;
  const walk = (parent: Parents, flow: boolean): void => {
    const out: Nodes[] = [];
    /** The raw region (`<code>`, `<pre>`…) written inline and still open: what it holds is never a marker. */
    let raw: string | null = null;
    for (const node of parent.children as Nodes[]) {
      const from = node.position?.start.offset;
      const to = node.position?.end.offset;
      if (!flow && node.type === "html") {
        const opening = RAW_OPENING.exec(node.value);
        if (raw === null && opening) raw = opening[1]!.toLowerCase();
        else if (raw !== null && new RegExp(`^</${raw}\\s*>$`, "i").test(node.value)) raw = null;
      }
      if (from === undefined || to === undefined || raw !== null) {
        out.push(node);
        continue;
      }
      if (node.type === "html" && !flow && LINE_BREAK.test(node.value)) {
        out.push({ type: "break" });
      } else if (node.type === "html" && !flow) {
        const match = new RegExp(`^${TAG_SOURCE}$`).exec(node.value);
        const tag = match && tagOf(match);
        out.push(tag && isMarker(tag) ? pill(tag, from, to, bodyStart) : node);
      } else if (node.type === "html") {
        out.push(parseKanbanBlock(node.value) ? node : htmlBlock(node, from, to));
      } else if (node.type === "text") {
        out.push(...splitText(node, text.slice(from, to), from));
      } else {
        if ("children" in node) walk(node as Parents, node.type === "root" || node.type === "blockquote" || node.type === "listItem" || (node.type as string).startsWith("ld"));
        out.push(node);
      }
    }
    parent.children = out as never;
  };

  /** The paragraph of pills and text an HTML block holds, or the block itself when it holds no marker. */
  function htmlBlock(node: Html, from: number, to: number): Nodes {
    const source = text.slice(from, to);
    const kept = node.value.replace(/<!--[\s\S]*?-->|<(pre|code|script|style|textarea)\b[\s\S]*?<\/\1\s*>/gi, "");
    const children: Nodes[] = [];
    let cursor = 0;
    let found = 0;
    let plain = "";
    const flush = () => {
      if (plain !== "") children.push({ type: "text", value: plain.replace(/\n\s*\n/g, "\n") });
      plain = "";
    };
    for (const match of kept.matchAll(loneTag())) {
      plain += kept.slice(cursor, match.index).replace(/<[^>]*>/g, "");
      cursor = match.index + match[0].length;
      const tag = tagOf(match);
      if (!isMarker(tag)) continue;
      const at = source.indexOf(tag.text, found);
      flush();
      children.push(at < 0 ? pill(tag, from, to, bodyStart) : pill(tag, from + at, from + at + tag.text.length, bodyStart));
      found = Math.max(at, 0) + tag.text.length;
    }
    if (children.length === 0) return node;
    plain += kept.slice(cursor).replace(/<[^>]*>/g, "");
    flush();
    return { type: "paragraph", children, position: node.position } as never;
  }

  /** `node` is a text node written as `source` from offset `from`: pills for the marker tags really written there. */
  function splitText(node: Text, source: string, from: number): Nodes[] {
    const value = node.value;
    const written = [...source.matchAll(loneTag())];
    const aligned = align(value, source);
    let next = 0;
    const out: Nodes[] = [];
    let cursor = 0;
    for (const match of value.matchAll(loneTag())) {
      const at = written.findIndex((each, index) => index >= next && each[0] === match[0]);
      if (at < 0) continue;
      next = at + 1;
      const start = written[at]!.index;
      const tag = tagOf(match);
      if (!isMarker(tag) || /(^|[^\\])(\\\\)*\\$/.test(source.slice(0, start))) continue;
      if (match.index > cursor) out.push(textPiece(node, aligned, cursor, match.index, value.slice(cursor, match.index)));
      out.push(pill(tag, from + start, from + start + tag.text.length, bodyStart));
      cursor = match.index + match[0].length;
    }
    if (cursor === 0) return [node];
    if (cursor < value.length) out.push(textPiece(node, aligned, cursor, value.length, value.slice(cursor)));
    return out;
  }

  walk(root, true);
}

/** Wraps the blocks between `layout-columns` and `/layout-columns` (top level only) in a grid of column divs. */
function columns(root: MdastRoot, bodyStart: number): void {
  const out: Nodes[] = [];
  const nodes = root.children as Nodes[];
  for (let at = 0; at < nodes.length; at++) {
    const open = parseColumnComment(commentOf(nodes[at]!) ?? "\0");
    const close = open?.kind === "open" ? nodes.findIndex((each, index) => index > at && parseColumnComment(commentOf(each) ?? "\0")?.kind === "close") : -1;
    if (open?.kind !== "open" || close < 0) {
      out.push(nodes[at]!);
      continue;
    }
    const groups: Nodes[][] = [];
    for (const node of nodes.slice(at + 1, close)) {
      if (parseColumnComment(commentOf(node) ?? "\0")?.kind === "column") groups.push([]);
      else (groups.at(-1) ?? groups[groups.push([]) - 1]!).push(node);
    }
    const openAt = at;
    at = close;
    if (groups.length === 0) continue;
    const { ratio, verticalAlign, textAlign, gap } = open.options;
    out.push({
      type: "ldColumns",
      children: groups.map((group) => ({ type: "ldColumn", children: group, data: { hName: "div", hProperties: { className: ["ld-column"] } } })),
      data: {
        hName: "div",
        hProperties: {
          className: ["ld-columns", ...(verticalAlign ? [`ld-valign-${verticalAlign}`] : []), ...(textAlign ? [`ld-text-${textAlign}`] : []), ...(gap ? [`ld-gap-${gap}`] : [])],
          style: `grid-template-columns: ${gridTemplate(ratio, groups.length)};`,
          dataSrc: `${bodyStart + nodes[openAt]!.position!.start.offset!}-${bodyStart + nodes[close]!.position!.end.offset!}`,
        },
      },
    } as never);
  }
  root.children = out as never;
}

function directives(parent: Parents, compares: Map<number, number>): void {
  let pending: Directive[] = [];
  const kept: Nodes[] = [];
  for (const node of parent.children) {
    const compare = node.type === "html" ? compares.get(node.position?.start.offset ?? -1) : undefined;
    if (compare !== undefined) {
      pending = [];
      kept.push({ type: "ldCompare", children: [], position: node.position, data: { hName: "div", hProperties: { dataCompare: compare } } } as never);
      continue;
    }
    const comment = commentOf(node);
    if (comment !== null) {
      const directive = parseDirective(comment);
      if (directive) pending.push(directive);
      continue;
    }
    if ("children" in node) directives(node as Parents, compares);
    decorate(node, pending);
    pending = [];
    kept.push(node as never);
  }
  parent.children = kept as never;
}

const commentOf = (node: Nodes): string | null => (node.type === "html" ? /^<!--([\s\S]*?)-->$/.exec((node as Html).value.trim())?.[1] ?? null : null);

function decorate(node: Nodes, found: Directive[]): void {
  if (found.length === 0) return;
  if (node.type === "paragraph") {
    const image = node.children.find((each) => each.type === "image") as Image | undefined;
    const { width, align, widthClass } = sizeAttrs("image", found);
    if (!image || (!width && !align)) return;
    (image as Nodes).data = {
      hProperties: {
        className: [width && `ld-image-width-${widthClass}`, align && `ld-image-align-${align}`].filter((each): each is string => !!each),
        ...(width && { dataImageWidth: width }),
        ...(align && { dataImageAlign: align }),
      },
    };
  }
  if (node.type === "blockquote") {
    const quote = quoteAttrs(found);
    if (!quote.type && !quote.title && !quote.icon) return;
    node.data = {
      hProperties: { className: ["ld-callout", ...(quote.type ? [`ld-callout-${quote.type}`] : [])], ldCallout: quote } as never,
    };
  }
  if (node.type === "code") {
    const { width, align, widthClass } = sizeAttrs("code", found);
    if (!width && !align) return;
    // remark-rehype puts a code node's properties on the `code` element; `annotate` moves them to the `pre`.
    node.data = {
      hProperties: {
        ldPre: {
          className: [width && `ld-code-width-${widthClass}`, align && `ld-code-align-${align}`].filter((each): each is string => !!each),
          ...(width && { dataCodeBlockWidth: width }),
          ...(align && { dataCodeBlockAlign: align }),
        },
      } as never,
    };
  }
  if (node.type === "table") {
    const { style, fill, border, rounded, color } = tableAttrs(found);
    const classes = [
      style && `table-style-${style}`,
      fill && `table-fill-${fill}`,
      border && `table-border-${border}`,
      rounded && "table-rounded",
      color && `table-color-${color}`,
    ].filter((each): each is string => !!each);
    if (classes.length === 0) return;
    node.data = {
      hProperties: {
        className: classes,
        ...(style && { dataTableStyle: style }),
        ...(fill && { dataTableFill: fill }),
        ...(border && { dataTableBorder: border }),
        ...(rounded && { dataTableRounded: "" }),
        ...(color && { dataTableColor: color }),
      },
    };
  }
}

/** The callout's icon and title, as the original laid them out: a header row, or an icon inline in the first paragraph. */
function decorateCallout(quote: Element, { type, title, icon }: QuoteAttrs): void {
  const svg = (): ElementContent => ({ type: "raw", value: calloutIcon(type) }) as never;
  const span = (className: string, children: ElementContent[]): Element => ({ type: "element", tagName: "span", properties: { className: className.split(" ") }, children });
  if (icon && title === null) {
    const first = firstParagraph(quote) ?? quote;
    first.children.unshift(span("ld-callout-icon ld-callout-icon-inline", [svg()]));
  } else if (title !== null) {
    const header: Element = {
      type: "element",
      tagName: "div",
      properties: { className: ["ld-callout-header"] },
      children: [...(icon ? [span("ld-callout-icon", [svg()])] : []), span("ld-callout-title", [{ type: "text", value: title }])],
    };
    quote.children.unshift(header);
  }
}

const firstParagraph = (node: Element): Element | null => {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (child.tagName === "p") return child;
    const inner = firstParagraph(child);
    if (inner) return inner;
  }
  return null;
};

// ---- clicking in a rendered Document: where in the Document's text a click lands ----

/** The Tag-marker pills of a rendered Document, in order: the name as written and the range of the tag. */
export function markersOf(tree: Root): { name: string; range: TextRange }[] {
  const found: { name: string; range: TextRange }[] = [];
  const walk = (node: Root | Element): void => {
    for (const child of node.children as ElementContent[]) {
      if (child.type !== "element") continue;
      if (hasClass(child, "ld-tag-marker") && child.properties.dataTag !== undefined) {
        const [from, to] = String(child.properties.dataSrc).split("-").map(Number);
        found.push({ name: String(child.properties.dataTag), range: { from: from!, to: to! } });
      } else walk(child);
    }
  };
  walk(tree);
  return found;
}

const hasClass = (element: Element, name: string): boolean => ((element.properties.className as string[] | undefined) ?? []).includes(name);
const NOT_VISIBLE = new Set(["svg", "script", "style", "button"]);
const notVisible = (element: Element): boolean => NOT_VISIBLE.has(element.tagName) || element.properties.dataMermaid !== undefined;
/** What a Tag marker cannot be written in: code, a diagram, a compare block, a Kanban board, another marker. */
const refusesMarker = (element: Element): boolean =>
  element.tagName === "pre" || element.tagName === "code" || element.properties.dataMermaid !== undefined || element.properties.dataKanban !== undefined || hasClass(element, "ld-compare") || hasClass(element, "ld-tag-marker");

/**
 * Where a click lands in the Document's full text. `block` is the `data-src` range of the innermost element holding the
 * click (a marker pill never counts as one); `offset` the characters of visible text in it before the clicked one.
 * `{ at }` is the offset right before that character; `{ refused }` when it is in code, a diagram, a compare block, a
 * Kanban board or a marker; null when it has no position of its own (a footnote number, a callout title, raw HTML).
 */
export function locateClick(tree: Root, block: TextRange, offset: number): { at: number } | { refused: true } | null {
  const src = `${block.from}-${block.to}`;
  let target: { element: Element; refused: boolean } | null = null;
  const find = (node: Root | Element, refused: boolean): void => {
    for (const child of node.children as ElementContent[]) {
      if (child.type !== "element") continue;
      const inside = refused || refusesMarker(child);
      if (child.properties.dataSrc === src && !hasClass(child, "ld-tag-marker")) target = { element: child, refused: inside };
      find(child, inside);
    }
  };
  find(tree, false);
  const found = target as { element: Element; refused: boolean } | null;
  if (!found) return null;
  if (found.refused) return { refused: true };
  let seen = 0;
  const walk = (node: Element, refused: boolean): { at: number } | { refused: true } | null | undefined => {
    for (const child of node.children) {
      if (child.type === "element") {
        if (notVisible(child)) continue;
        const result = walk(child, refused || refusesMarker(child));
        if (result !== undefined) return result;
      } else if (child.type === "text") {
        if (offset >= seen && offset < seen + child.value.length) {
          if (refused) return { refused: true };
          const recorded = (child.data as Record<string, TextSource> | undefined)?.[SOURCE_KEY];
          const aligned = recorded && align(child.value, recorded.source);
          return aligned ? { at: recorded.from + aligned.starts[offset - seen]! } : null;
        }
        seen += child.value.length;
      }
    }
    return undefined;
  };
  return walk(found.element, false) ?? null;
}
