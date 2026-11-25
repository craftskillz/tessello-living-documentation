// A Document as HTML (docs/design.md §5): CommonMark and GitHub tables, task lists and strikethrough. Raw HTML in the
// Document is left out. Blocks carry their source range, headings their id, and links and images never carry an
// address the View could navigate to: the View is an about:srcdoc page (see links.ts). The original's directives
// (ADR 0005, catalogue in directives.ts), column layouts, `:::compare`, footnotes and code highlighting are rendered
// here, with Mermaid placeholders, the Kanban preview and Tag markers.

import type { Html, Image, Nodes, Parents, Root as MdastRoot } from "mdast";
import type { Element, ElementContent, Root } from "hast";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import type { DocumentModel } from "./document.ts";
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
  options: { frontmatter?: boolean; softBreaks: boolean; board?: boolean },
): Root {
  const all = { ...ENGLISH, ...labels };
  const documentText = `${model.frontmatterText ?? ""}\n${model.body}`;
  const tree = renderTree(model.body, path, model.bodyStart, all, "ld-", { documentText, topLevel: true, softBreaks: options.softBreaks, board: options.board ?? false });
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
  { documentText = text, topLevel = false, softBreaks, board = false }: { documentText?: string; topLevel?: boolean; softBreaks: boolean; board?: boolean },
): Root {
  const regions = compareRegions(text);
  const rendered = regions.map((region, index) => {
    const source = region.inner.endsWith("\n") ? region.inner.slice(0, -1) : region.inner;
    const inner = renderTree(source, path, bodyStart + region.innerFrom, labels, `${clobberPrefix}compare-${index}-`, { documentText, softBreaks });
    return compareElement(source, inner, labels);
  });
  const masked = maskCompares(text, regions);
  const compares = new Map(regions.map((region, index) => [region.from, index]));
  const pass: Pass = { path, bodyStart, compares, rendered, kanban: topLevel, board, text, documentText, softBreaks };
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

function compareElement(source: string, inner: Root, labels: RenderLabels): Element {
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
    properties: { className: ["ld-compare"] },
    children: [
      div("ld-compare-source", labels.compareSource, [{ type: "element", tagName: "pre", properties: {}, children: [code] }]),
      div("ld-compare-render", labels.compareRender, inner.children as ElementContent[]),
    ],
  };
}

function rehypeDocument() {
  return (tree: Root, file: { data: object }) => {
    const pass = file.data as Pass;
    tree.children = visit(tree.children as ElementContent[], (element) => annotate(element, pass)) as Root["children"];
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

function annotate(element: Element, { path, bodyStart, rendered }: Pass): ElementContent[] | null {
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
  if (element.tagName === "a") return linkOf(element, path);
  if (element.tagName === "img") return imageOf(element, path);
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

/** The text of a node, the Tag marker pills left out (a heading's id does not depend on them). */
const textOf = (node: ElementContent): string =>
  node.type === "text" ? node.value : node.type === "element" && node.tagName !== "mark" ? node.children.map(textOf).join("") : "";

// ---- line breaks: with the Project setting, every newline of a text node is a `<br>` ----

/** Splits `text` nodes (never code, inline code or html) at newlines into text and `break` nodes, dropping the spaces around them. */
function remarkSoftBreaks() {
  return (tree: MdastRoot, file: { data: object }) => {
    if (!(file.data as Pass).softBreaks) return;
    const walk = (parent: Parents): void => {
      const children: Nodes[] = [];
      for (const node of parent.children as Nodes[]) {
        if (node.type === "text" && /\r?\n/.test(node.value)) {
          const lines = node.value.split(/\r?\n/);
          lines.forEach((line, at) => {
            if (at > 0) children.push({ type: "break" });
            let value = line;
            if (at > 0) value = value.replace(/^[ \t]+/, "");
            if (at < lines.length - 1) value = value.replace(/[ \t]+$/, "");
            if (value !== "") children.push({ type: "text", value });
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
    columns(tree);
    if ((file.data as Pass).kanban) kanbanPreview(tree, (file.data as Pass).board);
    tagMarkers(tree, file.data as Pass);
    directives(tree, compares);
  };
}

/** The first Kanban block of the tree (an `html` flow node, in a quote or a list too), where it stands and what it says. */
function findKanban(root: MdastRoot): { parent: Parents; index: number; block: KanbanBlock } | null {
  const find = (parent: Parents): { parent: Parents; index: number; block: KanbanBlock } | null => {
    for (const [index, node] of (parent.children as Nodes[]).entries()) {
      const block = node.type === "html" ? parseKanbanBlock((node as Html).value) : null;
      if (block) return { parent, index, block };
      const inner = "children" in node ? find(node as Parents) : null;
      if (inner) return inner;
    }
    return null;
  };
  return find(root);
}

/** The Kanban block that makes the Document a board, by the rule its rendering uses; null when it is not a board. */
export function kanbanBlockOf(model: DocumentModel): KanbanBlock | null {
  const masked = maskCompares(model.body, compareRegions(model.body));
  return findKanban(unified().use(remarkParse).use(remarkGfm).parse(masked))?.block ?? null;
}

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
      if (node.type === "html" && !flow) {
        const match = new RegExp(`^${TAG_SOURCE}$`).exec(node.value);
        const tag = match && tagOf(match);
        out.push(tag && isMarker(tag) ? pill(tag, from, to, bodyStart) : node);
      } else if (node.type === "html") {
        out.push(parseKanbanBlock(node.value) ? node : htmlBlock(node, from, to));
      } else if (node.type === "text") {
        out.push(...splitText(node.value, text.slice(from, to), from));
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

  /** `value` is the text of a node written as `source` from offset `from`: pills for the marker tags really written there. */
  function splitText(value: string, source: string, from: number): Nodes[] {
    const written = [...source.matchAll(loneTag())];
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
      if (match.index > cursor) out.push({ type: "text", value: value.slice(cursor, match.index) });
      out.push(pill(tag, from + start, from + start + tag.text.length, bodyStart));
      cursor = match.index + match[0].length;
    }
    if (cursor === 0) return [{ type: "text", value }];
    if (cursor < value.length) out.push({ type: "text", value: value.slice(cursor) });
    return out;
  }

  walk(root, true);
}

/** Wraps the blocks between `layout-columns` and `/layout-columns` (top level only) in a grid of column divs. */
function columns(root: MdastRoot): void {
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
    const { style, border, color } = tableAttrs(found);
    const classes = [style && `table-style-${style}`, border && `table-border-${border}`, color && `table-color-${color}`].filter((each): each is string => !!each);
    if (classes.length === 0) return;
    node.data = {
      hProperties: {
        className: classes,
        ...(style && { dataTableStyle: style }),
        ...(border && { dataTableBorder: border }),
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
