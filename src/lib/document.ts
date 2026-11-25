// The Document model (docs/design.md §1): what the Module reads from a Document's text. Pure: nothing is written back
// (ADR 0004, docs/spec/frontmatter.md).

import { Lexer, parse, stringify, YAMLParseError } from "yaml";
import type { TextEdit } from "./edits.ts";

export type Frontmatter =
  | { valid: true; fields: Record<string, unknown> }
  /** Invalid YAML: the parser's message and line (from the top of the file); fields read line by line for display only. */
  | { valid: false; message: string; line: number; fields: Record<string, string> };

export interface DocumentModel {
  /** `title`, else the first top-level heading, else the file name as typed without `.md`. */
  title: string;
  description: string | null;
  tags: string[];
  type: string | null;
  /** The `html_template` field as written (trimmed), null when absent or empty. Read also from an invalid frontmatter's line-by-line fields. */
  htmlTemplate: string | null;
  /** The creation date from the frontmatter `timestamp`, as written and never converted: `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` when it has a time (space or `T` separator, cut to the minute). Null when absent or not starting with such a date. Read also from an invalid frontmatter's line-by-line fields. */
  created: string | null;
  /** The `language` field (trimmed), null when absent or empty. */
  language: string | null;
  frontmatter: Frontmatter;
  /** The YAML between the `---` lines, as written; null without a frontmatter block. */
  frontmatterText: string | null;
  /** The offset where the block ends, closing `---` included and its line break not: null without a frontmatter block. */
  frontmatterEnd: number | null;
  /** The text after the frontmatter. */
  body: string;
  /** The UTF-16 offset of `body` in the Document's text: 0 without frontmatter. */
  bodyStart: number;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(\r?\n|$)/;

export function parseDocument(text: string, path: string): DocumentModel {
  const match = FRONTMATTER.exec(text);
  const frontmatter: Frontmatter = match ? frontmatterOf(match[1]!) : { valid: true, fields: {} };
  const bodyStart = match ? match[0].length : 0;
  const body = text.slice(bodyStart);
  const fields: Record<string, unknown> = frontmatter.fields;
  const string = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
  return {
    title: string(fields.title) ?? headingOf(body) ?? fileTitle(path),
    description: string(fields.description),
    tags: tagsOf(fields.tags),
    type: string(fields.type),
    htmlTemplate: string(fields.html_template),
    language: string(fields.language),
    created: createdOf(fields.timestamp),
    frontmatter,
    frontmatterText: match ? match[1]! : null,
    frontmatterEnd: match ? match[0].length - match[2]!.length : null,
    body,
    bodyStart,
  };
}

function createdOf(timestamp: unknown): string | null {
  const value = timestamp instanceof Date && !Number.isNaN(timestamp.getTime()) ? timestamp.toISOString() : timestamp;
  const date = typeof value === "string" ? /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(value.trim()) : null;
  return date ? (date[2] ? `${date[1]}T${date[2]}` : date[1]!) : null;
}

function frontmatterOf(yaml: string): Frontmatter {
  try {
    const data: unknown = parse(yaml);
    return { valid: true, fields: typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {} };
  } catch (error) {
    const line = error instanceof YAMLParseError && error.linePos ? error.linePos[0].line + 1 : 2;
    const fields: Record<string, string> = {};
    for (const each of yaml.split(/\r?\n/)) {
      const field = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(each);
      if (field) fields[field[1]!] = field[2]!.trim();
    }
    return { valid: false, message: error instanceof Error ? error.message : String(error), line, fields };
  }
}

function tagsOf(tags: unknown): string[] {
  const items = Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",") : [];
  return items.map((tag) => String(tag).trim()).filter((tag) => tag !== "");
}

/** The first `# ` heading outside fenced code, as plain text. */
function headingOf(body: string): string | null {
  let fence: string | null = null;
  for (const line of body.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0]!;
      else if (marker[0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^ {0,3}#[ \t]+(.+?)[ \t#]*$/.exec(line);
    if (heading) return plain(heading[1]!);
  }
  return null;
}

/** Inline Markdown reduced to its text: emphasis, code and links. */
const plain = (inline: string) =>
  inline
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .trim();

const fileTitle = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");

/**
 * The edit that sets the frontmatter field `name` to `value` (written as given), null when the frontmatter is invalid
 * YAML. An existing top-level field is replaced in place, over all the lines of its value (keeping the line endings
 * around it); a missing field is appended as the block's last line; a Document without a frontmatter gets one at the
 * top. Every other byte stays (ADR 0004).
 */
export function setField(text: string, name: string, value: string): TextEdit | null {
  return editField(text, name, value);
}

/**
 * The edit that sets the frontmatter `type` to `type`, or removes the field when it is null or blank. The value is
 * trimmed, its whitespace runs collapsed to one space, and quoted as YAML needs so it reads back as exactly that
 * string. Null when the frontmatter is invalid YAML (the caller shows "Fix the frontmatter first"); clearing a missing
 * field gives an empty edit. Clearing the last field keeps an empty `---` block. Every other byte stays (ADR 0004).
 */
export function setType(text: string, type: string | null): TextEdit | null {
  const value = type?.replace(/\s+/g, " ").trim() ?? "";
  return editField(text, "type", value === "" ? null : stringify(value, { lineWidth: 0 }).trimEnd());
}

/** Sets the top-level field `name` to the raw YAML `value`, or removes it when `value` is null. */
function editField(text: string, name: string, value: string | null): TextEdit | null {
  const match = FRONTMATTER.exec(text);
  if (!match) return value === null ? { range: { from: 0, to: 0 }, text: "" } : { range: { from: 0, to: 0 }, text: `---\n${name}: ${value}\n---\n` };
  if (!frontmatterOf(match[1]!).valid) return null;
  const yamlStart = match[0].indexOf("\n") + 1;
  const yaml = match[1]!;
  const eol = match[0].startsWith("---\r\n") ? "\r\n" : "\n";
  const lines: { start: number; end: number; content: string }[] = [];
  for (let start = 0; start <= yaml.length; ) {
    const next = yaml.indexOf("\n", start);
    const end = next === -1 ? yaml.length : next;
    lines.push({ start: yamlStart + start, end: yamlStart + end - (yaml[end - 1] === "\r" ? 1 : 0), content: yaml.slice(start, end).replace(/\r$/, "") });
    start = end + 1;
  }
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const key = new RegExp(`^(?:${escaped}|"${escaped}"|'${escaped}')[ \\t]*:`);
  const first = lines.findIndex((line) => key.test(line.content));
  if (first === -1) {
    if (value === null) return { range: { from: 0, to: 0 }, text: "" };
    if (yaml === "") return { range: { from: yamlStart, to: yamlStart }, text: `${name}: ${value}${eol}` };
    const at = yamlStart + yaml.length;
    return { range: { from: at, to: at }, text: `${eol}${name}: ${value}` };
  }
  // The field's value goes on over indented lines (and blank lines between them), and over a block sequence at column 0.
  let last = first;
  for (let i = first + 1; i < lines.length; i++) {
    const content = lines[i]!.content;
    if (content.trim() === "") continue;
    if (!/^([ \t]|-(\s|$))/.test(content)) break;
    last = i;
  }
  const from = lines[first]!.start;
  if (value !== null) {
    // A one-line field keeps its trailing comment, the spaces before it included.
    const comment = first === last ? trailingComment(lines[first]!.content) : "";
    return { range: { from, to: lines[last]!.end }, text: `${name}: ${value}${comment}` };
  }
  // Removed with the line ending that follows (the block's closing line always follows the last line of the YAML).
  const after = lines[last]!.end;
  const to = text.startsWith("\r\n", after) ? after + 2 : after + 1;
  return { range: { from, to }, text: "" };
}

/** The comment ending a one-line YAML field (`  # note`, with the spaces before it), as the YAML lexer reads it; "" when none. */
function trailingComment(line: string): string {
  let offset = 0;
  let space = -1;
  for (const token of new Lexer().lex(line)) {
    if (token.startsWith("#") && space !== -1) return line.slice(space);
    space = /^[ \t]+$/.test(token) ? offset : -1;
    // The lexer's control tokens (document, scalar starts) are not source text.
    if (!/^[\u0000-\u001f]$/.test(token)) offset += token.length;
  }
  return "";
}
