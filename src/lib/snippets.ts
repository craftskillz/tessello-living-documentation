// Snippets (docs/design.md §9): the Markdown each kind of snippet writes (the formats of the original, ADR 0003), the form state it
// is read back into, and the kind a piece of Markdown has. Pure: no DOM; every default text comes from the View through `SnippetTexts`.

import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parseDocument } from "./document.ts";
import { KANBAN_COLORS, MAX_COLUMNS as KANBAN_MAX_COLUMNS, parseKanbanBlock, type KanbanColor } from "./kanban.ts";
export { KANBAN_COLORS };
import { headingId } from "./links.ts";
import { compareRegions } from "./render.ts";

export type SnippetKind =
  | "heading-1" | "heading-2" | "heading-3" | "heading-4" | "separator" | "collapsible" | "unordered-list" | "ordered-list" | "table" | "kanban"
  | "tree" | "code-block" | "compare"
  | "colored-text" | "colored-section" | "blockquote" | "emojis"
  | "link" | "doc-link" | "anchor-link" | "anchor-doc-link" | "image";

export type SnippetCategory = "structure" | "code" | "rich-text" | "links-media";

/** The picker's categories, with their kinds in display order. */
export const SNIPPET_CATEGORIES: readonly { key: SnippetCategory; kinds: readonly SnippetKind[] }[] = [
  { key: "structure", kinds: ["heading-1", "heading-2", "heading-3", "heading-4", "separator", "collapsible", "unordered-list", "ordered-list", "table", "kanban"] },
  { key: "code", kinds: ["tree", "code-block", "compare"] },
  { key: "rich-text", kinds: ["colored-text", "colored-section", "blockquote", "emojis"] },
  { key: "links-media", kinds: ["link", "doc-link", "anchor-link", "anchor-doc-link", "image"] },
];

/** Kinds the reading view reopens in their form (all but emojis and kanban). */
export const EDITABLE_KINDS: ReadonlySet<SnippetKind> = new Set(SNIPPET_CATEGORIES.flatMap((each) => each.kinds).filter((kind) => kind !== "emojis" && kind !== "kanban"));

const WITHOUT_PREVIEW: ReadonlySet<SnippetKind> = new Set(["separator", "kanban", "compare", "emojis", "link", "doc-link", "anchor-link", "anchor-doc-link", "image"]);

/** Whether the dialog shows the Markdown preview for `kind` (the other kinds have their own live preview). */
export function showsPreview(kind: SnippetKind): boolean {
  return WITHOUT_PREVIEW.has(kind);
}

export type Swatch = "info" | "success" | "warning" | "danger" | "note" | "neutral";
export type TableStyle = "" | "compact" | "intermediate";
export type TableFill = "" | "striped" | "full";
export type TableBorder = "" | "bordered" | "soft-bordered";
export type TableColor = "" | "info" | "success" | "warning" | "danger" | "note";
export type Width = "" | "full" | "3/4" | "2/3" | "1/2" | "1/3" | "1/4";
export type Align = "" | "left" | "center" | "right";
export type QuoteType = "" | "info" | "success" | "warning" | "error";

/** The colours of each swatch of the coloured text and section kinds. */
export const SWATCHES: Record<Swatch, { bg: string; border: string; text: string }> = {
  info: { bg: "#eff6ff", border: "#3b82f6", text: "#1e3a5f" },
  success: { bg: "#f0fdf4", border: "#22c55e", text: "#14532d" },
  warning: { bg: "#fffbeb", border: "#f59e0b", text: "#451a03" },
  danger: { bg: "#fef2f2", border: "#ef4444", text: "#450a0a" },
  note: { bg: "#f5f3ff", border: "#8b5cf6", text: "#2e1065" },
  neutral: { bg: "#f9fafb", border: "#6b7280", text: "#111827" },
};

/** Every default and fallback text, translated by the View (never hard-coded in src/lib). */
export interface SnippetTexts {
  heading: string;
  collapsibleSummary: string;
  collapsibleBody: string;
  item: string;
  subItem: string;
  subSubItem: string;
  tableHeader: string;
  treeFolder: string;
  treeFile: string;
  treeEmpty: string;
  code: string;
  quote: string;
  quoteAuthor: string;
  imageAlt: string;
  imageUrl: string;
  linkText: string;
  anchorText: string;
  anchor: string;
  coloredText: string;
  coloredSection: string;
  kanbanColumns: readonly string[];
}

export type SnippetData =
  | { kind: "heading-1" | "heading-2" | "heading-3" | "heading-4"; text: string }
  | { kind: "separator" }
  | { kind: "collapsible"; summary: string; body: string }
  | { kind: "unordered-list" | "ordered-list"; items: string }
  | { kind: "table"; style: TableStyle; fill: TableFill; border: TableBorder; rounded: boolean; color: TableColor; rows: string[][] }
  | { kind: "kanban"; columns: { label: string; color: KanbanColor }[] }
  | { kind: "tree"; items: { name: string; depth: number }[] }
  | { kind: "code-block"; language: string; code: string; width: Width; align: Align }
  | { kind: "compare"; content: string }
  | { kind: "colored-text"; color: Swatch; text: string }
  | { kind: "colored-section"; color: Swatch; content: string }
  | { kind: "blockquote"; type: QuoteType; icon: boolean; title: string; content: string }
  | { kind: "emojis"; value: string }
  | { kind: "link"; text: string; url: string }
  | { kind: "doc-link"; text: string; path: string; title: string }
  | { kind: "anchor-link"; text: string; anchor: string }
  | { kind: "anchor-doc-link"; text: string; path: string; anchor: string }
  | { kind: "image"; alt: string; url: string; width: Width; align: Align };

/** The options of the forms, in the order the dialog offers them (the empty value, "default" or "none", left out). */
export const WIDTHS: readonly Exclude<Width, "">[] = ["full", "3/4", "2/3", "1/2", "1/3", "1/4"];
export const ALIGNS: readonly Exclude<Align, "">[] = ["left", "center", "right"];
export const TABLE_STYLES: readonly Exclude<TableStyle, "">[] = ["intermediate", "compact"];
export const TABLE_FILLS: readonly Exclude<TableFill, "">[] = ["striped", "full"];
export const TABLE_BORDERS: readonly Exclude<TableBorder, "">[] = ["bordered", "soft-bordered"];
export const TABLE_COLORS: readonly Exclude<TableColor, "">[] = ["info", "success", "warning", "danger", "note"];
export const QUOTE_TYPES: readonly Exclude<QuoteType, "">[] = ["info", "success", "warning", "error"];
/** Whether `value` is one of `options`. */
const isOneOf = <T extends string>(options: readonly T[], value: string): value is T => (options as readonly string[]).includes(value);
const QUOTE_ALIASES: Record<string, QuoteType> = { note: "info", tip: "success", caution: "warning", danger: "error" };

const width = (value: string): Width => (isOneOf(WIDTHS, value) ? value : "");
const align = (value: string): Align => (isOneOf(ALIGNS, value) ? value : "");
const kanbanColor = (value: string | undefined, index: number): KanbanColor => KANBAN_COLORS.find((each) => each === (value ?? "").trim().toLowerCase()) ?? KANBAN_COLORS[index % KANBAN_COLORS.length]!;
const swatchOfBorder = (border: string | undefined): Swatch => (Object.keys(SWATCHES) as Swatch[]).find((each) => SWATCHES[each].border === (border ?? "").trim().toLowerCase()) ?? "info";
const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();
const withoutMd = (path: string) => path.replace(/\.md$/i, "");
const docId = (path: string) => encodeURIComponent(withoutMd(path));
const decode = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const exampleList = (texts: SnippetTexts, marker: (n: number, level: number) => string): string => {
  const rows: [number, string][] = [
    [0, `${texts.item} 1`], [0, `${texts.item} 2`], [1, `${texts.subItem} 2.1`], [1, `${texts.subItem} 2.2`], [0, `${texts.item} 3`], [1, `${texts.subItem} 3.1`], [2, `${texts.subSubItem} 3.1.1`],
  ];
  const counters = [0, 0, 0];
  return rows.map(([level, text]) => {
    counters[level]!++;
    for (let deeper = level + 1; deeper < counters.length; deeper++) counters[deeper] = 0;
    return `${marker(counters[level]!, level)}${text}`;
  }).join("\n");
};
const exampleUnordered = (texts: SnippetTexts) => exampleList(texts, (_n, level) => `${"  ".repeat(level)}- `);
const exampleOrdered = (texts: SnippetTexts) => exampleList(texts, (n, level) => `${"   ".repeat(level)}${n}. `);

/** The form's first state for `kind`: lists hold the 3-level example, the table 2×2 with headers "Header 1", "Header 2" and an empty row, the tree folder/ + indented file.md, kanban the three default columns with sky, amber, emerald, collapsible summary = texts.collapsibleSummary, colored kinds the info swatch, everything else empty. */
export function newSnippet(kind: SnippetKind, texts: SnippetTexts): SnippetData {
  switch (kind) {
    case "heading-1": case "heading-2": case "heading-3": case "heading-4": return { kind, text: "" };
    case "separator": return { kind };
    case "collapsible": return { kind, summary: texts.collapsibleSummary, body: "" };
    case "unordered-list": return { kind, items: exampleUnordered(texts) };
    case "ordered-list": return { kind, items: exampleOrdered(texts) };
    case "table": return { kind, style: "", fill: "", border: "", rounded: false, color: "", rows: [[`${texts.tableHeader} 1`, `${texts.tableHeader} 2`], ["", ""]] };
    case "kanban": return { kind, columns: texts.kanbanColumns.slice(0, KANBAN_MAX_COLUMNS).map((label, index) => ({ label, color: kanbanColor(undefined, index) })) };
    case "tree": return { kind, items: [{ name: texts.treeFolder, depth: 0 }, { name: texts.treeFile, depth: 1 }] };
    case "code-block": return { kind, language: "", code: "", width: "", align: "" };
    case "compare": return { kind, content: "" };
    case "colored-text": return { kind, color: "info", text: "" };
    case "colored-section": return { kind, color: "info", content: "" };
    case "blockquote": return { kind, type: "", icon: false, title: "", content: "" };
    case "emojis": return { kind, value: "" };
    case "link": return { kind, text: "", url: "" };
    case "doc-link": return { kind, text: "", path: "", title: "" };
    case "anchor-link": return { kind, text: "", anchor: "" };
    case "anchor-doc-link": return { kind, text: "", path: "", anchor: "" };
    case "image": return { kind, alt: "", url: "", width: "", align: "" };
  }
}

const nonBlankLines = (text: string) => text.split("\n").filter((line) => line.trim() !== "");
const indentOf = (line: string) => /^\s*/.exec(line)![0];

function buildUnordered(items: string, texts: SnippetTexts): string {
  const content = items.trim() === "" ? exampleUnordered(texts) : items;
  if (/^\s*[-*+]\s+/m.test(content)) return nonBlankLines(content).join("\n");
  return nonBlankLines(content).map((line) => `${indentOf(line)}- ${line.trim()}`).join("\n");
}

function buildOrdered(items: string, texts: SnippetTexts): string {
  const content = items.trim() === "" ? exampleOrdered(texts) : items;
  if (/^\s*\d+\.\s+/m.test(content)) return nonBlankLines(content).join("\n");
  const counters = new Map<number, number>();
  return nonBlankLines(content).map((line) => {
    const indent = indentOf(line);
    const trimmed = line.trim();
    if (/^[-*+]\s+/.test(trimmed)) return `${indent}${trimmed}`;
    for (const known of [...counters.keys()]) if (known > indent.length) counters.delete(known);
    const next = (counters.get(indent.length) ?? 0) + 1;
    counters.set(indent.length, next);
    return `${indent}${next}. ${trimmed}`;
  }).join("\n");
}

const escapeCell = (cell: string) => cell.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");

function buildTable(data: Extract<SnippetData, { kind: "table" }>): string {
  const directives = [
    data.style ? `<!-- table-style: ${data.style} -->` : "",
    data.fill ? `<!-- table-fill: ${data.fill} -->` : "",
    data.border ? `<!-- table-border: ${data.border} -->` : "",
    data.rounded ? "<!-- table-rounded -->" : "",
    data.color ? `<!-- table-color: ${data.color} -->` : "",
  ].filter(Boolean);
  const columns = data.rows[0]?.length ?? 0;
  if (columns === 0) return directives.join("\n");
  const rows = data.rows.map((row) => Array.from({ length: columns }, (_, c) => escapeCell(row[c] ?? "")));
  const widths = Array.from({ length: columns }, (_, c) => Math.max(3, ...rows.map((row) => row[c]!.length)));
  const line = (row: string[]) => `| ${row.map((cell, c) => cell.padEnd(widths[c]!)).join(" | ")} |`;
  const separator = `| ${widths.map((each) => "-".repeat(each)).join(" | ")} |`;
  return [...directives, line(rows[0]!), separator, ...rows.slice(1).map(line)].join("\n");
}

function buildTree(items: { name: string; depth: number }[], texts: SnippetTexts): string {
  const named = items.filter((each) => each.name.trim() !== "");
  if (named.length === 0) return `\`\`\`text\n${texts.treeEmpty}\n\`\`\``;
  const lines = named.map(({ name, depth }, i) => {
    if (depth <= 0) return name;
    let prefix = "";
    for (let level = 1; level < depth; level++) {
      const next = named.slice(i + 1).find((each) => each.depth <= level);
      prefix += next?.depth === level ? "│   " : "    ";
    }
    const following = named.slice(i + 1).find((each) => each.depth <= depth);
    return `${prefix}${following?.depth === depth ? "├── " : "└── "}${name}`;
  });
  return `\`\`\`text\n${lines.join("\n")}\n\`\`\``;
}

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

function buildKanban(columns: { label: string; color: string }[], texts: SnippetTexts): string {
  const kept = columns
    .slice(0, KANBAN_MAX_COLUMNS)
    .map((column, index) => ({ label: column.label.replace(/\|/g, " ").trim(), color: kanbanColor(column.color, index) }))
    .filter((column) => column.label !== "");
  const used = kept.length > 0 ? kept : texts.kanbanColumns.slice(0, KANBAN_MAX_COLUMNS).map((label, index) => ({ label, color: kanbanColor(undefined, index) }));
  return `<div data-ld-kanban data-columns="${used.map((each) => escapeAttribute(each.label)).join("|")}" data-colors="${used.map((each) => each.color).join("|")}"></div>`;
}

const isMermaid = (language: string) => language.trim().toLowerCase() === "mermaid";

function buildCode(data: Extract<SnippetData, { kind: "code-block" }>, texts: SnippetTexts): string {
  const language = data.language.trim();
  const code = data.code.trim() === "" ? texts.code : data.code;
  const kind = isMermaid(language) ? "mermaid" : "code";
  const directives = [
    isOneOf(WIDTHS, data.width) ? `<!-- ${kind}-width: ${data.width} -->` : "",
    isOneOf(ALIGNS, data.align) ? `<!-- ${kind}-align: ${data.align} -->` : "",
  ].filter(Boolean);
  const longest = Math.max(0, ...[...code.matchAll(/^[ \t]*(`{3,})/gm)].map((each) => each[1]!.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return [...directives, `${fence}${language}\n${code}\n${fence}`].join("\n");
}

function buildQuote(data: Extract<SnippetData, { kind: "blockquote" }>, texts: SnippetTexts): string {
  const content = data.content.trim() === "" ? `${texts.quote}\n\n— ${texts.quoteAuthor}` : data.content;
  const quoted = content.split("\n").map((line) => (line.trim() ? `> ${line}` : ">"));
  const directives = [
    data.type ? `<!-- quote-type: ${data.type} -->` : "",
    oneLine(data.title) ? `<!-- quote-title: ${oneLine(data.title)} -->` : "",
    data.icon ? "<!-- quote-icon -->" : "",
  ].filter(Boolean);
  return [...directives, ...quoted].join("\n");
}

/** The Markdown of a filled form (formats in the brief; fallbacks from `texts`). No trailing newline. */
export function buildSnippet(data: SnippetData, texts: SnippetTexts): string {
  switch (data.kind) {
    case "heading-1": case "heading-2": case "heading-3": case "heading-4":
      return `${"#".repeat(Number(data.kind.slice(-1)))} ${oneLine(data.text) || texts.heading}`;
    case "separator": return "---";
    case "collapsible":
      return `<details>\n<summary>${data.summary.trim() === "" ? texts.collapsibleSummary : data.summary}</summary>\n\n${data.body.trim() === "" ? texts.collapsibleBody : data.body}\n\n</details>`;
    case "unordered-list": return buildUnordered(data.items, texts);
    case "ordered-list": return buildOrdered(data.items, texts);
    case "table": return buildTable(data);
    case "kanban": return buildKanban(data.columns, texts);
    case "tree": return buildTree(data.items, texts);
    case "code-block": return buildCode(data, texts);
    case "compare": return `:::compare\n${data.content}\n:::`;
    case "colored-text": return `<span style="color:${SWATCHES[data.color].border};">${data.text || texts.coloredText}</span>`;
    case "colored-section": {
      const { bg, border, text } = SWATCHES[data.color];
      return `<div style="background:${bg};border-left:4px solid ${border};color:${text};padding:1rem 1.25rem;border-radius:0.375rem;margin:1rem 0;">\n\n${data.content.trim() === "" ? texts.coloredSection : data.content}\n\n</div>`;
    }
    case "blockquote": return buildQuote(data, texts);
    case "emojis": return data.value;
    case "link": return `<a href="${data.url || "https://..."}" target="_blank">${data.text || texts.linkText}</a>`;
    case "doc-link": return `[${data.text || data.title || withoutMd(data.path)}](?doc=${docId(data.path)})`;
    case "anchor-link": return `[${data.text || texts.anchorText}](#${data.anchor || texts.anchor})`;
    case "anchor-doc-link": return `[${data.text || texts.anchorText}](?doc=${docId(data.path)}#${data.anchor || texts.anchor})`;
    case "image": {
      const directives = [width(data.width) ? `<!-- image-width: ${data.width} -->` : "", align(data.align) ? `<!-- image-align: ${data.align} -->` : ""].filter(Boolean);
      return [...directives, `![${data.alt || texts.imageAlt}](${data.url || texts.imageUrl})`].join("\n");
    }
  }
}

// --- reading a snippet back into its form ---

const TABLE_DIRECTIVE = /^<!--\s*table-(?:(?:style|fill|border|color):\s*[a-z][a-z0-9_-]*|rounded)\s*-->$/;
const isTableLine = (line: string) => /^\|.*\|$/.test(line.trim());
const isSeparatorLine = (line: string) => {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.replace(/\s+/g, "")));
};
const tableCells = (line: string) => line.trim().split(/(?<!\\)\|/).slice(1, -1).map((cell) => cell.trim());

function parseTable(markdown: string): SnippetData {
  let style: TableStyle = "";
  let fill: TableFill = "";
  let border: TableBorder = "";
  let rounded = false;
  let color: TableColor = "";
  for (const line of markdown.split("\n")) {
    const directive = /^<!--\s*table-(?:(style|fill|border|color):\s*([a-z][a-z0-9_-]*)|(rounded))\s*-->$/.exec(line.trim());
    if (!directive) continue;
    const [, name, value, bare] = directive;
    if (bare) rounded = true;
    if (name === "style" && isOneOf(TABLE_STYLES, value!)) style = value;
    if (name === "style" && isOneOf(TABLE_FILLS, value!)) fill = value; // legacy: table-style: striped | full
    if (name === "style" && value === "full") rounded = true; // the old Full had rounded corners
    if (name === "style" && value === "bordered") border = "bordered";
    if (name === "fill" && isOneOf(TABLE_FILLS, value!)) fill = value;
    if (name === "border" && isOneOf(TABLE_BORDERS, value!)) border = value;
    if (name === "border" && value === "borderless") border = "";
    if (name === "color" && isOneOf(TABLE_COLORS, value!)) color = value;
  }
  const rows = markdown.split("\n").filter(isTableLine).filter((line) => !isSeparatorLine(line)).map((line) => tableCells(line).map((cell) => cell.replace(/\\\|/g, "|")));
  const columns = Math.max(0, ...rows.map((row) => row.length));
  for (const row of rows) while (row.length < columns) row.push("");
  return { kind: "table", style, fill, border, rounded, color, rows };
}

function parseTree(markdown: string): SnippetData {
  const inner = markdown.replace(/^```text\n/, "").replace(/\n```$/, "");
  return {
    kind: "tree",
    items: inner.split("\n").map((line) => {
      const match = /^((?:│ {3}| {4})*)(?:├── |└── )([\s\S]+)$/.exec(line);
      return match ? { name: match[2]!, depth: match[1]!.length / 4 + 1 } : { name: line, depth: 0 };
    }),
  };
}

const CODE_DIRECTIVE = /^[ \t]*<!--\s*(code|mermaid)-(width|align):\s*(\S+)\s*-->[ \t]*$/;

function parseCode(markdown: string): SnippetData {
  const lines = markdown.trim().split("\n");
  const directives: { kind: string; name: string; value: string }[] = [];
  while (directives.length < 2 && lines.length > 0 && CODE_DIRECTIVE.test(lines[0]!)) {
    const [, kind, name, value] = CODE_DIRECTIVE.exec(lines.shift()!)!;
    directives.push({ kind: kind!, name: name!, value: value! });
  }
  const match = /^(`{3,})[ \t]*([^\n]*)\n([\s\S]*?)\n[ \t]*\1[ \t]*$/.exec(lines.join("\n"));
  if (!match) return { kind: "code-block", language: "", code: "", width: "", align: "" };
  const language = match[2]!.trim();
  const kind = isMermaid(language) ? "mermaid" : "code";
  const valueOf = (name: string) => directives.find((each) => each.kind === kind && each.name === name)?.value ?? "";
  return { kind: "code-block", language, code: match[3]!, width: width(valueOf("width")), align: align(valueOf("align")) };
}

function parseQuote(markdown: string): SnippetData {
  let type: QuoteType = "";
  let title = "";
  let icon = false;
  const content: string[] = [];
  let past = false;
  for (const line of markdown.split("\n")) {
    if (!past) {
      const typed = /^<!--\s*quote-type:\s*([a-z][a-z0-9_-]*)\s*-->$/.exec(line);
      if (typed) {
        const name = QUOTE_ALIASES[typed[1]!] ?? typed[1]!;
        type = isOneOf(QUOTE_TYPES, name) ? name : "";
        continue;
      }
      const titled = /^<!--\s*quote-title:\s*(.+?)\s*-->$/.exec(line);
      if (titled) {
        title = titled[1]!;
        continue;
      }
      if (/^<!--\s*quote-icon\s*-->$/.test(line)) {
        icon = true;
        continue;
      }
      if (line.trim() === "") continue;
      past = true;
    }
    content.push(line.replace(/^>\s?/, ""));
  }
  return { kind: "blockquote", type, icon, title, content: content.join("\n") };
}

function parseImage(markdown: string): SnippetData {
  let imageWidth = "";
  let imageAlign = "";
  for (const line of markdown.trim().split("\n")) {
    const directive = /^<!--\s*image-(width|align):\s*([^\s]+)\s*-->$/.exec(line.trim());
    if (!directive) break;
    if (directive[1] === "width") imageWidth = directive[2]!;
    else imageAlign = directive[2]!;
  }
  const match = /!\[([^\]\n]*?)\]\(([^\n]+?)\)\s*$/.exec(markdown);
  return { kind: "image", alt: match?.[1] ?? "", url: match?.[2] ?? "", width: width(imageWidth), align: align(imageAlign) };
}

/** The form state of a snippet of `kind` written as `markdown` (list indentation and quote markers already removed by the caller); the inverse of buildSnippet for every kind. doc-link / anchor-doc-link: `path` = decoded ?doc= id + ".md", title "". Unparseable parts give the newSnippet-like empty values, never throw. */
export function parseSnippet(kind: SnippetKind, markdown: string): SnippetData {
  const text = markdown.trim();
  switch (kind) {
    case "heading-1": case "heading-2": case "heading-3": case "heading-4":
      return { kind, text: new RegExp(`^#{${kind.slice(-1)}}\\s+(.+)$`).exec(text)?.[1]?.trim() ?? "" };
    case "separator": return { kind };
    case "collapsible": {
      const summary = /<summary>([\s\S]*?)<\/summary>/i.exec(text)?.[1]?.trim() ?? "";
      const body = /<details\b[^>]*>[\s\S]*?<\/summary>\s*\n?([\s\S]*?)\s*<\/details>\s*$/i.exec(text)?.[1]?.trim() ?? "";
      return { kind, summary, body };
    }
    case "unordered-list": case "ordered-list": return { kind, items: text };
    case "table": return parseTable(text);
    case "kanban": return { kind, columns: parseKanbanBlock(text)?.columns ?? [] };
    case "tree": return parseTree(text);
    case "code-block": return parseCode(markdown);
    case "compare": return { kind, content: /^:::compare[ \t]*\n([\s\S]*?)\n?:::[ \t]*$/.exec(text)?.[1] ?? "" };
    case "colored-text": {
      const match = /^<span\s[^>]*color:([^;>"]+)[^>]*>([\s\S]*)<\/span>$/.exec(text);
      return { kind, color: swatchOfBorder(match?.[1]), text: match?.[2] ?? "" };
    }
    case "colored-section": {
      const border = /border-left:[^;]*solid\s+(#[0-9a-fA-F]{6})/.exec(text)?.[1];
      return { kind, color: swatchOfBorder(border), content: /^<div[^>]*>\n\n([\s\S]*?)\n\n<\/div>$/.exec(text)?.[1] ?? "" };
    }
    case "blockquote": return parseQuote(text);
    case "emojis": return { kind, value: markdown };
    case "link": {
      const anchor = /^<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*)<\/a>$/i.exec(text);
      if (anchor) return { kind, text: anchor[2]!, url: anchor[1]! };
      const plain = /^\[([\s\S]*?)\]\(([\s\S]*?)\)$/.exec(text);
      return { kind, text: plain?.[1] ?? "", url: plain?.[2] ?? "" };
    }
    case "doc-link": {
      const match = /^\[([\s\S]*?)\]\(\?doc=([^#]*?)\)$/.exec(text);
      return { kind, text: match?.[1] ?? "", path: match ? `${decode(match[2]!)}.md` : "", title: "" };
    }
    case "anchor-link": {
      const match = /^\[([\s\S]*?)\]\(#([\s\S]*?)\)$/.exec(text);
      return { kind, text: match?.[1] ?? "", anchor: match?.[2] ?? "" };
    }
    case "anchor-doc-link": {
      const match = /^\[([\s\S]*?)\]\(\?doc=([^#]*?)#([\s\S]*?)\)$/.exec(text);
      return { kind, text: match?.[1] ?? "", path: match ? `${decode(match[2]!)}.md` : "", anchor: match?.[3] ?? "" };
    }
    case "image": return parseImage(text);
  }
}

/** The kind whose shape `markdown` has (trimmed), as the original's detectSnippetType did (its order of tests), restricted to the 22 kinds; also recognizes the `<a href=… target="_blank">` link; null otherwise. */
export function detectSnippet(markdown: string): SnippetKind | null {
  const t = markdown.trim();
  if (/^\[.*?\]\(\?doc=.+#.+\)$/.test(t)) return "anchor-doc-link";
  if (/^\[.*?\]\(\?doc=.+\)$/.test(t)) return "doc-link";
  if (/^\[.*?\]\(#.+\)$/.test(t)) return "anchor-link";
  if (/^<!--\s*image-(?:width|align):/.test(t) || /^!\[.*?\]\(.*?\)$/.test(t)) return "image";
  if (/^\[.*?\]\(.*?\)$/.test(t) || /^<a\s[^>]*href=[^>]*>[\s\S]*<\/a>$/i.test(t)) return "link";
  if (/^<details[\s>]/i.test(t)) return "collapsible";
  if (/^<span\s[^>]*color:[^>]*>[\s\S]*<\/span>$/.test(t)) return "colored-text";
  if (/^<div\s+data-ld-kanban\b[^>]*>\s*<\/div>$/i.test(t)) return "kanban";
  if (/^<div\s[^>]*border-left[^>]*>/.test(t)) return "colored-section";
  if (/^```text\n/.test(t) && /[├└│]/.test(t)) return "tree";
  if (/^:::compare[ \t]*\n/.test(t)) return "compare";
  if (/^<!--\s*(?:code|mermaid)-(?:width|align):/.test(t) || /^```/.test(t)) return "code-block";
  const lines = t.split("\n");
  const body = lines.slice(lines.findIndex((line) => !TABLE_DIRECTIVE.test(line.trim()) && line.trim() !== ""));
  const rows = body.filter(isTableLine);
  if (rows.length >= 2 && isTableLine(body[0]!) && isSeparatorLine(rows[1]!)) return "table";
  if (/^<!--\s*quote-(?:type|title|icon)/.test(t) || /^> /.test(t)) return "blockquote";
  const heading = /^(#{1,4}) [^\n]+$/.exec(t);
  if (heading) return `heading-${heading[1]!.length}` as SnippetKind;
  if (t === "---") return "separator";
  if (/^1\. /.test(t)) return "ordered-list";
  if (/^[-*+] /.test(t)) return "unordered-list";
  return null;
}

const parser = unified().use(remarkParse).use(remarkGfm);

type Node = { type: string; depth?: number; value?: string; children?: Node[] };

const plainText = (node: Node): string => (node.type === "html" ? "" : (node.value ?? (node.children ?? []).map(plainText).join("")));

/** The headings of a Document's text for anchor pickers (R8): depth, plain text, id = headingId(text) from ./links.ts; headings in fenced code and `:::compare` regions are ignored. */
export function documentHeadings(text: string): { depth: number; text: string; id: string }[] {
  const body = text.slice(parseDocument(text, "").bodyStart);
  // " \n" for "\r\n": the same length, and the compare markers match at the end of their line.
  const regions = compareRegions(body.replace(/\r\n/g, " \n"));
  const masked = regions.reduceRight((rest, region) => rest.slice(0, region.from) + rest.slice(region.from, region.to).replace(/[^\r\n]/g, " ") + rest.slice(region.to), body);
  const found: { depth: number; text: string; id: string }[] = [];
  const visit = (node: Node) => {
    if (node.type === "heading") {
      const plain = plainText(node).trim();
      found.push({ depth: node.depth!, text: plain, id: headingId(plain) });
      return;
    }
    node.children?.forEach(visit);
  };
  visit(parser.parse(masked) as Root as Node);
  return found;
}
