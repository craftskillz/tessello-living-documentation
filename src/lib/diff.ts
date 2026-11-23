// A minimal line diff (Myers, O(ND)) of two texts, laid out side by side.

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
