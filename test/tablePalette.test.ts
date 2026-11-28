// The palette of the five predefined table colours: reading it from untrusted JSON and turning it into CSS.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_TABLE_ACCENTS, normalizePalette, tablePaletteCss } from "../src/lib/tablePalette.ts";

describe("normalizing a palette", () => {
  test("keeps the five known names with valid colours, lower-cased, 3-digit expanded, trimmed", () => {
    assert.deepEqual(normalizePalette({ info: "#ABCDEF", success: " #0f8 ", warning: "#123456", danger: "#FFF", note: "#000000" }), {
      info: "#abcdef",
      success: "#00ff88",
      warning: "#123456",
      danger: "#ffffff",
      note: "#000000",
    });
  });

  test("drops unknown names and invalid colours", () => {
    assert.deepEqual(normalizePalette({ info: "blue", success: "#12345", warning: 3, danger: null, note: "#gggggg", purple: "#ffffff", "": "#ffffff", extra: { a: 1 } }), {});
    assert.deepEqual(normalizePalette({ info: "#fff;}", danger: "url(x)", note: "#12345678" }), {});
  });

  test("keeps an entry equal to the default accent", () => {
    assert.deepEqual(normalizePalette({ info: DEFAULT_TABLE_ACCENTS.info }), { info: "#3b82f6" });
  });

  test("anything that is not an object gives {}", () => {
    for (const value of [null, undefined, [], ["#fff"], "#fff", 3, true]) assert.deepEqual(normalizePalette(value), {});
  });
});

describe("the palette's CSS", () => {
  test("is empty for an empty palette", () => {
    assert.equal(tablePaletteCss({}, "document"), "");
    assert.equal(tablePaletteCss({}, "page"), "");
  });

  test("the document target has a light and a dark rule with a doubled class, derived from the accent", () => {
    const css = tablePaletteCss({ danger: "#112233" }, "document");
    assert.match(css, /\.document table\.table-color-danger\.table-color-danger \{[^}]*--tbl-accent: #112233;/);
    assert.match(css, /:root\[data-mode="dark"\]:not\(\.ld-white-background\) \.document table\.table-color-danger\.table-color-danger \{/);
    assert.match(css, /--tbl-accent-soft: color-mix\(in srgb, #112233 20%, white\);/);
    assert.match(css, /--tbl-accent-stripe: color-mix\(in srgb, #112233 8%, white\);/);
    assert.match(css, /--tbl-accent-text: color-mix\(in srgb, #112233 45%, black\);/);
    assert.match(css, /--tbl-accent: color-mix\(in srgb, #112233 70%, white\);/);
    assert.match(css, /--tbl-accent-soft: color-mix\(in srgb, color-mix\(in srgb, #112233 50%, black\) 55%, transparent\);/);
    assert.match(css, /--tbl-accent-stripe: color-mix\(in srgb, color-mix\(in srgb, #112233 50%, black\) 35%, transparent\);/);
    assert.match(css, /--tbl-accent-text: color-mix\(in srgb, #112233 30%, white\);/);
  });

  test("the page target has the light rule only", () => {
    const css = tablePaletteCss({ info: "#445566" }, "page");
    assert.match(css, /^table\.table-color-info\.table-color-info \{/);
    assert.doesNotMatch(css, /dark|\.document/);
    assert.match(css, /--tbl-accent: #445566;/);
  });

  test("only the colours present get rules", () => {
    const css = tablePaletteCss({ info: "#445566", note: "#778899" }, "page");
    assert.match(css, /table-color-info/);
    assert.match(css, /table-color-note/);
    assert.doesNotMatch(css, /table-color-success|table-color-warning|table-color-danger/);
  });

  test("ignores entries that are not a colour, reads the others as normalizePalette does", () => {
    const bad = { info: "red", success: "#fff", warning: "#12345g", danger: "#112233;} body{", note: "#ABCDEF" } as Record<string, string>;
    const css = tablePaletteCss(bad, "page");
    assert.doesNotMatch(css, /info|warning|danger|body|red/);
    assert.match(css, /table-color-success[^}]*--tbl-accent: #ffffff;/);
    assert.match(css, /table-color-note[^}]*--tbl-accent: #abcdef;/);
    assert.equal(tablePaletteCss({ info: "red" }, "document"), "");
  });
});
