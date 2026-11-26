// Tag markers: which lone tags are instructions for an LLM, and how their pill reads.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isMarkerName, normalizeTagNames, parseTagInput, pillLabel, splitTagNames, TAG_SOURCE } from "../src/lib/tagMarkers.ts";

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

describe("the tag typed in the Insert popup", () => {
  test("a bare name, bracketed or not, becomes a lower-case tag", () => {
    assert.deepEqual(parseTagInput("rewrite-section"), { tag: "<rewrite-section>", name: "rewrite-section" });
    assert.deepEqual(parseTagInput("  <Add-Footnote>  "), { tag: "<add-footnote>", name: "add-footnote" });
  });

  test("free text keeps its case, its spaces collapse", () => {
    assert.deepEqual(parseTagInput("generate-image : show the sections of skill.md"), {
      tag: "<generate-image : show the sections of skill.md>",
      name: "generate-image",
    });
    assert.deepEqual(parseTagInput("Fix-It   Keep \t  CASE  "), { tag: "<fix-it Keep CASE>", name: "fix-it" });
  });

  test("an invalid name or free text is refused", () => {
    for (const input of ["", "   ", "<>", "1abc", "a_b", "é", "todo a<b", "todo a>b", "todo a=b", "todo a\nb", "p", "div", "<Details>", "a b c"]) {
      assert.equal(parseTagInput(input), null, JSON.stringify(input));
    }
  });

  test("the tag always matches the marker syntax", () => {
    const parsed = parseTagInput("my-tag  some   text");
    assert.match(parsed!.tag, new RegExp(`^${TAG_SOURCE}$`));
  });
});

describe("tag names of the settings", () => {
  test("normalized: brackets off, lower case, duplicates out, order kept, invalid names apart", () => {
    assert.deepEqual(normalizeTagNames(["<Add-Footnote>", "rewrite-section", "bad_name", "add-footnote", "", "  ", "div", "with space"]), {
      names: ["add-footnote", "rewrite-section"],
      invalid: ["bad_name", "div", "with space"],
    });
  });

  test("the field text splits on commas, spaces and line breaks", () => {
    assert.deepEqual(splitTagNames("a-b, <c-d>  e-f\n\ng-h,,"), ["a-b", "<c-d>", "e-f", "g-h"]);
    assert.deepEqual(splitTagNames(""), []);
  });
});
