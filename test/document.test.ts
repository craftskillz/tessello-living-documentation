// The Document model: what the Module reads from a Document's text (docs/spec/frontmatter.md).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseDocument } from "../src/lib/document.ts";

describe("the displayed title", () => {
  test("the frontmatter title first", () => {
    assert.equal(parseDocument("---\ntitle: Getting started\n---\n# Intro\n", "guide/start.md").title, "Getting started");
  });

  test("else the first top-level heading, not a deeper one, nor one in a code block", () => {
    const text = "---\ntags: [a]\n---\n```\n# not this\n```\n## Not this either\n\n# The *real* title\n\n# Second\n";
    assert.equal(parseDocument(text, "x.md").title, "The real title");
  });

  test("else the file name exactly as typed, without .md", () => {
    assert.equal(parseDocument("Just text.\n", "guide/Été 2026 — notes.md").title, "Été 2026 — notes");
  });
});

describe("the frontmatter", () => {
  test("the body is the text after it", () => {
    assert.equal(parseDocument("---\ntitle: T\n---\n# T\n\nBody.\n", "t.md").body, "# T\n\nBody.\n");
    assert.equal(parseDocument("# No frontmatter\n", "t.md").body, "# No frontmatter\n");
  });

  test("bodyStart is where the body begins in the full text, 0 without frontmatter", () => {
    const text = "---\ntitle: T\n---\n# T\n";
    assert.equal(parseDocument(text, "t.md").bodyStart, 17);
    assert.equal(text.slice(17), "# T\n");
    assert.equal(parseDocument("# T\n", "t.md").bodyStart, 0);
  });

  test("tags are a list or a comma-separated string", () => {
    assert.deepEqual(parseDocument("---\ntags: [api, design]\n---\n", "t.md").tags, ["api", "design"]);
    assert.deepEqual(parseDocument("---\ntags: api, design ,  ops\n---\n", "t.md").tags, ["api", "design", "ops"]);
    assert.deepEqual(parseDocument("# None\n", "t.md").tags, []);
  });

  test("description and type are read as written", () => {
    const document = parseDocument("---\ndescription: How we deploy\ntype: Runbook\n---\n", "t.md");
    assert.equal(document.description, "How we deploy");
    assert.equal(document.type, "Runbook");
  });

  test("invalid YAML is reported with its line, and its fields are still read line by line for display", () => {
    const document = parseDocument("---\ntitle: Deploy\ntags: [unclosed\n---\n# Body\n", "t.md");

    assert.equal(document.frontmatter.valid, false);
    assert.equal(typeof (document.frontmatter.valid === false && document.frontmatter.line), "number");
    assert.equal(document.title, "Deploy");
    assert.equal(document.body, "# Body\n");
  });

  test("the YAML between the fences is kept as text, with where the block ends, closing fence included", () => {
    // "---\ntitle: T\ntags: [a]\n---" is 26 characters, then a newline.
    const document = parseDocument("---\ntitle: T\ntags: [a]\n---\n# Body\n", "t.md");
    assert.equal(document.frontmatterText, "title: T\ntags: [a]");
    assert.equal(document.frontmatterEnd, 26);
  });

  test("an invalid frontmatter keeps its text too, and no frontmatter gives null", () => {
    assert.equal(parseDocument("---\ntags: [unclosed\n---\n", "t.md").frontmatterText, "tags: [unclosed");
    const none = parseDocument("# Body\n", "t.md");
    assert.equal(none.frontmatterText, null);
    assert.equal(none.frontmatterEnd, null);
  });

  test("with CRLF line endings the block ends before the closing line's break", () => {
    // "---\r\na: 1\r\n---" is 14 characters.
    const document = parseDocument("---\r\na: 1\r\n---\r\nText", "t.md");
    assert.equal(document.frontmatterText, "a: 1");
    assert.equal(document.frontmatterEnd, 14);
  });
});
