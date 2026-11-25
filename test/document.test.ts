// The Document model: what the Module reads from a Document's text (docs/spec/frontmatter.md).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseDocument, setField, setType } from "../src/lib/document.ts";
import { applyEdits } from "../src/lib/edits.ts";

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

describe("the html_template and language fields", () => {
  test("read trimmed from the frontmatter", () => {
    const document = parseDocument("---\nhtml_template:   article  \nlanguage: fr\n---\nText\n", "a.md");
    assert.equal(document.htmlTemplate, "article");
    assert.equal(document.language, "fr");
  });

  test("null when absent or empty", () => {
    const absent = parseDocument("---\ntitle: T\n---\n", "a.md");
    assert.equal(absent.htmlTemplate, null);
    assert.equal(absent.language, null);
    const empty = parseDocument("---\nhtml_template:\nlanguage: \"  \"\n---\n", "a.md");
    assert.equal(empty.htmlTemplate, null);
    assert.equal(empty.language, null);
    assert.equal(parseDocument("Text\n", "a.md").htmlTemplate, null);
  });

  test("read line by line from an invalid frontmatter", () => {
    const document = parseDocument("---\nhtml_template: article\nlanguage: fr\ntitle: [oops\n---\n", "a.md");
    assert.equal(document.frontmatter.valid, false);
    assert.equal(document.htmlTemplate, "article");
    assert.equal(document.language, "fr");
  });
});

describe("setting a frontmatter field", () => {
  const set = (text: string, name: string, value: string) => applyEdits(text, [setField(text, name, value)!]);

  test("an existing field is replaced in place, every other byte stays", () => {
    const text = '---\n# kept comment\ntitle:   "X"  # note\nhtml_template: article\ntags: [a,   b]\n---\n# Body\n';
    assert.equal(set(text, "html_template", "interview-sheet"), '---\n# kept comment\ntitle:   "X"  # note\nhtml_template: interview-sheet\ntags: [a,   b]\n---\n# Body\n');
  });

  test("a replaced line keeps its own CRLF line ending", () => {
    assert.equal(set("---\r\nlanguage: en\r\nx: 1\r\n---\r\nText", "language", "fr"), "---\r\nlanguage: fr\r\nx: 1\r\n---\r\nText");
  });

  test("a field on the last line of the block is replaced", () => {
    assert.equal(set("---\ntitle: T\nlanguage: en\n---\nText\n", "language", "fr"), "---\ntitle: T\nlanguage: fr\n---\nText\n");
  });

  test("a missing field is appended as the last line of the block", () => {
    assert.equal(set("---\ntitle:   T  # c\n---\n# T\n", "language", "fr"), "---\ntitle:   T  # c\nlanguage: fr\n---\n# T\n");
  });

  test("appending uses CRLF when the block does", () => {
    assert.equal(set("---\r\ntitle: T\r\n---\r\nText", "language", "fr"), "---\r\ntitle: T\r\nlanguage: fr\r\n---\r\nText");
  });

  test("appending to an empty frontmatter", () => {
    assert.equal(set("---\n---\nText\n", "html_template", "article"), "---\nhtml_template: article\n---\nText\n");
  });

  test("a Document without a frontmatter gets one at the top", () => {
    assert.equal(set("# Title\n\nText\n", "language", "fr"), "---\nlanguage: fr\n---\n# Title\n\nText\n");
    assert.equal(set("", "language", "fr"), "---\nlanguage: fr\n---\n");
  });

  test("only a top-level key at column 0 counts, not a line inside another field's value", () => {
    assert.equal(
      set("---\ndescription: |\n  html_template: no\ntitle: T\n---\nText\n", "html_template", "article"),
      "---\ndescription: |\n  html_template: no\ntitle: T\nhtml_template: article\n---\nText\n",
    );
  });

  test("a key that merely starts with the name is not the field", () => {
    assert.equal(
      set("---\nhtml_template_old: x\n---\nText\n", "html_template", "article"),
      "---\nhtml_template_old: x\nhtml_template: article\n---\nText\n",
    );
  });

  test("an invalid frontmatter is refused", () => {
    assert.equal(setField("---\nhtml_template: article\ntitle: [oops\n---\nText\n", "html_template", "x"), null);
  });
});

describe("the creation date", () => {
  const created = (frontmatter: string) => parseDocument(`---\n${frontmatter}\n---\n`, "x.md").created;

  test("a date alone is read as written", () => {
    assert.equal(created("timestamp: 2024-03-05"), "2024-03-05");
  });

  test("a date with a time is cut to the minute, with a T or a space", () => {
    assert.equal(created("timestamp: 2024-03-05T10:20:30"), "2024-03-05T10:20");
    assert.equal(created('timestamp: "2024-03-05 10:20:30"'), "2024-03-05T10:20");
    assert.equal(created('timestamp: "2024-03-05T10:20:00"'), "2024-03-05T10:20");
  });

  test("an unquoted timestamp is read as written, not converted", () => {
    assert.equal(created("timestamp: 2024-03-05T10:20:00"), "2024-03-05T10:20");
    assert.equal(created("timestamp: 2024-03-05T23:59:00Z"), "2024-03-05T23:59");
  });

  test("null when absent or not starting with a date", () => {
    assert.equal(created("title: A"), null);
    assert.equal(created("timestamp: yesterday"), null);
    assert.equal(created("timestamp: 12"), null);
    assert.equal(parseDocument("# A\n", "x.md").created, null);
  });

  test("read from an invalid frontmatter's line-by-line fields", () => {
    assert.equal(created("timestamp: 2024-03-05T10:20:00\ntitle: [unclosed"), "2024-03-05T10:20");
  });
});

describe("setting the type", () => {
  const typed = (text: string, type: string | null) => applyEdits(text, [setType(text, type)!]);
  const cleared = (text: string) => typed(text, null);

  test("a missing field is appended as the block's last line", () => {
    assert.equal(typed("---\ntitle: A\n---\n# A\n", "ADR"), "---\ntitle: A\ntype: ADR\n---\n# A\n");
  });

  test("an existing line is replaced in place, its trailing comment and the other lines kept", () => {
    assert.equal(typed("---\ntype: Old  # note\ntags: [a]\n---\n", "New"), "---\ntype: New  # note\ntags: [a]\n---\n");
    assert.equal(typed("---\ntype: a#b # c\n---\n", "X"), "---\ntype: X # c\n---\n");
    assert.equal(typed("---\ntype: \"x # y\"\n---\n", "X"), "---\ntype: X\n---\n");
  });

  test("clearing removes the trailing comment with its field", () => {
    assert.equal(cleared("---\ntype: Old # note\nx: 1\n---\n"), "---\nx: 1\n---\n");
  });

  test("a quoted type key is the field, never doubled", () => {
    assert.equal(typed("---\n\"type\": Old\nx: 1\n---\n", "New"), "---\ntype: New\nx: 1\n---\n");
    assert.equal(typed("---\n'type': Old\n---\n", "New"), "---\ntype: New\n---\n");
  });

  test("a Document without frontmatter gets a block at the top", () => {
    assert.equal(typed("# A\n", "Guide"), "---\ntype: Guide\n---\n# A\n");
  });

  test("a value continuing on following lines is replaced whole", () => {
    assert.equal(typed("---\ntype: >\n  long\n  text\nx: 1\n---\n", "T"), "---\ntype: T\nx: 1\n---\n");
    assert.equal(typed("---\ntype: |\n  a\n\n  b\nx: 1\n---\n", "T"), "---\ntype: T\nx: 1\n---\n");
    assert.equal(typed("---\ntype: one\n  two\n---\n", "T"), "---\ntype: T\n---\n");
  });

  test("only a top-level type key matches", () => {
    assert.equal(typed("---\nsubtype: a\ntypes: b\nmeta:\n  type: c\n---\n", "T"), "---\nsubtype: a\ntypes: b\nmeta:\n  type: c\ntype: T\n---\n");
  });

  test("line endings are kept", () => {
    assert.equal(typed("---\r\ntype: X\r\nb: 1\r\n---\r\n", "Y"), "---\r\ntype: Y\r\nb: 1\r\n---\r\n");
    assert.equal(typed("---\r\ntitle: A\r\n---\r\n", "Y"), "---\r\ntitle: A\r\ntype: Y\r\n---\r\n");
  });

  test("the value is trimmed and its whitespace collapsed to one space", () => {
    assert.equal(typed("---\na: 1\n---\n", "  Big \n  decision\t record "), "---\na: 1\ntype: Big decision record\n---\n");
  });

  test("a value YAML would misread is quoted so it reads back as that string", () => {
    for (const value of ["ADR: decision", "a: b", "#tag", "true", "123", "- x", '"quoted', "null", "x #y", "[a]", "{a: 1}", "'q", "@a", "*a", "&a", "!a", "%a", "|", ">", "?", "a'b"]) {
      const text = typed("---\ntitle: A\n---\n", value);
      assert.equal(parseDocument(text, "x.md").type, value, value);
      assert.equal(parseDocument(text, "x.md").title, "A");
    }
  });

  test("a plain value stays plain", () => {
    assert.equal(typed("---\n---\n", "Decision record"), "---\ntype: Decision record\n---\n");
  });

  test("a long value is not folded", () => {
    const value = "word ".repeat(40).trim();
    assert.equal(typed("---\n---\n", value), `---\ntype: ${value}\n---\n`);
  });

  test("clearing removes the whole field with its line ending", () => {
    assert.equal(typed("---\r\ntitle: A\r\ntype: X\r\n---\r\n", null), "---\r\ntitle: A\r\n---\r\n");
    assert.equal(typed("---\ntype: X\ntitle: A\n---\n", null), "---\ntitle: A\n---\n");
    assert.equal(typed("---\ntype: >\n  a\n  b\nx: 1\n---\n", null), "---\nx: 1\n---\n");
  });

  test("an empty value clears", () => {
    assert.equal(typed("---\ntype: X\ntitle: A\n---\n", "  \n "), "---\ntitle: A\n---\n");
  });

  test("clearing the last field keeps an empty block", () => {
    assert.equal(typed("---\ntype: X\n---\nText\n", null), "---\n---\nText\n");
  });

  test("clearing a missing field changes nothing", () => {
    for (const text of ["---\ntitle: A\n---\n", "# A\n", "---\n---\n"]) assert.equal(typed(text, null), text);
  });

  test("an invalid frontmatter is refused", () => {
    assert.equal(setType("---\ntitle: [unclosed\n---\n", "X"), null);
    assert.equal(setType("---\ntitle: [unclosed\n---\n", null), null);
  });
});
