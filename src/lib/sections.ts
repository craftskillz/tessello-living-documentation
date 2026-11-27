// Sections (docs/design.md §2, spec R5): pure. A section runs from a heading to the next heading of the same or a higher
// level; the text before the first heading is its own section, starting after the frontmatter. Headings inside code
// blocks, quotes and compare blocks do not count. Offsets are UTF-16, as everywhere in the Module.

import type { Heading, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parseDocument } from "./document.ts";
import { type TextEdit, type TextRange } from "./edits.ts";
import { compareRegions } from "./render.ts";

const parser = unified().use(remarkParse).use(remarkGfm);

interface HeadingStart {
  lineStart: number;
  /** The offset just after the heading's last character. */
  end: number;
  depth: number;
}

/** The section holding `offset` (an offset in the full Document text): from the start of the line of the closest heading at or before it, to the start of the line of the next heading of the same or higher level (or the end). Before the first heading: from the body start (after frontmatter) to the first heading. null when offset is inside the frontmatter or outside the text. */
export function sectionAt(text: string, offset: number): TextRange | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return null;
  const { bodyStart } = parseDocument(text, "");
  if (offset < bodyStart) return null;
  const headings = headingsOf(text, bodyStart);
  let selected = -1;
  for (let i = 0; i < headings.length; i++) if (headings[i]!.lineStart <= offset) selected = i;
  if (selected < 0) return { from: bodyStart, to: headings[0]?.lineStart ?? text.length };
  const heading = headings[selected]!;
  const next = headings.slice(selected + 1).find((each) => each.depth <= heading.depth);
  return { from: heading.lineStart, to: next?.lineStart ?? text.length };
}

/**
 * The section a right-click in the HTML page opens: `sectionAt`, except in the lead. The lead is what the page shows
 * before the first `##`: after the leading `#` title (when the body starts with one) or from the body start. In the
 * lead (a `###` there included) it is the lead only; on the title itself, null (the title is not a block of the page).
 */
export function htmlSectionAt(text: string, offset: number): TextRange | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return null;
  const { bodyStart } = parseDocument(text, "");
  if (offset < bodyStart) return null;
  const headings = headingsOf(text, bodyStart);
  const first = headings[0];
  const titled = first !== undefined && first.depth === 1 && text.slice(bodyStart, first.lineStart).trim() === "";
  let from = bodyStart;
  if (titled) {
    const newline = text.indexOf("\n", first.end);
    from = newline < 0 ? text.length : newline + 1;
    if (offset < from) return null;
  }
  const to = headings.find((each) => each.depth === 2)?.lineStart ?? text.length;
  if (offset >= from && (offset < to || to === text.length)) return { from, to };
  return sectionAt(text, offset);
}

/** The top-level headings of the body (ATX and Setext), compare blocks masked, as offsets in the full text. */
function headingsOf(text: string, bodyStart: number): HeadingStart[] {
  const body = text.slice(bodyStart);
  // " \n" for "\r\n": the same length, and the compare markers match at the end of their line.
  const regions = compareRegions(body.replace(/\r\n/g, " \n"));
  const masked = regions.reduceRight((rest, region) => rest.slice(0, region.from) + rest.slice(region.from, region.to).replace(/[^\r\n]/g, " ") + rest.slice(region.to), body);
  const tree = parser.parse(masked) as Root;
  return tree.children
    .filter((node): node is Heading => node.type === "heading")
    .map((node) => {
      const at = bodyStart + node.position!.start.offset!;
      return { lineStart: text.lastIndexOf("\n", at - 1) + 1, end: bodyStart + node.position!.end.offset!, depth: node.depth };
    });
}

/** The edit that replaces `section` of `text` by `replacement`: `replacement`'s line endings become the file's (CRLF if the file has any CRLF); when the section is followed by more text and the replacement is non-empty, the replacement is trimmed at its end and followed by exactly one blank line (two line endings). */
export function replaceSection(text: string, section: TextRange, replacement: string): TextEdit {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  let result = replacement.replace(/\r\n|\n/g, newline);
  if (result !== "" && section.to < text.length) result = result.trimEnd() + newline + newline;
  return { range: section, text: result };
}
