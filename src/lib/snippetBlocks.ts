// Snippet blocks (spec: Documents and snippets, items 3 and 4; atlas R2, R3, R4): the snippets a Document's source holds,
// found by their Markdown shape, matched to the rendered article by their `data-src` range; the edits that insert,
// replace and delete one; and the save of such a change on a Project, which survives an agent's edit of the file.
// Offsets are UTF-16 offsets into the Document's full text (frontmatter included), as everywhere in the Module.

import type { Html, List, Nodes, Paragraph, Parents, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parseColumnComment, parseDirective } from "./directives.ts";
import { parseDocument } from "./document.ts";
import { applyEdits, type TextEdit, type TextRange } from "./edits.ts";
import { Conflict, type DocumentText, type Project } from "./project.ts";
import { compareRegions, htmlWrappers } from "./render.ts";
import { detectSnippet, EDITABLE_KINDS, type SnippetKind } from "./snippets.ts";

export interface SnippetBlock {
  /** Only an editable kind. */
  kind: SnippetKind;
  /** The rendered element's data-src range (the block without its directive comments). */
  element: TextRange;
  /** What Edit replaces and Delete removes: the block, the directive comments right before it included. Starts after the first line's prefix. */
  range: TextRange;
  /** Written before every line but the first: list indentation or quote markers ("> ", "   ", ">    "); "" at top level. */
  prefix: string;
  /** The source of `range` with `prefix` removed from its lines, newlines as "\n": what parseSnippet(kind, …) reads. */
  markdown: string;
}

type Place = "root" | "quote" | "deep";

const parser = unified().use(remarkParse).use(remarkGfm);

/** Kinds that take directive comments before them. */
const WITH_DIRECTIVES: ReadonlySet<SnippetKind> = new Set(["table", "image", "code-block", "tree", "blockquote", "mermaid"]);

/** The Markdown of the blocks of `text`, in text order. */
export function snippetBlocks(text: string): SnippetBlock[] {
  const bodyStart = parseDocument(text, "").bodyStart;
  const body = text.slice(bodyStart);
  // " \n" for "\r\n": the same length, and the compare markers match at the end of their line.
  const flat = body.replace(/\r\n/g, " \n");
  const regions = compareRegions(flat);
  const masked = regions.reduceRight((rest, region) => rest.slice(0, region.from) + rest.slice(region.from, region.to).replace(/[^\r\n]/g, " ") + rest.slice(region.to), body);
  const tree = parser.parse(masked) as Root;

  const found: SnippetBlock[] = [];
  const add = (kind: SnippetKind | null, element: TextRange, from: number) => {
    const block = kind && make(text, kind, element, from);
    if (block) found.push(block);
  };

  for (const region of regions) add("compare", { from: bodyStart + region.from, to: bodyStart + region.to }, bodyStart + region.from);
  for (const wrapper of htmlWrappers(flat)) add(wrapper.kind, { from: bodyStart + wrapper.from, to: bodyStart + wrapper.to }, bodyStart + wrapper.from);

  /** `place`: what the children of `parent` are to the Document: its own blocks, those of a top-level quote, or deeper. */
  const visit = (parent: Parents, place: Place): void => {
    const children = parent.children as Nodes[];
    children.forEach((node, index) => {
      const element = { from: bodyStart + node.position!.start.offset!, to: bodyStart + node.position!.end.offset! };
      const kind = kindOf(node, text, element, place);
      if (kind) add(kind, element, WITH_DIRECTIVES.has(kind) ? directivesStart(children, index, bodyStart) : element.from);
      if ("children" in node && node.type !== "paragraph" && node.type !== "heading" && node.type !== "table") {
        visit(node as Parents, place === "root" && node.type === "blockquote" ? "quote" : "deep");
      }
    });
  };
  visit(tree, "root");

  // Layouts, paired as render's columns() does: an opening comment up to the first closing comment after it, top level only.
  const top = tree.children as Nodes[];
  const commentKind = (node: Nodes) => parseColumnComment(node.type === "html" ? /^<!--([\s\S]*?)-->$/.exec((node as Html).value.trim())?.[1] ?? "\0" : "\0")?.kind;
  for (let at = 0; at < top.length; at++) {
    if (commentKind(top[at]!) !== "open") continue;
    const close = top.findIndex((each, index) => index > at && commentKind(each) === "close");
    if (close < 0) continue;
    if (close > at + 1) add("columns", { from: bodyStart + top[at]!.position!.start.offset!, to: bodyStart + top[close]!.position!.end.offset! }, bodyStart + top[at]!.position!.start.offset!);
    at = close;
  }

  return found.sort((a, b) => a.range.from - b.range.from || b.range.to - a.range.to);
}

/** The kind of the top-level or quoted block `node`, judged from its source only; null when it is none (the caller confirms with detectSnippet). */
function kindOf(node: Nodes, text: string, element: TextRange, place: Place): SnippetKind | null {
  const source = text.slice(element.from, element.to);
  switch (node.type) {
    case "code":
      return /^(```|~~~)/.test(source) ? "code-block" : null;
    case "table":
      return place === "deep" ? null : "table";
    case "heading": {
      const depth = (node as { depth: number }).depth;
      return place === "root" && depth <= 4 && source.startsWith("#") ? (`heading-${depth}` as SnippetKind) : null;
    }
    case "thematicBreak":
      return place === "root" ? "separator" : null;
    case "list":
      return place === "root" ? ((node as List).ordered ? "ordered-list" : "unordered-list") : null;
    case "blockquote":
      return place === "root" ? "blockquote" : null;
    case "paragraph":
      return place === "root" ? paragraphKind(node as Paragraph, source) : null;
    default:
      return null;
  }
}

/** The kind of a paragraph that is exactly a link, an image, an HTML link or a colored span. */
function paragraphKind(node: Paragraph, source: string): SnippetKind | null {
  const [only, ...others] = node.children;
  if (only && others.length === 0 && only.type === "link" && source.startsWith("[")) {
    if (source.startsWith("[📎")) return "attachment";
    return only.url.startsWith("?doc=") ? (only.url.includes("#") ? "anchor-doc-link" : "doc-link") : only.url.startsWith("#") ? "anchor-link" : "link";
  }
  if (only && others.length === 0 && only.type === "image") return "image";
  if (/^<a\s[^>]*>(?:(?!<\/?a[\s>])[\s\S])*<\/a>$/i.test(source)) return "link";
  if (/^<span\s[^>]*>(?:(?!<\/?span[\s>])[\s\S])*<\/span>$/i.test(source)) return "colored-text";
  return null;
}

/** Where the directive comments right before `children[index]` start (the node's own start when there are none). */
function directivesStart(children: Nodes[], index: number, bodyStart: number): number {
  let from = bodyStart + children[index]!.position!.start.offset!;
  for (let at = index - 1; at >= 0; at--) {
    const node = children[at]!;
    const comment = node.type === "html" ? /^<!--([\s\S]*?)-->$/.exec((node as Html).value.trim())?.[1] : undefined;
    // The layout's own comments are not directives of the block after them.
    if (comment === undefined || parseColumnComment(comment) || !parseDirective(comment)) break;
    from = bodyStart + node.position!.start.offset!;
  }
  return from;
}

/** The block of `kind` at `element` (its range starting at `from`), when its Markdown is what the dialog would recognize as that kind; null otherwise. */
function make(text: string, kind: SnippetKind, element: TextRange, from: number): SnippetBlock | null {
  const lineStart = text.lastIndexOf("\n", from - 1) + 1;
  // The text before the block on its first line, its markers made into spaces: what the next lines start with.
  const prefix = text.slice(lineStart, from).replace(/[^ \t>]/g, " ");
  const markdown = unprefixed(text.slice(from, element.to), prefix);
  const detected = detectSnippet(markdown);
  const confirmed = detected === kind || kind === "unordered-list" || kind === "ordered-list" || kind === "blockquote"
    || (kind === "code-block" && (detected === "tree" || detected === "code-block" || detected === "mermaid"))
    || (kind === "tree" && detected === "code-block")
    || (kind === "attachment" && detected === "attachment")
    || kind === "compare" || kind === "colored-section" || kind === "collapsible";
  const final = kind === "code-block" && detected === "tree" ? "tree" : kind === "code-block" && detected === "mermaid" ? "mermaid" : kind === "tree" && detected === "code-block" ? "code-block" : kind;
  if (!confirmed || !EDITABLE_KINDS.has(final)) return null;
  return { kind: final, element, range: { from, to: element.to }, prefix, markdown };
}

/** `source` with `prefix` taken off every line but the first, newlines as "\n". */
function unprefixed(source: string, prefix: string): string {
  const [first, ...rest] = source.split(/\r?\n/);
  const blank = prefix.trimEnd();
  const strip = (line: string): string => {
    if (line.startsWith(prefix)) return line.slice(prefix.length);
    if (blank !== "" && line.trimEnd() === blank) return "";
    if (blank === "") return line.replace(new RegExp(`^[ \\t]{0,${prefix.length}}`), "");
    return line;
  };
  return [first!, ...rest.map(strip)].join("\n");
}

const length = (range: TextRange) => range.to - range.from;

/** The snippet a click edits, given the data-src ranges of the clicked element and its ancestors (innermost first); null when none is a recognized, editable snippet. */
export function snippetAt(text: string, ranges: TextRange[]): SnippetBlock | null {
  const candidates = snippetBlocks(text).filter((block) => ranges.some((range) => range.from === block.element.from && range.to === block.element.to));
  const wrappers = candidates.filter((block) => block.kind === "collapsible" || block.kind === "colored-section");
  if (wrappers.length > 0) {
    const code = candidates.find((block) => block.kind === "code-block" || block.kind === "tree");
    if (code && wrappers.some((block) => block.kind === "collapsible")) return code;
    return wrappers.reduce((outer, block) => (length(block.element) > length(outer.element) ? block : outer));
  }
  return candidates.reduce<SnippetBlock | null>((inner, block) => (!inner || length(block.element) < length(inner.element) ? block : inner), null);
}

// ---- edits ----

const eolOf = (text: string) => (text.includes("\r\n") ? "\r\n" : "\n");
const withEol = (markdown: string, eol: string) => markdown.replace(/\r\n|\n/g, eol);

interface Line {
  /** Where the line starts, where its content ends (before its line ending), and where the next line starts. */
  start: number;
  end: number;
  next: number;
  blank: boolean;
}

function linesOf(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start <= text.length) {
    const newline = text.indexOf("\n", start);
    const next = newline < 0 ? text.length + 1 : newline + 1;
    const end = newline < 0 ? text.length : newline > start && text[newline - 1] === "\r" ? newline - 1 : newline;
    lines.push({ start, end, next, blank: text.slice(start, end).trim() === "" });
    start = next;
  }
  // The "line" after a final line ending is not a line.
  if (lines.length > 1 && lines.at(-1)!.start === text.length) lines.pop();
  return lines;
}

/** Insert-after (R2): `markdown` after the block ending at `after.to`, or at the end of the Document when `after` is null; one blank line on each side. */
export function insertAfter(text: string, after: TextRange | null, markdown: string): TextEdit {
  const eol = eolOf(text);
  const snippet = withEol(markdown.replace(/(\r?\n)+$/, ""), eol);
  const lines = linesOf(text);
  const anchor = after === null ? [...lines].reverse().find((line) => !line.blank) : lines.find((line) => line.start <= Math.max(after.to - 1, 0) && Math.max(after.to - 1, 0) < line.next);
  if (!anchor) return { range: { from: 0, to: text.length }, text: `${snippet}${eol}` };
  const following = lines.find((line) => line.start > anchor.start && !line.blank);
  const to = following ? following.start : text.length;
  return { range: { from: anchor.end, to }, text: `${eol}${eol}${snippet}${eol}${following ? eol : ""}` };
}

/** Edit (R3): the block's range replaced by `markdown`, `block.prefix` put back before every line but the first. */
export function replaceBlock(text: string, block: Pick<SnippetBlock, "range" | "prefix">, markdown: string): TextEdit {
  const eol = eolOf(text);
  const lines = markdown.replace(/(\r?\n)+$/, "").split(/\r?\n/);
  const result = lines.map((line, index) => (index === 0 ? line : line === "" ? block.prefix.trimEnd() : block.prefix + line));
  return { range: block.range, text: result.join(eol) };
}

/** Delete: the block's range and the blank lines it leaves removed, its neighbours keeping one blank line between them. */
export function deleteBlock(text: string, block: Pick<SnippetBlock, "range" | "prefix">): TextEdit {
  const eol = eolOf(text);
  const lines = linesOf(text);
  const first = lines.findIndex((line) => block.range.from < line.next);
  const last = lines.findIndex((line) => block.range.to <= line.end);
  const before = lines.slice(0, first).reverse().find((line) => !line.blank);
  const after = lines.slice(last + 1).find((line) => !line.blank);
  if (before && after) return { range: { from: before.end, to: after.start }, text: `${eol}${eol}` };
  if (before) return { range: { from: before.end, to: text.length }, text: eol };
  if (after) return { range: { from: 0, to: after.start }, text: "" };
  return { range: { from: 0, to: text.length }, text: "" };
}

// ---- saving ----

export type SnippetChange =
  | { kind: "insert"; after: TextRange | null; markdown: string }
  | { kind: "replace"; block: Pick<SnippetBlock, "range" | "prefix">; markdown: string }
  | { kind: "delete"; block: Pick<SnippetBlock, "range" | "prefix"> };

export type SnippetSave =
  | { kind: "saved"; text: string; version: string }
  /** The Document changed on disk; the block was found again by its content: Retry applies `change` on `base`. */
  | { kind: "moved"; base: DocumentText; change: SnippetChange }
  /** The block (or the Document) is no longer on disk: the User copies `markdown` (null for a delete). */
  | { kind: "gone"; markdown: string | null };

const editOf = (text: string, change: SnippetChange): TextEdit =>
  change.kind === "insert" ? insertAfter(text, change.after, change.markdown)
    : change.kind === "replace" ? replaceBlock(text, change.block, change.markdown)
      : deleteBlock(text, change.block);

/**
 * Where, in `theirs`, the lines of `base` holding `target` stand now: the occurrence of those whole lines nearest to
 * their old place (whole lines, so that a block reworded on disk is not found inside its new text). The range of
 * `target` there; null when the lines are gone.
 */
function relocated(base: string, theirs: string, target: TextRange): TextRange | null {
  const lineStart = base.lastIndexOf("\n", target.from - 1) + 1;
  const newline = base.indexOf("\n", target.to);
  const lineEnd = newline < 0 ? base.length : newline;
  const source = base.slice(lineStart, lineEnd);
  const wholeLine = (at: number) => (at === 0 || theirs[at - 1] === "\n") && (at + source.length === theirs.length || theirs[at + source.length] === "\n");
  let best: number | null = null;
  for (let at = theirs.indexOf(source); at >= 0; at = theirs.indexOf(source, at + 1)) {
    if (wholeLine(at) && (best === null || Math.abs(at - lineStart) < Math.abs(best - lineStart))) best = at;
  }
  return best === null ? null : { from: best + target.from - lineStart, to: best + target.to - lineStart };
}

/**
 * Applies `change` to `base` (the text the View rendered) and saves it at base.version. A Conflict re-reads: the block
 * (for insert: the block it follows; null after → the new end) is looked for by its source lines in theirs — the
 * occurrence nearest to its old place — and the change moved there ("moved"), else "gone"; a Document
 * deleted on disk is "gone". Other failures reject unchanged (the View shows them with Retry).
 */
export async function saveSnippet(project: Project, path: string, base: DocumentText, change: SnippetChange): Promise<SnippetSave> {
  try {
    const text = applyEdits(base.text, [editOf(base.text, change)]);
    return { kind: "saved", text, version: await project.save(path, text, base.version) };
  } catch (error) {
    if (!(error instanceof Conflict)) throw error;
    const { theirs } = error;
    const gone: SnippetSave = { kind: "gone", markdown: change.kind === "delete" ? null : change.markdown };
    if (!theirs) return gone;
    const target = change.kind === "insert" ? change.after : change.block.range;
    if (target === null) return { kind: "moved", base: theirs, change };
    const moved = relocated(base.text, theirs.text, target);
    if (!moved) return gone;
    return { kind: "moved", base: theirs, change: change.kind === "insert" ? { ...change, after: moved } : { ...change, block: { ...change.block, range: moved } } };
  }
}
