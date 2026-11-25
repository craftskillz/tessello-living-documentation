// The Kanban block of a Document (docs/spec/kanban-boards.md): a line of raw HTML as the original wrote it,
// `<div data-ld-kanban data-columns="To do|Doing" data-colors="sky|amber"></div>`. Pure: reads that line only.

export type KanbanColor = "sky" | "amber" | "emerald" | "rose" | "violet" | "slate";

export interface KanbanBlock {
  columns: { label: string; color: KanbanColor }[];
}

const COLORS: readonly KanbanColor[] = ["sky", "amber", "emerald", "rose", "violet", "slate"];
const MAX_COLUMNS = 6;

const attribute = (html: string, name: string): string[] => {
  const value = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(html)?.[1] ?? "";
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&").split("|");
};

/** The columns of the block written in `html`, or null when the text is not a Kanban block. */
export function parseKanbanBlock(html: string): KanbanBlock | null {
  if (!/^<div\s+data-ld-kanban\b[^\n]*<\/div>[ \t]*$/i.test(html.trim())) return null;
  const colors = attribute(html, "data-colors").map((each) => each.trim().toLowerCase());
  const columns = attribute(html, "data-columns")
    .map((label, index) => ({ label: label.trim(), color: COLORS.find((each) => each === colors[index]) ?? COLORS[index % COLORS.length]! }))
    .filter((column) => column.label !== "")
    .slice(0, MAX_COLUMNS);
  return { columns };
}

/** The folder name of a column labelled `label` (R3); "" when nothing is left. */
export function columnFolder(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export interface BoardColumn {
  label: string;
  color: KanbanColor;
  /** Its folder's path from the Project folder. */
  folder: string;
}

/** The columns of `block` on the board Document at `boardPath`: duplicates of a folder (ignoring case) after the first, and labels without a folder name, left out. */
export function boardColumns(block: KanbanBlock, boardPath: string): BoardColumn[] {
  const parent = boardPath.includes("/") ? boardPath.slice(0, boardPath.lastIndexOf("/") + 1) : "";
  const seen = new Set<string>();
  return block.columns.flatMap(({ label, color }) => {
    const name = columnFolder(label);
    if (name === "" || seen.has(name.toLowerCase())) return [];
    seen.add(name.toLowerCase());
    return [{ label, color, folder: parent + name }];
  });
}

const DESCRIPTION_LENGTH = 140;

/** The text of one line of Markdown as a segment of the description; "" when the line says nothing. */
function segmentOf(line: string): string {
  const trimmed = line.trim();
  if (trimmed === "" || (/^\|?[\s:|-]+\|?$/.test(trimmed) && trimmed.includes("-"))) return "";
  if (trimmed.startsWith("|")) return trimmed.split("|").map((cell) => cell.trim()).filter((cell) => cell !== "").join(" · ");
  const item = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(trimmed);
  if (item) return `• ${item[1]}`;
  return trimmed.replace(/^#{1,6}\s+/, "").replace(/^>+\s?/, "");
}

const withoutMarks = (text: string): string =>
  text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|~~|[*_`]/g, "");

/** A card's description: the text between its title and its `## Content` heading, as one line of at most 140 characters then "…". */
export function cardDescription(text: string): string {
  const body = text.replace(/^---[\s\S]*?\n---\s*/, "").replace(/^#\s+.*(?:\r?\n|$)/, "");
  const stop = body.search(/^##\s+(?:Content|Contenu)\s*$/im);
  const line = (stop >= 0 ? body.slice(0, stop) : body)
    .split(/\r?\n/)
    .map(segmentOf)
    .filter((segment) => segment !== "")
    .join(" ");
  const one = withoutMarks(line).replace(/\s+/g, " ").trim();
  return one.length > DESCRIPTION_LENGTH ? `${one.slice(0, DESCRIPTION_LENGTH)}…` : one;
}
