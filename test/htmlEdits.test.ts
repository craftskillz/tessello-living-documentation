// Editing in the HTML page, the pure part (spec html-generation rules 8-9): what an edited block reads back as in
// Markdown, and the edit that writes it over the block's lines.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseDocument } from "../src/lib/document.ts";
import { applyEdits } from "../src/lib/edits.ts";
import { blockEdit, blockLines, blockToMarkdown, sameIgnoringWhitespace, type BlockNode } from "../src/lib/htmlEdits.ts";
import { renderDocumentTree } from "../src/lib/render.ts";

type Hast = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: Hast[] };

/** A hast node seen as a DOM node: attribute names are mapped back to their hast property names. */
function wrap(node: Hast): BlockNode {
  if (node.type === "text") return { nodeType: 3, nodeName: "#text", nodeValue: node.value ?? "", childNodes: [] };
  const properties = node.properties ?? {};
  return {
    nodeType: 1,
    nodeName: (node.tagName ?? "div").toUpperCase(),
    nodeValue: null,
    childNodes: (node.children ?? []).map(wrap),
    getAttribute(name) {
      const key = name === "class" ? "className" : name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      const value = properties[key];
      if (value === undefined || value === null || value === false) return null;
      return Array.isArray(value) ? value.join(" ") : value === true ? "" : String(value);
    },
  };
}

/** The first block of `markdown`, as the View's page would show it. */
function firstBlock(markdown: string, softBreaks = false): BlockNode {
  const tree = renderDocumentTree(parseDocument(markdown, "doc.md"), "doc.md", {}, { softBreaks, sourceTargets: true });
  const block = tree.children.find((node) => node.type === "element");
  return wrap(block as Hast);
}

const readBack = (markdown: string, softBreaks = false) => blockToMarkdown(firstBlock(markdown, softBreaks), { softBreaks });

describe("blockToMarkdown reads back what the renderer produces", () => {
  for (const source of [
    "Plain text.",
    "Some **bold** words.",
    "Some *italic* words.",
    "Some `code` words.",
    "Some ~~struck~~ words.",
    "See [A](?doc=a) here.",
    'See [A](other.md#part "Tip") here.',
    "See [site](https://example.com/x) here.",
    "See [up](#top) here.",
    "See https://example.com/x here.",
    "Pic ![x](images/a.png) here.",
    'Pic ![x](images/a.png "t") here.',
    "Pic ![x](https://example.com/a.png) here.",
    "A <todo> marker.",
    "A **bold [link](?doc=a)** and *`code`*.",
    "Fact[^1] here.\n\n[^1]: note",
    "## Two *em*",
    "### Three **bold**",
    "#### Four `c`",
  ]) {
    test(JSON.stringify(source), () => {
      assert.equal(readBack(source), source.split("\n\n")[0]);
    });
  }

  test("a line ending renders as a line break: read back as a hard break, or as the newline when soft breaks are on", () => {
    assert.equal(readBack("one  \ntwo"), "one  \ntwo");
    assert.equal(readBack("one\ntwo", true), "one\ntwo");
    assert.equal(readBack("one  \ntwo", true), "one\ntwo");
    assert.equal(readBack("one\\\ntwo", false), "one  \ntwo");
  });

  test("an autolink in angle brackets reads back as the bare target", () => {
    assert.equal(readBack("<https://example.com/x>"), "https://example.com/x");
  });

  test("a link without its written target is not read back", () => {
    const link = { type: "element", tagName: "a", properties: { role: "link" }, children: [{ type: "text", value: "A" }] };
    assert.equal(blockToMarkdown(wrap({ type: "element", tagName: "p", children: [link] }), { softBreaks: false }), null);
  });

  test("not a paragraph or a heading from h2 to h4: null", () => {
    assert.equal(readBack("# Title"), null);
    assert.equal(readBack("##### Five"), null);
    assert.equal(readBack("- a\n- b"), null);
    assert.equal(readBack("> quote"), null);
    assert.equal(readBack("```\ncode\n```"), null);
    assert.equal(readBack("| a |\n| - |\n| 1 |"), null);
  });

  test("an element the renderer does not know inside the block: null", () => {
    const unknown = { type: "element", tagName: "video", children: [] };
    assert.equal(blockToMarkdown(wrap({ type: "element", tagName: "p", children: [unknown] }), { softBreaks: false }), null);
  });

  test("a span with a meaning of its own (unresolved link, missing image): null", () => {
    assert.equal(readBack("See [A](nowhere://x) here."), null);
    assert.equal(readBack("Pic ![x](nowhere://y) here."), null);
  });

  test("a bare span or font (the browser's editing leftovers) is transparent", () => {
    const span = { type: "element", tagName: "span", children: [{ type: "text", value: "in" }] };
    const font = { type: "element", tagName: "font", children: [{ type: "text", value: "side" }] };
    assert.equal(blockToMarkdown(wrap({ type: "element", tagName: "p", children: [span, font] }), { softBreaks: false }), "inside");
  });

  test("escaped text reads back as written in the page, which does not match the source: the caller falls back", () => {
    const source = "Prix \\*barré\\* ici.";
    const markdown = readBack(source);
    assert.equal(markdown, "Prix *barré* ici.");
    assert.equal(sameIgnoringWhitespace(markdown!, source), false);
  });
});

describe("sameIgnoringWhitespace", () => {
  test("whitespace does not count", () => {
    assert.equal(sameIgnoringWhitespace("a  b\n c", "a b c"), true);
    assert.equal(sameIgnoringWhitespace("a b", "a c"), false);
  });
});

describe("blockLines", () => {
  // "A\n\nB\n\nC\n": B is 3-4.
  test("a range widened to its whole line", () => {
    assert.deepEqual(blockLines("A\n\nB\n\nC\n", { from: 3, to: 4 }), { from: 3, to: 4 });
    assert.deepEqual(blockLines("x Hello there y\n", { from: 2, to: 7 }), { from: 0, to: 15 });
  });

  test("a range over several lines: from the start of the first to the end of the last, without its line ending", () => {
    assert.deepEqual(blockLines("- a\n- b\n- c\n\nZ\n", { from: 6, to: 9 }), { from: 4, to: 11 });
  });

  test("CRLF: the carriage return is part of the line ending", () => {
    assert.deepEqual(blockLines("A\r\n\r\nB\r\n\r\nC\r\n", { from: 5, to: 6 }), { from: 5, to: 6 });
  });
});

describe("blockEdit", () => {
  const apply = (text: string, range: { from: number; to: number }, markdown: string) => {
    const edit = blockEdit(text, range, markdown);
    return edit === null ? null : applyEdits(text, [edit]);
  };

  test("replaces the whole lines", () => {
    assert.equal(apply("A\n\nB\n\nC\n", { from: 3, to: 4 }, "Bee"), "A\n\nBee\n\nC\n");
  });

  test("a range inside a line widens to the line", () => {
    assert.equal(apply("A\n\nsome text\n\nC\n", { from: 6, to: 9 }, "other"), "A\n\nother\n\nC\n");
  });

  test("the new Markdown's newlines follow the file: CRLF", () => {
    assert.equal(apply("A\r\n\r\nB\r\n\r\nC\r\n", { from: 5, to: 6 }, "B1\nB2"), "A\r\n\r\nB1\r\nB2\r\n\r\nC\r\n");
  });

  test("a multi-line list block is replaced by its edited lines", () => {
    assert.equal(apply("A\n\n- a\n- b\n\nC\n", { from: 3, to: 10 }, "- a\n- b\n- c"), "A\n\n- a\n- b\n- c\n\nC\n");
  });

  test("the block's last line without a line ending (end of file)", () => {
    assert.equal(apply("A\n\nB", { from: 3, to: 4 }, "Bee"), "A\n\nBee");
  });

  test("unchanged: nothing to write", () => {
    assert.equal(blockEdit("A\n\nB\n\nC\n", { from: 3, to: 4 }, "B"), null);
    assert.equal(blockEdit("A\r\n\r\nB1\r\nB2\r\n", { from: 5, to: 11 }, "B1\nB2"), null);
  });

  test("an empty or whitespace-only block removes the lines and their line ending, blank lines do not double up", () => {
    assert.equal(apply("A\n\nB\n\nC\n", { from: 3, to: 4 }, ""), "A\n\nC\n");
    assert.equal(apply("A\n\nB\n\nC\n", { from: 3, to: 4 }, "  \n "), "A\n\nC\n");
    assert.equal(apply("A\r\n\r\nB\r\n\r\nC\r\n", { from: 5, to: 6 }, ""), "A\r\n\r\nC\r\n");
  });

  test("removing the first block and the last block", () => {
    assert.equal(apply("A\n\nB\n", { from: 0, to: 1 }, ""), "B\n");
    assert.equal(apply("A\n\nB\n", { from: 3, to: 4 }, ""), "A\n");
  });

  test("fed by the data-src of a rendered block", () => {
    const text = "# T\n\nIntro\n\n- a\n- b\n\nEnd\n";
    const html = renderDocumentTree(parseDocument(text, "d.md"), "d.md", {}, { softBreaks: false });
    const list = html.children.find((node) => node.type === "element" && node.tagName === "ul");
    const [from, to] = String((list as { properties: Record<string, unknown> }).properties.dataSrc).split("-").map(Number);
    assert.equal(apply(text, { from: from!, to: to! }, "- a\n- b\n- c"), "# T\n\nIntro\n\n- a\n- b\n- c\n\nEnd\n");
  });
});
