// The file lines a block comes from, for the header's Lines toggle.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lineLabel } from "../src/lib/lines.ts";
import { parseDocument } from "../src/lib/document.ts";
import { renderDocument } from "../src/lib/render.ts";

describe("line labels", () => {
  test("a range inside one line is that line", () => {
    // "ab\ncd\nef\n": "cd" is 3-5, on line 2.
    assert.equal(lineLabel("ab\ncd\nef\n", [[3, 5]]), "2");
  });

  test("a range over several lines is first-last", () => {
    // "a\nb\nc\nd\n": 2-5 covers "b\nc" (lines 2 and 3).
    assert.equal(lineLabel("a\nb\nc\nd\n", [[2, 5]]), "2-3");
  });

  test("a range ending after a line break does not count the next line", () => {
    // "a\nb\nc\n": 0-4 is "a\nb\n", lines 1 and 2.
    assert.equal(lineLabel("a\nb\nc\n", [[0, 4]]), "1-2");
  });

  test("an empty range counts its own line", () => {
    assert.equal(lineLabel("a\nb\nc\n", [[2, 2]]), "2");
  });

  test("several ranges span from the smallest start to the largest end", () => {
    // "a\nb\nc\nd\ne\n": [4,5] is line 3, [8,9] is line 5.
    assert.equal(lineLabel("a\nb\nc\nd\ne\n", [[8, 9], [4, 5]]), "3-5");
  });

  test("no range gives null", () => {
    assert.equal(lineLabel("a\n", []), null);
  });

  test("\\r\\n line endings count as one break", () => {
    // "a\r\nb\r\nc": "b" is 3-4... "b\r\nc" is 3-7, lines 2 and 3.
    assert.equal(lineLabel("a\r\nb\r\nc", [[3, 7]]), "2-3");
    assert.equal(lineLabel("a\r\nb\r\nc", [[3, 4]]), "2");
  });

  test("the ranges of a rendered Document with frontmatter give the file's lines", () => {
    // Lines: 1 "---", 2 "title: T", 3 "---", 4 "# Hi", 5 "", 6 "one", 7 "two".
    const text = "---\ntitle: T\n---\n# Hi\n\none\ntwo\n";
    const html = renderDocument(parseDocument(text, "a.md"), "a.md");
    const ranges = [...html.matchAll(/data-src="(\d+)-(\d+)"/g)].map((m): [number, number] => [Number(m[1]), Number(m[2])]);
    assert.equal(lineLabel(text, [ranges[0]!]), "4");
    assert.equal(lineLabel(text, [ranges[1]!]), "6-7");
  });

  test("a 2000-line file is fine", () => {
    const text = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join("\n");
    assert.equal(lineLabel(text, [[0, text.length]]), "1-2000");
  });
});
