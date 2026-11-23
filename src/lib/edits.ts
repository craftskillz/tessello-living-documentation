// Text edits (docs/design.md §2): pure. Section editor, snippets, Tag markers and restores all produce TextEdits against
// source ranges of the Document's text; this is the one place where they are spliced.

export interface TextRange {
  from: number;
  to: number;
}

export interface TextEdit {
  range: TextRange;
  text: string;
}

/** Applies non-overlapping edits given in any order (offsets all refer to the original `text`). Throws RangeError on overlap or a range outside the text. Two inserts at the same offset keep their given order. */
export function applyEdits(text: string, edits: TextEdit[]): string {
  for (const { range } of edits) {
    if (!Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < 0 || range.to < range.from || range.to > text.length) {
      throw new RangeError(`Edit range ${range.from}-${range.to} is outside the text (length ${text.length}).`);
    }
  }
  // Array.prototype.sort is stable: equal offsets keep their given order.
  const sorted = [...edits].sort((a, b) => a.range.from - b.range.from || a.range.to - b.range.to);
  let result = "";
  let cursor = 0;
  for (const { range, text: replacement } of sorted) {
    if (range.from < cursor) throw new RangeError(`Edit range ${range.from}-${range.to} overlaps another edit.`);
    result += text.slice(cursor, range.from) + replacement;
    cursor = range.to;
  }
  return result + text.slice(cursor);
}
