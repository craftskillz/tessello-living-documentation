// Sections: the part of a Document a heading owns, and the edit that replaces it (spec R5).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyEdits } from "../src/lib/edits.ts";
import { htmlSectionAt, replaceSection, sectionAt } from "../src/lib/sections.ts";

/** The text of the section holding the first occurrence of `needle`. */
function sectionOf(source: string, needle: string): string | null {
  const range = sectionAt(source, source.indexOf(needle));
  return range && source.slice(range.from, range.to);
}

describe("sectionAt", () => {
  test("the closest heading, with its descendants, up to the next peer", () => {
    const source = "# Title\n\n## One\n\nAlpha\n\n### Child\n\nBeta\n\n## Two\n\nGamma\n";
    assert.equal(sectionOf(source, "Alpha"), "## One\n\nAlpha\n\n### Child\n\nBeta\n\n");
    assert.equal(sectionOf(source, "Beta"), "### Child\n\nBeta\n\n");
    assert.equal(sectionOf(source, "Gamma"), "## Two\n\nGamma\n");
    assert.equal(sectionOf(source, "Title"), source);
  });

  test("a section stops at a heading of a higher level too", () => {
    const source = "## A\n\ntext\n\n# B\n\nmore\n";
    assert.equal(sectionOf(source, "text"), "## A\n\ntext\n\n");
  });

  test("a heading's own start offset gives the section that heading begins", () => {
    const source = "Intro\n\n## One\n\nAlpha\n\n## Two\n";
    assert.deepEqual(sectionAt(source, 7), { from: 7, to: 22 });
    assert.deepEqual(sectionAt(source, 6), { from: 0, to: 7 });
  });

  test("an indented ATX heading starts its section at the start of its line", () => {
    const source = "Intro\n\n  ## x\n\nBody\n\n## y\n";
    assert.deepEqual(sectionAt(source, 9), { from: 7, to: 21 });
    assert.deepEqual(sectionAt(source, 7), { from: 7, to: 21 });
    assert.equal(sectionOf(source, "Body"), "  ## x\n\nBody\n\n");
  });

  test("frontmatter, CRLF, the preamble and Setext headings", () => {
    const source = "---\r\ntitle: Example\r\n---\r\nIntro\r\n\r\nHeading\r\n-------\r\nBody\r\n\r\n## Next\r\nEnd";
    assert.equal(sectionOf(source, "Intro"), "Intro\r\n\r\n");
    assert.equal(sectionOf(source, "Body"), "Heading\r\n-------\r\nBody\r\n\r\n");
    assert.equal(sectionOf(source, "End"), "## Next\r\nEnd");
  });

  test("inside the frontmatter, or outside the text, there is no section", () => {
    const source = "---\ntitle: Example\n---\nIntro\n";
    assert.equal(sectionAt(source, 0), null);
    assert.equal(sectionAt(source, 10), null);
    assert.equal(sectionAt(source, 19), null);
    assert.deepEqual(sectionAt(source, 23), { from: 23, to: 29 });
    assert.equal(sectionAt(source, -1), null);
    assert.equal(sectionAt(source, 30), null);
    assert.equal(sectionAt(source, Number.NaN), null);
  });

  test("headings in fenced code, quotes and compare examples do not count", () => {
    const source = "## Real\n\n```md\n# Fake\n```\n\n> # Quote\n\n:::compare\n# Example\n:::\n\nTail\n\n## Next\nDone";
    assert.equal(sectionOf(source, "Tail"), "## Real\n\n```md\n# Fake\n```\n\n> # Quote\n\n:::compare\n# Example\n:::\n\nTail\n\n");
    assert.equal(sectionOf(source, "# Fake"), "## Real\n\n```md\n# Fake\n```\n\n> # Quote\n\n:::compare\n# Example\n:::\n\nTail\n\n");
  });

  test("compare examples with CRLF line endings do not count either", () => {
    const source = "## Real\r\n\r\n:::compare\r\n# Example\r\n:::\r\n\r\nTail\r\n";
    assert.equal(sectionOf(source, "Tail"), source);
  });

  test("a document without headings is one section after the frontmatter", () => {
    const source = "---\ntitle: Test\n---\nPlain text\n";
    assert.equal(sectionOf(source, "Plain"), "Plain text\n");
  });

  test("repeated text and headings are located by position", () => {
    const source = "## Same\nText\n\n## Same\nText\n";
    assert.deepEqual(sectionAt(source, source.lastIndexOf("Text")), { from: 14, to: 27 });
    assert.deepEqual(sectionAt(source, source.indexOf("Text")), { from: 0, to: 14 });
  });
});

describe("replaceSection", () => {
  const replace = (source: string, needle: string, replacement: string) => {
    const range = sectionAt(source, source.indexOf(needle))!;
    return applyEdits(source, [replaceSection(source, range, replacement)]);
  };

  test("the replacement's line endings become the file's", () => {
    const source = "---\r\ntitle: Example\r\n---\r\nIntro\r\n\r\nHeading\r\n-------\r\nBody\r\n\r\n## Next\r\nEnd";
    assert.equal(
      replace(source, "Body", "## Changed\n\nUpdated"),
      "---\r\ntitle: Example\r\n---\r\nIntro\r\n\r\n## Changed\r\n\r\nUpdated\r\n\r\n## Next\r\nEnd",
    );
  });

  test("a section followed by more text keeps exactly one blank line before it", () => {
    assert.equal(replace("## A\n\nx\n\n## B\n", "x", "## A\n\nnew\n\n\n\n"), "## A\n\nnew\n\n## B\n");
    assert.equal(replace("## A\n\nx\n\n## B\n", "x", "## A\n\nnew"), "## A\n\nnew\n\n## B\n");
  });

  test("the last section keeps the replacement as it is", () => {
    assert.equal(replace("## A\n\nx\n", "x", "## A\n\nnew\n"), "## A\n\nnew\n");
    assert.equal(replace("## A\n\nx\n", "x", "## A\n\nnew"), "## A\n\nnew");
  });

  test("an empty replacement removes the section", () => {
    assert.equal(replace("## Same\nText\n\n## Same\nText\n", "Text\n\n## Same", ""), "## Same\nText\n");
  });

  test("a lone LF file stays LF", () => {
    assert.equal(replace("## A\n\nx\n\n## B\n", "x", "## A\r\n\r\nnew"), "## A\n\nnew\n\n## B\n");
  });
});

describe("htmlSectionAt", () => {
  // "# T\n" 0-4, "\n", "lead\n" 5-10, "\n", "### In lead\n" 11-23, "\n", "x\n" 24-26, "\n", "## S\n" 27-32, "\n", "### U\n" 33-39, "\n", "z\n" 40-42
  const page = "# T\n\nlead\n\n### In lead\n\nx\n\n## S\n\n### U\n\nz\n";

  test("in the lead of a titled page: the lead only, from after the title to the first ##", () => {
    assert.deepEqual(htmlSectionAt(page, 6), { from: 4, to: 27 });
    assert.deepEqual(htmlSectionAt(page, 4), { from: 4, to: 27 });
  });

  test("a ### inside the lead is the lead, not its own section", () => {
    assert.deepEqual(htmlSectionAt(page, 15), { from: 4, to: 27 });
  });

  test("on the title: null", () => {
    assert.equal(htmlSectionAt(page, 1), null);
  });

  test("a ## section and a ### under it are what sectionAt says", () => {
    assert.deepEqual(htmlSectionAt(page, 30), { from: 27, to: 42 });
    assert.deepEqual(htmlSectionAt(page, 36), { from: 33, to: 42 });
  });

  test("without a title the lead starts at the body", () => {
    assert.deepEqual(htmlSectionAt("lead\n\n## S\n\nx\n", 2), { from: 0, to: 6 });
  });

  test("a titled page without any ## is all lead after the title", () => {
    assert.deepEqual(htmlSectionAt("# T\n\nonly\n", 6), { from: 4, to: 10 });
  });

  test("the frontmatter: null; the lead starts after it", () => {
    const text = "---\ntitle: x\n---\n# T\n\nlead\n\n## S\n";
    assert.equal(htmlSectionAt(text, 3), null);
    assert.deepEqual(htmlSectionAt(text, 24), { from: 21, to: 28 });
  });

  test("outside the text: null", () => {
    assert.equal(htmlSectionAt(page, 999), null);
  });
});
