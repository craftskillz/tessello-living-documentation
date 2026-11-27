// Editing in the HTML page, the pure part (spec html-generation rules 8-9): a block edited in the page is read back as
// Markdown, and written over the block's lines. No DOM globals: a node of a shadow root or of a test fits `BlockNode`.

import type { TextEdit, TextRange } from "./edits.ts";

/** The part of a DOM node read here: an element of a shadow root or of an iframe fits it. */
export interface BlockNode {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  childNodes: ArrayLike<BlockNode>;
  getAttribute?(name: string): string | null;
}

export interface BlockMarkdownOptions {
  /** The Project setting: a line ending renders as a line break, so a `<br>` is written back as a plain newline. */
  softBreaks: boolean;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const HEADING_PREFIX: Record<string, string> = { h2: "## ", h3: "### ", h4: "#### " };
// b, i and strike: the browser's substitutes while editing.
const WRAPPERS: Record<string, string> = { strong: "**", b: "**", em: "*", i: "*", del: "~~", strike: "~~", code: "`" };
const HARD_BREAK = "  \n";
const FOOTNOTE_ID_PREFIX = "ld-fn-";

const classes = (node: BlockNode): string[] => (node.getAttribute?.("class") ?? "").split(/\s+/).filter(Boolean);

function childrenMarkdown(node: BlockNode, options: BlockMarkdownOptions): string | null {
  let markdown = "";
  let afterBreak = false;
  for (const child of Array.from(node.childNodes)) {
    let part = nodeMarkdown(child, options);
    if (part === null) return null;
    // The renderer writes a newline after each `<br>`: it is the source's line ending, not text.
    if (afterBreak && child.nodeType === TEXT_NODE) part = part.replace(/^\r?\n/, "");
    afterBreak = child.nodeType === ELEMENT_NODE && child.nodeName.toLowerCase() === "br";
    markdown += part;
  }
  return markdown;
}

const target = (url: string, title: string | null): string => (title ? `(${url} "${title}")` : `(${url})`);

function footnoteMarkdown(sup: BlockNode): string | null {
  const [link] = Array.from(sup.childNodes);
  const id = link?.getAttribute?.("data-anchor");
  if (sup.childNodes.length !== 1 || link.getAttribute?.("data-footnote-ref") == null || !id?.startsWith(FOOTNOTE_ID_PREFIX)) return null;
  return `[^${id.slice(FOOTNOTE_ID_PREFIX.length)}]`;
}

function elementMarkdown(element: BlockNode, options: BlockMarkdownOptions): string | null {
  const name = element.nodeName.toLowerCase();
  const attribute = (key: string) => element.getAttribute?.(key) ?? null;
  const wrapper = WRAPPERS[name];
  if (wrapper !== undefined) {
    const inner = childrenMarkdown(element, options);
    return inner ? wrapper + inner + wrapper : inner;
  }
  // A span the renderer emits has a class (unresolved link, missing image, callout icon): not Markdown text.
  if (name === "font" || (name === "span" && classes(element).length === 0)) return childrenMarkdown(element, options);
  if (name === "br") return options.softBreaks ? "\n" : HARD_BREAK;
  if (name === "sup") return footnoteMarkdown(element);
  if (name === "mark") return classes(element).includes("ld-tag-marker") ? attribute("title") : null;
  if (name === "img") {
    const written = attribute("data-md");
    return written === null ? null : `![${attribute("alt") ?? ""}]${target(written, attribute("title"))}`;
  }
  if (name === "a") {
    const written = attribute("data-md");
    const inner = childrenMarkdown(element, options);
    if (inner === null || written === null) return null;
    if (inner === written) return written;
    return inner ? `[${inner}]${target(written, attribute("title"))}` : "";
  }
  return null;
}

function nodeMarkdown(node: BlockNode, options: BlockMarkdownOptions): string | null {
  if (node.nodeType === TEXT_NODE) return node.nodeValue ?? "";
  return node.nodeType === ELEMENT_NODE ? elementMarkdown(node, options) : null;
}

/**
 * A paragraph or a heading from h2 to h4 of the page, read back as Markdown. Text is kept verbatim, so what the
 * renderer showed differently from its source (escapes, entities) does not match the source: the caller compares
 * with `sameIgnoringWhitespace` and falls back on the section editor. null: any other block, or anything but known
 * inline Markdown inside.
 */
export function blockToMarkdown(block: BlockNode, options: BlockMarkdownOptions): string | null {
  const name = block.nodeName.toLowerCase();
  const prefix = HEADING_PREFIX[name];
  if (name !== "p" && prefix === undefined) return null;
  const inner = childrenMarkdown(block, options);
  return inner === null ? null : (prefix ?? "") + inner;
}

export function sameIgnoringWhitespace(a: string, b: string): boolean {
  return a.replace(/\s/g, "") === b.replace(/\s/g, "");
}

/** `range` (a `data-src` range of the Document's text) widened to whole lines: from the start of the line holding its first character to the end of the line holding its last, before that line's ending. */
export function blockLines(text: string, range: TextRange): TextRange {
  const from = text.lastIndexOf("\n", range.from - 1) + 1;
  const last = Math.max(range.from, range.to - 1);
  let to = text[last] === "\n" ? last : text.indexOf("\n", last);
  if (to < 0) to = text.length;
  if (text[to - 1] === "\r") to--;
  return { from, to: Math.max(from, to) };
}

const isBlankLine = (line: string): boolean => line.trim() === "";

/**
 * The edit that writes `markdown` over the lines of the block at `range`, with the file's line endings; null when
 * they already are those lines. An empty `markdown` removes the lines with their line ending and one run of the blank
 * lines around them, so the blank lines do not double up.
 */
export function blockEdit(text: string, range: TextRange, markdown: string): TextEdit | null {
  const lines = blockLines(text, range);
  const crlf = text.includes("\r\n");
  const newline = crlf ? "\r\n" : "\n";
  const current = text.slice(lines.from, lines.to);
  if (markdown.replace(/\r\n/g, "\n") === current.replace(/\r\n/g, "\n")) return null;
  if (!isBlankLine(markdown)) return { range: lines, text: markdown.replace(/\r?\n/g, newline) };

  let { from, to } = lines;
  const next = (at: number): number => {
    const found = text.indexOf("\n", at);
    return found < 0 ? text.length : found + 1;
  };
  const previousStart = (at: number): number => text.lastIndexOf("\n", at - 2) + 1;
  to = next(to);
  const afterBlank = from === 0 || isBlankLine(text.slice(previousStart(from), from));
  if (afterBlank) {
    while (to < text.length && isBlankLine(text.slice(to, next(to)))) to = next(to);
    // Nothing follows: the blank lines before go instead.
    if (to === text.length) while (from > 0 && isBlankLine(text.slice(previousStart(from), from))) from = previousStart(from);
  }
  return { range: { from, to }, text: "" };
}
