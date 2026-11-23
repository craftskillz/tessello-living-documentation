// The side-by-side line diff of the Conflict's Compare: my text vs the disk.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sideBySide } from "../src/lib/diff.ts";

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
