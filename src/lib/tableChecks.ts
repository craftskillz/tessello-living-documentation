// Check boxes of a table (the `table-checkboxes` directive): the first cell of each body row holds `[ ]` or `[x]` in the
// Markdown, or nothing (unchecked). Pure: render.ts draws the boxes, markerWrites.ts writes a tick.

import type { TextRange } from "./edits.ts";

/**
 * The check box written in a first cell, given the cell's source (as remark gives it: its leading `|`, the content, the
 * spaces up to the next `|`). `range` is relative to that source: the `[ ]`/`[x]`, or for an empty cell the spaces after
 * the `|` (what a tick replaces). Null when the cell holds anything else: it shows as written, without a box.
 */
export function checkOfCell(source: string): { checked: boolean; range: TextRange } | null {
  const lead = source.startsWith("|") ? 1 : 0;
  const content = source.slice(lead);
  if (content.trim() === "") return { checked: false, range: { from: lead, to: source.length } };
  const box = /^(\s*)\[([ xX])\]\s*$/.exec(content);
  if (!box) return null;
  const from = lead + box[1]!.length;
  return { checked: box[2] !== " ", range: { from, to: from + 3 } };
}

/** What the source of a check box (`[ ]`, `[x]`, or the spaces of an empty cell) becomes when it is ticked or unticked. */
export const toggledCheck = (source: string): string => (/^\[[xX]\]$/.test(source) ? "[ ]" : source === "[ ]" ? "[x]" : " [x] ");

