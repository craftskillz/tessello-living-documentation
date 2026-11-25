// The Document model (docs/design.md §1): what the Module reads from a Document's text. Pure: nothing is written back
// (ADR 0004, docs/spec/frontmatter.md).

import { parse, YAMLParseError } from "yaml";
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
    frontmatter,
    frontmatterText: match ? match[1]! : null,
    frontmatterEnd: match ? match[0].length - match[2]!.length : null,
    body,
    bodyStart,
  };
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
 * The edit that sets the frontmatter field `name` to `value`, null when the frontmatter is invalid YAML. An existing
 * top-level line is replaced in place (keeping its line ending); a missing field is appended as the block's last line;
 * a Document without a frontmatter gets one at the top. Every other byte stays (ADR 0004).
 */
export function setField(text: string, name: string, value: string): TextEdit | null {
  const match = FRONTMATTER.exec(text);
  if (!match) return { range: { from: 0, to: 0 }, text: `---\n${name}: ${value}\n---\n` };
  if (!frontmatterOf(match[1]!).valid) return null;
  const yamlStart = match[0].indexOf("\n") + 1;
  const yaml = match[1]!;
  const eol = match[0].startsWith("---\r\n") ? "\r\n" : "\n";
  const key = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*:.*`, "m");
  const line = key.exec(yaml);
  if (line) {
    const from = yamlStart + line.index;
    return { range: { from, to: from + line[0].replace(/\r$/, "").length }, text: `${name}: ${value}` };
  }
  if (yaml === "") return { range: { from: yamlStart, to: yamlStart }, text: `${name}: ${value}${eol}` };
  const at = yamlStart + yaml.length;
  return { range: { from: at, to: at }, text: `${eol}${name}: ${value}` };
}
