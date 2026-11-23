// Tag markers: which lone tags are instructions for an LLM, and how their pill reads.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isMarkerName, pillLabel, TAG_SOURCE } from "../src/lib/tagMarkers.ts";

describe("syntax", () => {
  const tags = (text: string) => [...text.matchAll(new RegExp(TAG_SOURCE, "g"))].map((m) => [m[0], m[1], m[2]]);

  test("a name, then optional free text", () => {
    assert.deepEqual(tags("<add-footnote> <rewrite-section in three parts> <a1  x y  >"), [
      ["<add-footnote>", "add-footnote", undefined],
      ["<rewrite-section in three parts>", "rewrite-section", "in three parts"],
      ["<a1  x y  >", "a1", "x y"],
    ]);
  });

  test("an attribute, a nested tag or a line break is not a lone tag", () => {
    assert.deepEqual(tags('<a href="x"> <a <b> > <a\nb> </a> <1a>'), [["<b>", "b", undefined]]);
  });
});

describe("marker names", () => {
  test("a standard HTML element is not a marker", () => {
    for (const name of ["p", "span", "br", "details", "DIV", "center", "font", "svg", "math", "marquee"]) assert.equal(isMarkerName(name, ""), false, name);
  });

  test("any other name is", () => {
    assert.equal(isMarkerName("add-footnote", "<add-footnote>"), true);
  });

  test("a name closed anywhere in the Document, code included, is not", () => {
    assert.equal(isMarkerName("foo", "<foo> text\n\n```\n</foo>\n```\n"), false);
    assert.equal(isMarkerName("foo", "<foo> </FOO >"), false);
    assert.equal(isMarkerName("foo", "<foo> </foobar>"), true);
  });
});

describe("pill label", () => {
  test("the name as written, cut at 20 characters", () => {
    assert.equal(pillLabel("Add-Footnote"), "Add-Footnote");
    assert.equal(pillLabel("a".repeat(20)), "a".repeat(20));
    assert.equal(pillLabel("abcdefghij-klmnopqrstuvwxy"), "abcdefghij-klmnopqr…");
  });
});
