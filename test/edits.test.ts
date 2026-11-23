// Text edits: the one splicing rule (docs/design.md §2).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyEdits } from "../src/lib/edits.ts";

describe("applyEdits", () => {
  test("no edit leaves the text as is", () => {
    assert.equal(applyEdits("abc", []), "abc");
  });

  test("replaces, inserts and deletes by range", () => {
    assert.equal(applyEdits("hello world", [{ range: { from: 0, to: 5 }, text: "bye" }]), "bye world");
    assert.equal(applyEdits("ac", [{ range: { from: 1, to: 1 }, text: "b" }]), "abc");
    assert.equal(applyEdits("abc", [{ range: { from: 1, to: 2 }, text: "" }]), "ac");
  });

  test("edits given in any order all refer to the original offsets", () => {
    const edits = [
      { range: { from: 6, to: 11 }, text: "there" },
      { range: { from: 0, to: 5 }, text: "oh" },
    ];
    assert.equal(applyEdits("hello world", edits), "oh there");
  });

  test("two inserts at the same offset keep their given order", () => {
    const edits = [
      { range: { from: 1, to: 1 }, text: "X" },
      { range: { from: 1, to: 1 }, text: "Y" },
    ];
    assert.equal(applyEdits("ab", edits), "aXYb");
  });

  test("an insert touching a replaced range is not an overlap", () => {
    const edits = [
      { range: { from: 1, to: 2 }, text: "Z" },
      { range: { from: 1, to: 1 }, text: "I" },
      { range: { from: 2, to: 2 }, text: "J" },
    ];
    assert.equal(applyEdits("abc", edits), "aIZJc");
  });

  test("overlapping edits throw a RangeError", () => {
    const edits = [
      { range: { from: 0, to: 3 }, text: "x" },
      { range: { from: 2, to: 4 }, text: "y" },
    ];
    assert.throws(() => applyEdits("abcdef", edits), RangeError);
  });

  test("a range outside the text, or reversed, throws a RangeError", () => {
    assert.throws(() => applyEdits("abc", [{ range: { from: 2, to: 4 }, text: "" }]), RangeError);
    assert.throws(() => applyEdits("abc", [{ range: { from: -1, to: 1 }, text: "" }]), RangeError);
    assert.throws(() => applyEdits("abc", [{ range: { from: 2, to: 1 }, text: "" }]), RangeError);
  });
});
