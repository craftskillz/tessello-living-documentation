// A minimal line diff (Myers, O(ND)) of two texts, laid out side by side.

import type { TextEdit } from "./edits.ts";

export interface DiffRow {
  /** same: identical line; changed: a line of mine replaced by a line of theirs; removed: only in mine; added: only in theirs. */
  kind: "same" | "changed" | "removed" | "added";
  /** The line text without its line ending; null on an "added" row. */
  mine: string | null;
  /** Null on a "removed" row. */
  theirs: string | null;
  /** 1-based line number in mine, null when mine is null. */
  mineLine: number | null;
  theirsLine: number | null;
}

type Op = "same" | "removed" | "added";

function toLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** The number of lines two texts share, in order (the length of a longest common subsequence), by Myers' O(ND) walk. */
export function sharedLines(a: string[], b: string[]): number {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const furthest = new Int32Array(2 * max + 2);
  for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && furthest[max + k - 1]! < furthest[max + k + 1]!) ? furthest[max + k + 1]! : furthest[max + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) (x++, y++);
      furthest[max + k] = x;
      if (x >= n && y >= m) return (n + m - d) / 2;
    }
  }
  return 0;
}

/** The edit script turning a into b with the fewest insertions and deletions. */
function myers(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Array<number>(2 * max + 3).fill(0);
  const trace: number[][] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
          ? v[offset + k + 1]
          : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  // Walk the trace back from (n, m) to (0, 0).
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d];
    const k = x - y;
    const prevK =
      k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1]) ? k + 1 : k - 1;
    const prevX = vd[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push("same");
      x--;
      y--;
    }
    if (d > 0) ops.push(x === prevX ? "added" : "removed");
    x = prevX;
    y = prevY;
  }
  return ops.reverse();
}

export function sideBySide(mine: string, theirs: string): DiffRow[] {
  const a = toLines(mine);
  const b = toLines(theirs);
  const ops = myers(a, b);
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  let o = 0;
  while (o < ops.length) {
    if (ops[o] === "same") {
      rows.push({ kind: "same", mine: a[i], theirs: b[j], mineLine: i + 1, theirsLine: j + 1 });
      i++;
      j++;
      o++;
      continue;
    }
    const removed: number[] = [];
    const added: number[] = [];
    // A whole run of changes between two same lines, whatever the order inside it.
    for (; o < ops.length && ops[o] !== "same"; o++) {
      if (ops[o] === "removed") removed.push(i++);
      else added.push(j++);
    }
    const paired = Math.min(removed.length, added.length);
    for (let p = 0; p < paired; p++) {
      rows.push({ kind: "changed", mine: a[removed[p]], theirs: b[added[p]], mineLine: removed[p] + 1, theirsLine: added[p] + 1 });
    }
    for (const r of removed.slice(paired)) {
      rows.push({ kind: "removed", mine: a[r], theirs: null, mineLine: r + 1, theirsLine: null });
    }
    for (const t of added.slice(paired)) {
      rows.push({ kind: "added", mine: null, theirs: b[t], mineLine: null, theirsLine: t + 1 });
    }
  }
  return rows;
}

/** A run of rows shown, or a run of unchanged rows folded behind a bar; `key` stays the same for the same comparison. */
export type Segment = { kind: "rows"; rows: DiffRow[] } | { kind: "fold"; key: string; rows: DiffRow[] };

/** The rows of a comparison with the unchanged runs folded: `context` unchanged rows kept on each side of a change, runs shorter than `least` never folded. */
export function foldRows(rows: DiffRow[], context = 3, least = 3): Segment[] {
  if (rows.length === 0) return [];
  if (rows.every((r) => r.kind === "same")) return [fold(rows)];
  const segments: Segment[] = [];
  const show = (run: DiffRow[]) => {
    const last = segments[segments.length - 1];
    if (last?.kind === "rows") last.rows.push(...run);
    else segments.push({ kind: "rows", rows: [...run] });
  };
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind !== "same") {
      show([rows[i++]]);
      continue;
    }
    let end = i;
    while (end < rows.length && rows[end].kind === "same") end++;
    // Keep `context` rows next to a change; the run's own ends (start/end of the file) have none.
    const head = i === 0 ? 0 : context;
    const tail = end === rows.length ? 0 : context;
    if (end - i - head - tail >= least) {
      if (head > 0) show(rows.slice(i, i + head));
      segments.push(fold(rows.slice(i + head, end - tail)));
      if (tail > 0) show(rows.slice(end - tail, end));
    } else {
      show(rows.slice(i, end));
    }
    i = end;
  }
  return segments;
}

/** A fold of unchanged rows, keyed by the line number of its first row in theirs, which a restore into mine never moves (R12: open folds stay open). */
function fold(rows: DiffRow[]): Segment {
  return { kind: "fold", key: `fold-${rows[0].theirsLine}`, rows };
}

/** One changed block of a comparison: `row` is the index in `rows` of its first row; applying `edit` to `mine` gives it the block as it is in `theirs`. */
export interface Restorable {
  row: number;
  edit: TextEdit;
}

/** The lines of a text with their line endings, and the offset each starts at (one extra start: the text's end). */
function withEndings(text: string): { lines: string[]; starts: number[] } {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const starts: number[] = [];
  let at = 0;
  for (const line of lines) {
    starts.push(at);
    at += line.length;
  }
  starts.push(at);
  return { lines, starts };
}

/** The changed blocks of a comparison (maximal runs of rows that are not "same"), each with the edit that restores it from `theirs` into `mine`. */
export function restorable(mine: string, theirs: string, rows: DiffRow[] = sideBySide(mine, theirs)): Restorable[] {
  const m = withEndings(mine);
  const t = withEndings(theirs);
  const eol = mine.includes("\r\n") ? "\r\n" : "\n";
  const result: Restorable[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind === "same") {
      i++;
      continue;
    }
    const row = i;
    for (; i < rows.length && rows[i].kind !== "same"; i++);
    const run = rows.slice(row, i);
    const mineLines = run.flatMap((r) => (r.mineLine === null ? [] : [r.mineLine - 1]));
    const theirsLines = run.flatMap((r) => (r.theirsLine === null ? [] : [r.theirsLine - 1]));
    let text = theirsLines.map((n) => t.lines[n]).join("");
    let from: number;
    let to: number;
    if (mineLines.length > 0) {
      from = m.starts[mineLines[0]];
      to = m.starts[mineLines[mineLines.length - 1] + 1];
    } else {
      // Only added rows: insert before the next mine line, or at the end.
      const next = rows[i]?.mineLine;
      from = to = next ? m.starts[next - 1] : mine.length;
      if (next === undefined || next === null) {
        if (mine !== "" && !mine.endsWith("\n") && text !== "") text = eol + text;
      }
    }
    result.push({ row, edit: { range: { from, to }, text } });
  }
  return result;
}
