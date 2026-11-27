// The side-by-side line diff of the Conflict's Compare: my text vs the disk.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyEdits } from "../src/lib/edits.ts";
import { foldRows, restorable, sideBySide, type Segment } from "../src/lib/diff.ts";

describe("side-by-side line diff", () => {
  test("identical texts give only same rows, numbered from 1", () => {
    assert.deepEqual(sideBySide("a\nb", "a\nb"), [
      { kind: "same", mine: "a", theirs: "a", mineLine: 1, theirsLine: 1 },
      { kind: "same", mine: "b", theirs: "b", mineLine: 2, theirsLine: 2 },
    ]);
  });

  test("a line only in mine is removed, only on the disk is added", () => {
    assert.deepEqual(sideBySide("a\nb\nc", "a\nc\nd"), [
      { kind: "same", mine: "a", theirs: "a", mineLine: 1, theirsLine: 1 },
      { kind: "removed", mine: "b", theirs: null, mineLine: 2, theirsLine: null },
      { kind: "same", mine: "c", theirs: "c", mineLine: 3, theirsLine: 2 },
      { kind: "added", mine: null, theirs: "d", mineLine: null, theirsLine: 3 },
    ]);
  });

  test("a removed run followed by an added run is paired as changed", () => {
    assert.deepEqual(sideBySide("a\nb\nz", "a\nB\nz"), [
      { kind: "same", mine: "a", theirs: "a", mineLine: 1, theirsLine: 1 },
      { kind: "changed", mine: "b", theirs: "B", mineLine: 2, theirsLine: 2 },
      { kind: "same", mine: "z", theirs: "z", mineLine: 3, theirsLine: 3 },
    ]);
  });

  test("the surplus of the longer run stays removed or added", () => {
    assert.deepEqual(sideBySide("a\nb1\nb2\nb3", "a\nc1"), [
      { kind: "same", mine: "a", theirs: "a", mineLine: 1, theirsLine: 1 },
      { kind: "changed", mine: "b1", theirs: "c1", mineLine: 2, theirsLine: 2 },
      { kind: "removed", mine: "b2", theirs: null, mineLine: 3, theirsLine: null },
      { kind: "removed", mine: "b3", theirs: null, mineLine: 4, theirsLine: null },
    ]);
    assert.deepEqual(sideBySide("a", "a\nc1\nc2"), [
      { kind: "same", mine: "a", theirs: "a", mineLine: 1, theirsLine: 1 },
      { kind: "added", mine: null, theirs: "c1", mineLine: null, theirsLine: 2 },
      { kind: "added", mine: null, theirs: "c2", mineLine: null, theirsLine: 3 },
    ]);
  });

  test("the diff is minimal: a moved-in line does not disturb the common ones", () => {
    // LCS of a,b,c,d,e / x,a,b,c,d,e is 5 long: only x is added.
    const rows = sideBySide("a\nb\nc\nd\ne", "x\na\nb\nc\nd\ne");
    assert.deepEqual(rows.map((r) => r.kind), ["added", "same", "same", "same", "same", "same"]);
  });

  test("a trailing line ending does not add an empty last line", () => {
    assert.deepEqual(sideBySide("a\n", "a"), [
      { kind: "same", mine: "a", theirs: "a", mineLine: 1, theirsLine: 1 },
    ]);
  });

  test("an empty text has no lines", () => {
    assert.deepEqual(sideBySide("", ""), []);
    assert.deepEqual(sideBySide("", "a\n"), [
      { kind: "added", mine: null, theirs: "a", mineLine: null, theirsLine: 1 },
    ]);
    assert.deepEqual(sideBySide("a\n", ""), [
      { kind: "removed", mine: "a", theirs: null, mineLine: 1, theirsLine: null },
    ]);
  });

  test("a blank line in the middle is a line", () => {
    assert.deepEqual(sideBySide("a\n\nb", "a\nb").map((r) => r.kind), ["same", "removed", "same"]);
  });

  test("CRLF and LF of the same line compare equal, without the \\r in the text", () => {
    assert.deepEqual(sideBySide("a\r\nb\r\n", "a\nb\n"), [
      { kind: "same", mine: "a", theirs: "a", mineLine: 1, theirsLine: 1 },
      { kind: "same", mine: "b", theirs: "b", mineLine: 2, theirsLine: 2 },
    ]);
  });
});

/** A text of n lines "l1".."ln", the lines in `changed` written "X<n>" instead. */
function text(n: number, changed: number[] = []): string {
  return Array.from({ length: n }, (_, i) => (changed.includes(i + 1) ? `X${i + 1}` : `l${i + 1}`)).join("\n");
}

/** What a segment shows, by hand-readable shape: "rows 27-33" or "fold 1-26" (mine line numbers; added rows have none). */
function shape(segments: Segment[]): string[] {
  return segments.map((s) => {
    const lines = s.rows.map((r) => r.mineLine ?? r.theirsLine);
    return `${s.kind} ${lines[0]}-${lines[lines.length - 1]}`;
  });
}

describe("folding unchanged lines", () => {
  test("no rows, nothing to fold", () => {
    assert.deepEqual(foldRows(sideBySide("", "")), []);
  });

  test("identical texts fold into a single bar covering everything", () => {
    const segments = foldRows(sideBySide(text(10), text(10)));
    assert.deepEqual(shape(segments), ["fold 1-10"]);
    assert.equal(segments[0].rows.length, 10);
  });

  test("a change in a 60-line file keeps 3 lines each side and folds the rest", () => {
    const segments = foldRows(sideBySide(text(60), text(60, [30])));
    assert.deepEqual(shape(segments), ["fold 1-26", "rows 27-33", "fold 34-60"]);
    assert.deepEqual(
      segments[1].rows.map((r) => r.kind),
      ["same", "same", "same", "changed", "same", "same", "same"],
    );
  });

  test("a change on the first line has no fold before it", () => {
    assert.deepEqual(shape(foldRows(sideBySide(text(60), text(60, [1])))), ["rows 1-4", "fold 5-60"]);
  });

  test("a change on the last line has no fold after it", () => {
    assert.deepEqual(shape(foldRows(sideBySide(text(60), text(60, [60])))), ["fold 1-56", "rows 57-60"]);
  });

  test("two close changes share the unchanged rows between them", () => {
    // Lines 10 and 12 changed: line 11 between them, lines 13-15 after.
    assert.deepEqual(shape(foldRows(sideBySide(text(60), text(60, [10, 12])))), ["fold 1-6", "rows 7-15", "fold 16-60"]);
  });

  test("a run of 2*context+3 = 9 unchanged rows between two changes folds its middle 3", () => {
    // Lines 11-19 unchanged between the changes at 10 and 20.
    assert.deepEqual(shape(foldRows(sideBySide(text(60), text(60, [10, 20])))), [
      "fold 1-6",
      "rows 7-13",
      "fold 14-16",
      "rows 17-23",
      "fold 24-60",
    ]);
  });

  test("a run of 2*context+2 = 8 unchanged rows between two changes is not folded", () => {
    // Lines 11-18 unchanged between the changes at 10 and 19: folding would hide only 2 rows.
    assert.deepEqual(shape(foldRows(sideBySide(text(60), text(60, [10, 19])))), ["fold 1-6", "rows 7-22", "fold 23-60"]);
  });

  test("context and least are parameters", () => {
    // One line of context; a fold must hide at least 2 rows: 2 rows before line 4 (lines 1-2) fold, 3 after line 4 stay.
    assert.deepEqual(shape(foldRows(sideBySide(text(10), text(10, [4])), 1, 2)), ["fold 1-2", "rows 3-5", "fold 6-10"]);
    assert.deepEqual(shape(foldRows(sideBySide(text(10), text(10, [4])), 1, 6)), ["rows 1-10"]);
  });

  test("a comparison where every line differs is one rows segment", () => {
    assert.deepEqual(shape(foldRows(sideBySide(text(5), text(5, [1, 2, 3, 4, 5])))), ["rows 1-5"]);
  });

  test("added and removed rows are shown like changes, with context", () => {
    const segments = foldRows(sideBySide(text(20), text(21, [])));
    assert.deepEqual(shape(segments), ["fold 1-17", "rows 18-21"]);
    assert.equal(segments[1].rows.length, 4);
    assert.equal(segments[1].rows[3].kind, "added");
  });

  test("two rows segments never follow each other", () => {
    const segments = foldRows(sideBySide(text(60), text(60, [5, 6, 20, 21, 40, 41, 58])));
    segments.forEach((s, i) => {
      if (i > 0) assert.ok(!(s.kind === "rows" && segments[i - 1].kind === "rows"), `segments ${i - 1} and ${i}`);
    });
  });

  test("fold keys are unique and the same for the same comparison", () => {
    const rows = sideBySide(text(60), text(60, [10, 20, 40]));
    const keys = foldRows(rows).flatMap((s) => (s.kind === "fold" ? [s.key] : []));
    assert.equal(keys.length, 4);
    assert.equal(new Set(keys).size, 4);
    assert.deepEqual(foldRows(sideBySide(text(60), text(60, [10, 20, 40]))).flatMap((s) => (s.kind === "fold" ? [s.key] : [])), keys);
  });
});

/** Restores the first block, recomputing from the new text, until nothing differs. */
function restoreAll(mine: string, theirs: string): string {
  let current = mine;
  for (let guard = 0; guard < 50; guard++) {
    const [first] = restorable(current, theirs);
    if (!first) return current;
    current = applyEdits(current, [first.edit]);
  }
  throw new Error("restoring never converged");
}

describe("restoring a block of a comparison", () => {
  test("identical texts have nothing to restore", () => {
    assert.deepEqual(restorable("a\nb\n", "a\nb\n"), []);
    assert.deepEqual(restorable("", ""), []);
  });

  test("one entry per run of changed rows, with the index of its first row", () => {
    const mine = "a\nb\nc\nd\ne\n";
    const theirs = "a\nB\nc\nd\ne\nf\n";
    const rows = sideBySide(mine, theirs);
    assert.deepEqual(restorable(mine, theirs, rows).map((r) => r.row), [1, 5]);
  });

  test("restoring one block leaves the other blocks untouched", () => {
    const mine = "a\nb\nc\nd\ne\n";
    const theirs = "a\nB\nc\nd\nE\n";
    const [first, second] = restorable(mine, theirs);
    assert.equal(applyEdits(mine, [first.edit]), "a\nB\nc\nd\ne\n");
    assert.equal(applyEdits(mine, [second.edit]), "a\nb\nc\nd\nE\n");
  });

  test("restoring every block, one after another, gives theirs", () => {
    const cases: [string, string][] = [
      ["a\nb\nc\n", "X\nb\nc\n"],
      ["a\nb\nc\n", "a\nb\nX\n"],
      ["a\nb\nc\n", "a\nb\nX\nY\nc\n"],
      ["a\nb\nc\nd\n", "a\nd\n"],
      ["a\nb\nc\nd\ne\nf\n", "x\nb\nc\nY\nZ\ne\n"],
      ["a\r\nb\r\nc\r\n", "a\r\nB\r\nc\r\nd\r\n"],
      ["a\r\nb\r\nc", "a\r\nc"],
      ["", "a\nb\n"],
      ["a\nb\n", ""],
      ["a\nb", "a\nb\nc"],
    ];
    for (const [mine, theirs] of cases) assert.equal(restoreAll(mine, theirs), theirs, JSON.stringify([mine, theirs]));
  });

  test("an edit covers the mine lines of the run with their endings, in offsets of mine", () => {
    const mine = "a\r\nb\r\nc\r\n";
    const [r] = restorable(mine, "a\nX\nc\n");
    assert.deepEqual(r.edit, { range: { from: 3, to: 6 }, text: "X\n" });
  });

  test("lines only in theirs are inserted at the start of the next mine line", () => {
    const [r] = restorable("a\nc\n", "a\nb\nc\n");
    assert.deepEqual(r.edit, { range: { from: 2, to: 2 }, text: "b\n" });
  });

  test("inserting after a last line without a newline does not glue the lines", () => {
    const [r] = restorable("a", "a\nb\n");
    assert.equal(applyEdits("a", [r.edit]), "a\nb\n");
  });

  test("the missing newline follows the line endings of mine", () => {
    const [r] = restorable("a\r\nb", "a\r\nb\r\nc\r\n");
    assert.equal(applyEdits("a\r\nb", [r.edit]), "a\r\nb\r\nc\r\n");
  });

  test("removing the last lines", () => {
    const [r] = restorable("a\nb\n", "a\n");
    assert.equal(applyEdits("a\nb\n", [r.edit]), "a\n");
  });

  test("an empty mine takes all of theirs", () => {
    const [r] = restorable("", "a\nb\n");
    assert.deepEqual(r, { row: 0, edit: { range: { from: 0, to: 0 }, text: "a\nb\n" } });
  });
});
