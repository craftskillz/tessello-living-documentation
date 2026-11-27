// Format (ticket 36): pure, conservative Markdown reformat, like IntelliJ's Reformat on a markdown scratch. Aligns GFM
// tables, trims trailing whitespace (a hard line break, followed by text, stays two spaces), collapses blank lines, ends with one newline.
// Never touches the frontmatter, fenced or indented code, nor HTML blocks. Idempotent. The remark tree only locates
// those regions (by line); the rewrite works on the source lines, so nothing else in the text is re-serialised.

import type { Parent, Root, Table } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parseDocument } from "./document.ts";

const parser = unified().use(remarkParse).use(remarkGfm);

/** Reformats `text`. The line ending (CRLF if the text has any, else LF) is kept; empty or blank text gives "". */
export function formatMarkdown(text: string): string {
  if (text.trim() === "") return "";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const source = text.replace(/\r\n/g, "\n");
  const { bodyStart } = parseDocument(source, "");
  const front = source.slice(0, bodyStart);
  const body = source.slice(bodyStart);

  const lines = body.split("\n");
  const { verbatim, tables } = regionsOf(body);
  const out: string[] = front === "" ? [] : front.replace(/\n$/, "").split("\n");
  let previousBlank = front === "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const table = tables.get(i);
    if (table) {
      out.push(...alignTable(lines.slice(i, table.end + 1), table.column));
      i = table.end;
      previousBlank = false;
    } else if (verbatim.has(i)) {
      out.push(line);
      previousBlank = false;
    } else if (line.trim() === "") {
      if (!previousBlank) out.push("");
      previousBlank = true;
    } else {
      // Two spaces break a line only when text follows on the next line, and never on a heading.
      const next = lines[i + 1];
      const breaks = /\S {2,}$/.test(line) && !/^\s{0,3}#/.test(line) && next !== undefined && next.trim() !== "";
      out.push(breaks ? line.trimEnd() + "  " : line.trimEnd());
      previousBlank = false;
    }
  }
  while (out.length > 0 && out[out.length - 1]!.trim() === "") out.pop();
  return out.join("\n").replace(/\n/g, eol) + eol;
}

interface TableRegion {
  /** The 0-based index of the table's last line. */
  end: number;
  /** The 0-based column where the table starts on its first line (after any quote or list prefix). */
  column: number;
}

/** The 0-based lines of `body` to leave as they are (code, block HTML), and the tables by their first line. */
function regionsOf(body: string): { verbatim: Set<number>; tables: Map<number, TableRegion> } {
  const verbatim = new Set<number>();
  const tables = new Map<number, TableRegion>();
  const visit = (node: Root | Parent["children"][number], parent: Parent | null): void => {
    const position = node.position;
    if (position && (node.type === "code" || (node.type === "html" && parent && !isPhrasing(parent)))) {
      for (let line = position.start.line; line <= position.end.line; line++) verbatim.add(line - 1);
    } else if (position && node.type === "table") {
      tables.set(position.start.line - 1, { end: position.end.line - 1, column: position.start.column - 1 });
    }
    if ("children" in node && node.type !== "table") for (const child of node.children) visit(child, node);
  };
  visit(parser.parse(body), null);
  return { verbatim, tables };
}

/** Inline containers: an html node under one is inline HTML, which does not make its line verbatim. */
function isPhrasing(parent: Parent): boolean {
  return !["root", "blockquote", "listItem", "footnoteDefinition"].includes(parent.type);
}

/** The `lines` of one table (header, delimiter, rows) with every column padded to its width. `column` is where the first line's table text starts. */
function alignTable(lines: string[], column: number): string[] {
  const prefixes = lines.map((line, i) => (i === 0 ? line.slice(0, column) : prefixOf(line, column)));
  const rows = lines.map((line, i) => splitRow(line.slice(prefixes[i]!.length)));
  const header = rows[0]!;
  const count = header.length;
  const aligns = Array.from({ length: count }, (_, c) => {
    const cell = rows[1]![c] ?? "";
    return cell.startsWith(":") ? (cell.endsWith(":") ? "center" : "left") : cell.endsWith(":") ? "right" : "none";
  });
  const widths = aligns.map((align, c) => {
    const minimum = align === "center" ? 5 : align === "none" ? 3 : 4;
    let width = minimum;
    rows.forEach((row, r) => {
      if (r !== 1) width = Math.max(width, displayWidth(row[c] ?? ""));
    });
    return width;
  });
  return rows.map((row, r) => {
    const cells = widths.map((width, c) => {
      const align = aligns[c]!;
      if (r === 1) {
        const left = align === "left" || align === "center" ? ":" : "";
        const right = align === "right" || align === "center" ? ":" : "";
        return left + "-".repeat(width - left.length - right.length) + right;
      }
      const cell = row[c] ?? "";
      const pad = width - displayWidth(cell);
      if (align === "right") return " ".repeat(pad) + cell;
      if (align === "center") return " ".repeat(pad >> 1) + cell + " ".repeat(pad - (pad >> 1));
      return cell + " ".repeat(pad);
    });
    cells.push(...row.slice(count)); // extra cells: GFM ignores them, but their text is kept
    return prefixes[r]! + "| " + cells.join(" | ") + " |";
  });
}

/** The quote and indentation characters before a table line's text: `column` characters when they are all prefix, else the leading run. */
function prefixOf(line: string, column: number): string {
  const guess = line.slice(0, column);
  return /^[\s>]*$/.test(guess) ? guess : /^[\s>]*/.exec(line)![0];
}

/** The trimmed cells of a table row, split on pipes that are not escaped (a code span does not protect a pipe, as in GFM); the outer pipes are dropped. */
function splitRow(row: string): string[] {
  const text = row.trim();
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === "\\" && i + 1 < text.length) current += char + text[++i];
    else if (char === "|") {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  if (text.startsWith("|")) cells.shift();
  if (cells.length > 1 && cells[cells.length - 1]!.trim() === "" && text.endsWith("|")) cells.pop();
  return cells.map((cell) => cell.trim());
}

/** Terminal columns of `text`: wide (East Asian, fullwidth) and emoji characters count 2, combining marks and joiners 0. */
function displayWidth(text: string): number {
  let width = 0;
  let joined = false;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (joined) joined = false; // the character after a zero-width joiner is part of the same glyph
    else if (code === 0x200d) joined = true;
    else if (/^\p{M}$/u.test(char) || code === 0x200b || (code >= 0x1f3fb && code <= 0x1f3ff)) continue;
    else width += isWide(code, char) ? 2 : 1;
    if (code === 0x200d) joined = true;
  }
  return width;
}

function isWide(code: number, char: string): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd) ||
    /^\p{Emoji_Presentation}$/u.test(char)
  );
}
