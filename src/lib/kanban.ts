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
