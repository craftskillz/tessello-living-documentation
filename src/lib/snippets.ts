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
import { CARD_COLORS as CARD_COLOR_NAMES, CARD_STYLES as CARD_STYLE_NAMES, parseCardComment, parseColumnComment } from "./directives.ts";
import { compareRegions } from "./render.ts";

export type SnippetKind =
  | "heading-1" | "heading-2" | "heading-3" | "heading-4" | "separator" | "collapsible" | "columns" | "card" | "unordered-list" | "ordered-list" | "table" | "kanban"
  | "tree" | "code-block" | "mermaid" | "compare"
  | "colored-text" | "colored-section" | "blockquote" | "emojis"
  | "link" | "doc-link" | "anchor-link" | "anchor-doc-link" | "image" | "attachment";

export type SnippetCategory = "structure" | "code" | "rich-text" | "links-media";

/** The picker's categories, with their kinds in display order. */
export const SNIPPET_CATEGORIES: readonly { key: SnippetCategory; kinds: readonly SnippetKind[] }[] = [
  { key: "structure", kinds: ["heading-1", "heading-2", "heading-3", "heading-4", "separator", "collapsible", "columns", "card", "unordered-list", "ordered-list", "table", "kanban"] },
  { key: "code", kinds: ["tree", "code-block", "mermaid", "compare"] },
  { key: "rich-text", kinds: ["colored-text", "colored-section", "blockquote", "emojis"] },
  { key: "links-media", kinds: ["link", "doc-link", "anchor-link", "anchor-doc-link", "image", "attachment"] },
];

/** Kinds the reading view reopens in their form (all but emojis and kanban). */
export const EDITABLE_KINDS: ReadonlySet<SnippetKind> = new Set(SNIPPET_CATEGORIES.flatMap((each) => each.kinds).filter((kind) => kind !== "emojis" && kind !== "kanban"));

const WITH_PREVIEW: ReadonlySet<SnippetKind> = new Set(["separator", "columns", "card", "kanban", "mermaid", "compare", "emojis", "link", "doc-link", "anchor-link", "anchor-doc-link", "image"]);

/** Whether the dialog shows the Markdown preview for `kind` (the other kinds have their own live preview). */
export function showsPreview(kind: SnippetKind): boolean {
  return WITH_PREVIEW.has(kind);
}

export type Swatch = "info" | "success" | "warning" | "danger" | "note" | "neutral";
export type TableStyle = "" | "compact" | "intermediate";
export type TableFill = "" | "striped" | "full";
export type TableBorder = "" | "bordered" | "soft-bordered";
export type TableColor = "" | "info" | "success" | "warning" | "danger" | "note";
/** A card's style; "" is the default, plain. */
export type CardStyle = "" | "plain" | "bristol" | "deck";
export const CARD_STYLES: readonly Exclude<CardStyle, "">[] = CARD_STYLE_NAMES;
/** A card's background; "" keeps the style's own (white, cream paper, white face). */
export type CardColor = "" | (typeof CARD_COLOR_NAMES)[number];
export const CARD_COLORS: readonly Exclude<CardColor, "">[] = CARD_COLOR_NAMES;
/** Each background with the ink of its text and the colour of its title, chosen for it (document.css and the HTML pages repeat them). */
export const CARD_PALETTE: Record<Exclude<CardColor, "">, { bg: string; ink: string; title: string }> = {
  white: { bg: "#ffffff", ink: "#374151", title: "#111827" },
  cream: { bg: "#fdf8e7", ink: "#3f3a2e", title: "#8a5a00" },
  lemon: { bg: "#fef9c3", ink: "#422006", title: "#854d0e" },
  peach: { bg: "#ffedd5", ink: "#431407", title: "#c2410c" },
  rose: { bg: "#ffe4e6", ink: "#4c0519", title: "#be123c" },
  lavender: { bg: "#ede9fe", ink: "#2e1065", title: "#6d28d9" },
  sky: { bg: "#e0f2fe", ink: "#082f49", title: "#0369a1" },
  mint: { bg: "#dcfce7", ink: "#052e16", title: "#15803d" },
  sage: { bg: "#e7efe3", ink: "#1f2d1a", title: "#3f6212" },
  slate: { bg: "#e2e8f0", ink: "#1e293b", title: "#334155" },
  navy: { bg: "#1e293b", ink: "#e2e8f0", title: "#fde68a" },
  forest: { bg: "#14532d", ink: "#ecfdf5", title: "#bbf7d0" },
};
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
  column: string;
  /** The placeholder content of a new card. */
  card: string;
  attachment: string;
  attachmentUrl: string;
  mermaidItem: string;
  mermaidPeriod: string;
  mermaidEvent: string;
  mermaidNode: string;
  mermaidParticipant: string;
  mermaidMessage: string;
  /** The examples a new Mermaid form starts with. */
  mermaid: {
    pieTitle: string;
    pie: readonly { label: string; value: number }[];
    timelineTitle: string;
    timeline: readonly { period: string; event: string }[];
    tree: readonly { level: number; label: string; decorator: string; note: string }[];
    sequence: readonly SequenceRow[];
  };
}

export type MermaidChart = "pie" | "timeline" | "tree-view" | "sequence";
export type SequenceArrow = "->>" | "-->>" | "--x" | "-x" | "-->" | "->";
export type NotePosition = "left of" | "right of" | "over";
export type SequenceRow =
  | { type: "message"; from: string; arrow: SequenceArrow; to: string; message: string }
  | { type: "note"; position: NotePosition; participant: string; text: string };

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
  | { kind: "image"; alt: string; url: string; width: Width; align: Align }
  | { kind: "mermaid"; chart: MermaidChart; pieTitle: string; pie: { label: string; value: number }[]; timelineTitle: string; timeline: { period: string; event: string }[]; tree: { level: number; label: string; decorator: string; note: string }[]; sequence: SequenceRow[] }
  | { kind: "columns"; count: number; ratio: string; verticalAlign: "" | "top" | "center" | "bottom" | "stretch"; textAlign: "" | "left" | "center" | "right" | "justify"; gap: "" | "sm" | "md" | "lg"; body: string | null }
  /** `body`: the content of a reopened card, kept byte for byte; null for a new one (a placeholder). `style` "" is plain. */
  | { kind: "card"; title: string; style: CardStyle; color: CardColor; width: Width; align: Align; body: string | null }
  | { kind: "attachment"; text: string; url: string };

/** The options of the forms, in the order the dialog offers them (the empty value, "default" or "none", left out). */
export const WIDTHS: readonly Exclude<Width, "">[] = ["full", "3/4", "2/3", "1/2", "1/3", "1/4"];
export const ALIGNS: readonly Exclude<Align, "">[] = ["left", "center", "right"];
export const TABLE_STYLES: readonly Exclude<TableStyle, "">[] = ["intermediate", "compact"];
export const TABLE_FILLS: readonly Exclude<TableFill, "">[] = ["striped", "full"];
export const TABLE_BORDERS: readonly Exclude<TableBorder, "">[] = ["bordered", "soft-bordered"];
export const TABLE_COLORS: readonly Exclude<TableColor, "">[] = ["info", "success", "warning", "danger", "note"];
export const MERMAID_CHARTS: readonly MermaidChart[] = ["pie", "timeline", "tree-view", "sequence"];
export const SEQUENCE_ARROWS: readonly SequenceArrow[] = ["->>", "-->>", "--x", "-x", "-->", "->"];
export const NOTE_POSITIONS: readonly NotePosition[] = ["left of", "right of", "over"];
export const COLUMN_COUNTS: readonly number[] = [2, 3, 4];
export const VERTICAL_ALIGNS: readonly ("top" | "center" | "bottom" | "stretch")[] = ["top", "center", "bottom", "stretch"];
export const TEXT_ALIGNS: readonly ("left" | "center" | "right" | "justify")[] = ["left", "center", "right", "justify"];
export const GAPS: readonly ("sm" | "md" | "lg")[] = ["sm", "md", "lg"];
/** The deepest level of a Mermaid tree view row. */
export const MAX_TREE_LEVEL = 6;
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
    case "attachment": return { kind, text: "", url: "" };
    case "columns": return { kind, count: 2, ratio: "", verticalAlign: "", textAlign: "", gap: "", body: null };
    case "card": return { kind, title: "", style: "", color: "", width: "", align: "", body: null };
    case "mermaid": return {
      kind, chart: "pie", pieTitle: texts.mermaid.pieTitle, pie: texts.mermaid.pie.map((each) => ({ ...each })),
      timelineTitle: texts.mermaid.timelineTitle, timeline: texts.mermaid.timeline.map((each) => ({ ...each })),
      tree: texts.mermaid.tree.map((each) => ({ ...each })), sequence: texts.mermaid.sequence.map((each) => ({ ...each })),
    };
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

type MermaidData = Extract<SnippetData, { kind: "mermaid" }>;
type ColumnsData = Extract<SnippetData, { kind: "columns" }>;

/** One line: whitespace runs become one space, edges trimmed. */
const cleanLine = (text: string) => text.replace(/\s+/g, " ").trim();
const fence = (...lines: string[]) => ["```mermaid", ...lines, "```"].join("\n");

function buildMermaid(data: MermaidData, texts: SnippetTexts): string {
  switch (data.chart) {
    case "timeline": {
      const grouped = new Map<string, string[]>();
      data.timeline.forEach((row, i) => {
        const period = cleanLine(row.period) || `${texts.mermaidPeriod} ${i + 1}`;
        grouped.set(period, [...(grouped.get(period) ?? []), cleanLine(row.event) || `${texts.mermaidEvent} ${i + 1}`]);
      });
      return fence("timeline", `    title ${cleanLine(data.timelineTitle) || texts.mermaid.timelineTitle}`, ...[...grouped].map(([period, events]) => `    ${period} : ${events.join(" : ")}`));
    }
    case "tree-view":
      return fence("treeView-beta", ...data.tree.map((row, i) => {
        const level = Number.isFinite(row.level) ? Math.min(MAX_TREE_LEVEL, Math.max(0, Math.round(row.level))) : 0;
        const decorator = cleanLine(row.decorator);
        const note = cleanLine(row.note);
        return `${" ".repeat((level + 1) * 4)}${cleanLine(row.label) || `${texts.mermaidNode} ${i + 1}`}${decorator ? ` ${decorator}` : ""}${note ? ` ## ${note}` : ""}`;
      }));
    case "sequence":
      return fence("sequenceDiagram", ...data.sequence.map((row, i) => {
        const message = (value: string) => cleanLine(value) || `${texts.mermaidMessage} ${i + 1}`;
        const actor = (value: string) => cleanLine(value) || `${texts.mermaidParticipant} ${i + 1}`;
        if (row.type === "note") return `    Note ${isOneOf(NOTE_POSITIONS, row.position) ? row.position : "right of"} ${actor(row.participant)}: ${message(row.text)}`;
        return `    ${actor(row.from)} ${isOneOf(SEQUENCE_ARROWS, row.arrow) ? row.arrow : "->>"} ${actor(row.to)}: ${message(row.message)}`;
      }));
    case "pie":
      return fence(`pie title ${cleanLine(data.pieTitle) || texts.mermaid.pieTitle}`, ...data.pie.map((row, i) => {
        const label = (cleanLine(row.label) || `${texts.mermaidItem} ${i + 1}`).replace(/"/g, '\\"');
        return `         "${label}" : ${Number.isFinite(row.value) && row.value >= 0 ? String(row.value) : "0"}`;
      }));
  }
}

function buildColumns(data: ColumnsData, texts: SnippetTexts): string {
  const options = [
    data.ratio.trim(),
    data.verticalAlign && data.verticalAlign !== "center" ? `vertical-align: ${data.verticalAlign}` : "",
    data.textAlign ? `text-align: ${data.textAlign}` : "",
    data.gap && data.gap !== "md" ? `gap: ${data.gap}` : "",
  ].filter(Boolean);
  const header = options.length > 0 ? `<!-- layout-columns: ${options.join(" | ")} -->` : "<!-- layout-columns -->";
  if (data.body !== null) return `${header}${data.body}<!-- /layout-columns -->`;
  const count = Math.max(2, Math.min(6, Math.round(Number(data.count)) || 2));
  const columns = Array.from({ length: count }, (_, i) => `<!-- col -->\n\n${texts.column} ${i + 1}`);
  return `${header}\n\n${columns.join("\n\n")}\n\n<!-- /layout-columns -->`;
}

type CardData = Extract<SnippetData, { kind: "card" }>;

/** A card: its comment (the title, then the options that differ from plain, full width, left), its content, its closing comment. */
function buildCard(data: CardData, texts: SnippetTexts): string {
  // The title lives in a comment, between options separated by "|": neither may appear in it.
  const title = cleanLine(data.title).replace(/\|/g, "/").replace(/--/g, "—");
  const options = [
    data.style && data.style !== "plain" ? `style: ${data.style}` : "",
    data.color ? `color: ${data.color}` : "",
    data.width && data.width !== "full" ? `width: ${data.width}` : "",
    data.align && data.align !== "left" ? `align: ${data.align}` : "",
  ].filter(Boolean);
  const header = `<!-- ${[title ? `card: ${title}` : "card", ...options].join(" | ")} -->`;
  if (data.body !== null) return `${header}${data.body}<!-- /card -->`;
  return `${header}\n\n${texts.card}\n\n<!-- /card -->`;
}

/** The form state of a card written as `markdown`: its options, and its content kept as it is. */
function parseCard(markdown: string): CardData {
  const open = /^<!--([\s\S]*?)-->/.exec(markdown);
  const comment = open ? parseCardComment(open[1]!) : null;
  const options = comment?.kind === "open" ? comment.options : null;
  const afterOpen = open ? open[0].length : 0;
  const closing = /<!--\s*\/card\s*-->\s*$/i.exec(markdown);
  const pick = <T extends string>(allowed: readonly T[], value: string | null | undefined): T | "" => (value && isOneOf(allowed, value) ? value : "");
  return {
    kind: "card", title: options?.title ?? "", style: pick(CARD_STYLES, options?.style), color: pick(CARD_COLORS, options?.color), width: pick(WIDTHS, options?.width), align: pick(ALIGNS, options?.align),
    body: markdown.slice(afterOpen, closing && closing.index >= afterOpen ? closing.index : markdown.length),
  };
}

function buildAttachment(data: Extract<SnippetData, { kind: "attachment" }>, texts: SnippetTexts): string {
  const url = data.url.trim() || texts.attachmentUrl;
  const name = data.url.trim() === "" ? "" : decode(url.split(/[?#]/)[0]!.split("/").filter(Boolean).at(-1) ?? "");
  const text = oneLine(data.text) || name || texts.attachment;
  return `[📎 ${text.replace(/[[\]\\]/g, "\\$&")}](${url})`;
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
    case "mermaid": return buildMermaid(data, texts);
    case "columns": return buildColumns(data, texts);
    case "card": return buildCard(data, texts);
    case "attachment": return buildAttachment(data, texts);
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

const SEQUENCE_ARROW = SEQUENCE_ARROWS.map((each) => each.replace(/[-]/g, "\\-")).join("|");
const SEQUENCE_MESSAGE = new RegExp(`^(.+?) (${SEQUENCE_ARROW}) (.+?): (.+)$`);
const SEQUENCE_NOTE = /^Note (left of|right of|over) (.+?): (.+)$/;
const PIE_ROW = /^"((?:[^"\\]|\\.)*)"\s*:\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i;

/** The rows of the chart `lines` hold (already past the header), or null when one line is not of the chart's row grammar. */
function parseRows(chart: MermaidChart, lines: string[], into: MermaidData): boolean {
  const rows = lines.filter((line) => line.trim() !== "");
  if (chart === "pie") {
    const pie: MermaidData["pie"] = [];
    for (const line of rows) {
      const match = PIE_ROW.exec(line.trim());
      if (!match) return false;
      pie.push({ label: match[1]!.replace(/\\"/g, '"'), value: Number(match[2]) });
    }
    into.pie = pie;
  } else if (chart === "timeline") {
    let title = "";
    if (rows[0] && /^\s*title(?:\s+|$)/.test(rows[0])) title = rows.shift()!.trim().replace(/^title\s*/, "");
    const timeline: MermaidData["timeline"] = [];
    for (const line of rows) {
      const [period, ...events] = line.trim().split(/\s+:\s+/);
      if (!period || events.length === 0 || events.some((each) => each === "") || period.includes(" : ")) return false;
      for (const event of events) timeline.push({ period, event });
    }
    into.timelineTitle = title;
    into.timeline = timeline;
  } else if (chart === "tree-view") {
    const tree: MermaidData["tree"] = [];
    for (const line of rows) {
      const indent = /^ */.exec(line)![0].length;
      if (indent < 4 || indent % 4 !== 0 || indent / 4 - 1 > MAX_TREE_LEVEL || line.includes("\t")) return false;
      const text = line.slice(indent);
      const marker = text.indexOf(" ## ");
      const head = marker < 0 ? text : text.slice(0, marker);
      const note = marker < 0 ? "" : text.slice(marker + 4);
      const split = /( :::| icon\()/.exec(head)?.index ?? -1;
      const label = split < 0 ? head : head.slice(0, split);
      if (label.trim() === "") return false;
      tree.push({ level: indent / 4 - 1, label, decorator: split < 0 ? "" : head.slice(split + 1), note });
    }
    into.tree = tree;
  } else {
    const sequence: SequenceRow[] = [];
    for (const line of rows) {
      const text = line.trim();
      const note = SEQUENCE_NOTE.exec(text);
      const message = note ? null : SEQUENCE_MESSAGE.exec(text);
      if (text.startsWith("%%")) return false;
      if (note) sequence.push({ type: "note", position: note[1] as NotePosition, participant: note[2]!, text: note[3]! });
      else if (message) sequence.push({ type: "message", from: message[1]!, arrow: message[2] as SequenceArrow, to: message[3]!, message: message[4]! });
      else return false;
    }
    into.sequence = sequence;
  }
  return true;
}

/** The builder rows of a Mermaid block written by the Mermaid Builder, or null when it is not exactly one of its four shapes. The other charts' rows are the examples of `texts` (empty without). */
export function parseMermaid(markdown: string, texts?: SnippetTexts): MermaidData | null {
  const lines = markdown.trim().split("\n");
  const open = /^(`{3,})[ \t]*mermaid[ \t]*$/i.exec(lines[0] ?? "");
  const close = /^(`{3,})[ \t]*$/.exec(lines.at(-1) ?? "");
  if (!open || !close || lines.length < 2 || close[1]!.length < open[1]!.length) return null;
  const content = lines.slice(1, -1);
  const first = content.findIndex((line) => line.trim() !== "");
  if (first < 0) return null;
  const header = content[first]!.trim();
  const data = newSnippet("mermaid", texts ?? EMPTY_TEXTS) as MermaidData;
  const pie = /^pie(?:[ \t]+title(?:[ \t]+(.*))?)?$/.exec(header);
  let chart: MermaidChart;
  if (pie) {
    chart = "pie";
    data.pieTitle = (pie[1] ?? "").trim();
  } else if (header === "timeline") chart = "timeline";
  else if (header === "treeView-beta") chart = "tree-view";
  else if (header === "sequenceDiagram") chart = "sequence";
  else return null;
  data.chart = chart;
  return parseRows(chart, content.slice(first + 1), data) ? data : null;
}

const EMPTY_TEXTS = { mermaid: { pieTitle: "", pie: [], timelineTitle: "", timeline: [], tree: [], sequence: [] } } as unknown as SnippetTexts;

function parseColumns(markdown: string): ColumnsData {
  const open = /^<!--([\s\S]*?)-->/.exec(markdown);
  const comment = open ? parseColumnComment(open[1]!) : null;
  const options = comment?.kind === "open" ? comment.options : null;
  const afterOpen = open ? open[0].length : 0;
  const closing = /<!--\s*\/layout-columns\s*-->\s*$/i.exec(markdown);
  const body = markdown.slice(afterOpen, closing && closing.index >= afterOpen ? closing.index : markdown.length);
  const parts = body.split(/<!--\s*col\s*-->/i);
  const count = Math.max(1, parts.length - 1 + (parts[0]!.trim() === "" ? 0 : 1));
  const pick = <T extends string>(options_: readonly T[], value: string | null | undefined): T | "" => (value && isOneOf(options_, value) ? value : "");
  return {
    kind: "columns", count, ratio: options?.ratio ?? "", body,
    verticalAlign: pick(VERTICAL_ALIGNS, options?.verticalAlign), textAlign: pick(TEXT_ALIGNS, options?.textAlign), gap: pick(GAPS, options?.gap),
  };
}

/** The form state of a snippet of `kind` written as `markdown` (list indentation and quote markers already removed by the caller); the inverse of buildSnippet for every kind. doc-link / anchor-doc-link: `path` = decoded ?doc= id + ".md", title "". Unparseable parts give the newSnippet-like empty values, never throw. */
export function parseSnippet(kind: SnippetKind, markdown: string, texts?: SnippetTexts): SnippetData {
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
    case "mermaid": return parseMermaid(text, texts) ?? newSnippet("mermaid", texts ?? EMPTY_TEXTS);
    case "columns": return parseColumns(text);
    case "card": return parseCard(text);
    case "attachment": {
      const match = /^\[📎 ?((?:[^\]\\]|\\[\s\S])*)\]\(([^\n]*)\)$/.exec(text);
      return { kind, text: (match?.[1] ?? "").replace(/\\([[\]\\])/g, "$1"), url: match?.[2] ?? "" };
    }
  }
}

/** The kind whose shape `markdown` has (trimmed), as the original's detectSnippetType did (its order of tests), restricted to the 25 kinds; also recognizes the `<a href=… target="_blank">` link; null otherwise. */
export function detectSnippet(markdown: string): SnippetKind | null {
  const t = markdown.trim();
  if (/^<!--\s*layout-columns\b[\s\S]*<!--\s*\/layout-columns\s*-->$/i.test(t)) return "columns";
  if (/^<!--\s*card(?![\w-])[\s\S]*<!--\s*\/card\s*-->$/i.test(t)) return "card";
  if (/^\[.*?\]\(\?doc=.+#.+\)$/.test(t)) return "anchor-doc-link";
  if (/^\[.*?\]\(\?doc=.+\)$/.test(t)) return "doc-link";
  if (/^\[.*?\]\(#.+\)$/.test(t)) return "anchor-link";
  if (/^<!--\s*image-(?:width|align):/.test(t) || /^!\[.*?\]\(.*?\)$/.test(t)) return "image";
  if (/^\[📎(?:[^\]\\]|\\[\s\S])*\]\([^\n]*\)$/.test(t)) return "attachment";
  if (/^\[.*?\]\(.*?\)$/.test(t) || /^<a\s[^>]*href=[^>]*>[\s\S]*<\/a>$/i.test(t)) return "link";
  if (/^<details[\s>]/i.test(t)) return "collapsible";
  if (/^<span\s[^>]*color:[^>]*>[\s\S]*<\/span>$/.test(t)) return "colored-text";
  if (/^<div\s+data-ld-kanban\b[^>]*>\s*<\/div>$/i.test(t)) return "kanban";
  if (/^<div\s[^>]*border-left[^>]*>/.test(t)) return "colored-section";
  if (/^```text\n/.test(t) && /[├└│]/.test(t)) return "tree";
  if (/^:::compare[ \t]*\n/.test(t)) return "compare";
  if (parseMermaid(t) !== null) return "mermaid";
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
