// The built-in HTML template library (rule R1): two fixed templates, their stylesheets scoped to the page.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { HTML_TEMPLATES, htmlTemplateOf } from "../src/lib/htmlTemplates.ts";

describe("library", () => {
  test("lists interviews › interview-sheet, then articles › article", () => {
    assert.deepEqual(
      HTML_TEMPLATES.map(({ id, folder }) => [id, folder]),
      [
        ["interview-sheet", "interviews"],
        ["article", "articles"],
      ],
    );
  });

  test("htmlTemplateOf finds a template by its html_template value", () => {
    assert.equal(htmlTemplateOf("article")?.id, "article");
    assert.equal(htmlTemplateOf("interview-sheet")?.folder, "interviews");
  });

  test("htmlTemplateOf is null for an unknown value and for null", () => {
    assert.equal(htmlTemplateOf("magazine"), null);
    assert.equal(htmlTemplateOf("Article"), null);
    assert.equal(htmlTemplateOf(null), null);
  });
});

describe("stylesheets", () => {
  for (const template of HTML_TEMPLATES) {
    test(`${template.id}: sets its custom properties on .ld-html-page, never on :root`, () => {
      assert.match(template.css, /\.ld-html-page \{\s*--[a-z-]+:/);
      assert.doesNotMatch(template.css, /^\s*:root\b/m);
    });

    test(`${template.id}: no html or body selector, but print and page rules stay`, () => {
      assert.doesNotMatch(template.css, /^\s*(html|body)\b/m);
      assert.match(template.css, /@page \{/);
      assert.match(template.css, /@media print \{/);
    });
  }

  test("each template keeps its own look", () => {
    assert.match(htmlTemplateOf("interview-sheet")!.css, /--accent: #0f5c5c;/);
    assert.match(htmlTemplateOf("article")!.css, /--accent: #1d4e89;/);
  });
});
