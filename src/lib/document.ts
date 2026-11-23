// The Document model (docs/design.md §1): what the Module reads from a Document's text. Pure: nothing is written back
// (ADR 0004, docs/spec/frontmatter.md).

import { parse, YAMLParseError } from "yaml";

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
  frontmatter: Frontmatter;
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
    frontmatter,
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
