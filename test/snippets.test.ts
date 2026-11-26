// Snippets (docs/design.md §9): the Markdown each kind of snippet writes, reads back and is recognized by. Expected Markdown is written out literally.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { EMOJI_GROUPS, searchEmojis } from "../src/lib/emojis.ts";
import {
  buildSnippet,
  detectSnippet,
  documentHeadings,
  EDITABLE_KINDS,
  TABLE_FILLS,
  TABLE_STYLES,
  newSnippet,
  parseSnippet,
  showsPreview,
  SNIPPET_CATEGORIES,
  SWATCHES,
  type SnippetData,
  type SnippetKind,
  type SnippetTexts,
} from "../src/lib/snippets.ts";

const texts: SnippetTexts = {
  heading: "My heading",
  collapsibleSummary: "Details",
  collapsibleBody: "## Title\n\nText",
  item: "Item",
  subItem: "Sub-item",
  subSubItem: "Sub-sub-item",
  tableHeader: "Header",
  treeFolder: "folder/",
  treeFile: "file.md",
  treeEmpty: "(empty)",
  code: "// code here",
  quote: "Quote here",
  quoteAuthor: "Author",
  imageAlt: "image",
  imageUrl: "./images/my-image.png",
  linkText: "link text",
  anchorText: "anchor text",
  anchor: "anchor",
  coloredText: "colored text",
  coloredSection: "colored section",
  kanbanColumns: ["Todo", "Doing", "Done"],
};

const build = (data: SnippetData) => buildSnippet(data, texts);

describe("the picker", () => {
  test("lists the 22 kinds in four categories, in order", () => {
    assert.deepEqual(
      SNIPPET_CATEGORIES.map((each) => [each.key, each.kinds.join(" ")]),
      [
        ["structure", "heading-1 heading-2 heading-3 heading-4 separator collapsible unordered-list ordered-list table kanban"],
        ["code", "tree code-block compare"],
        ["rich-text", "colored-text colored-section blockquote emojis"],
        ["links-media", "link doc-link anchor-link anchor-doc-link image"],
      ],
    );
  });

  test("the reading view reopens every kind but emojis and kanban", () => {
    const all = SNIPPET_CATEGORIES.flatMap((each) => each.kinds);
    assert.deepEqual(all.filter((kind) => !EDITABLE_KINDS.has(kind)), ["kanban", "emojis"]);
    assert.equal(EDITABLE_KINDS.size, 20);
  });

  test("the dialog shows the Markdown preview only for kinds without their own live preview", () => {
    const shown = SNIPPET_CATEGORIES.flatMap((each) => each.kinds).filter(showsPreview);
    assert.deepEqual(shown, ["separator", "kanban", "compare", "emojis", "link", "doc-link", "anchor-link", "anchor-doc-link", "image"]);
  });
});

describe("a new form", () => {
  test("lists hold the 3-level example", () => {
    assert.equal(
      build(newSnippet("unordered-list", texts)),
      "- Item 1\n- Item 2\n  - Sub-item 2.1\n  - Sub-item 2.2\n- Item 3\n  - Sub-item 3.1\n    - Sub-sub-item 3.1.1",
    );
    assert.equal(
      build(newSnippet("ordered-list", texts)),
      "1. Item 1\n2. Item 2\n   1. Sub-item 2.1\n   2. Sub-item 2.2\n3. Item 3\n   1. Sub-item 3.1\n      1. Sub-sub-item 3.1.1",
    );
  });

  test("the table is 2x2 with an empty row, the tree a folder and an indented file", () => {
    assert.deepEqual(newSnippet("table", texts), { kind: "table", style: "", fill: "", bordered: false, rounded: false, color: "", rows: [["Header 1", "Header 2"], ["", ""]] });
    assert.deepEqual(newSnippet("tree", texts), { kind: "tree", items: [{ name: "folder/", depth: 0 }, { name: "file.md", depth: 1 }] });
  });

  test("kanban has three columns, collapsible its summary, colored kinds the info swatch", () => {
    assert.deepEqual(newSnippet("kanban", texts), {
      kind: "kanban",
      columns: [{ label: "Todo", color: "sky" }, { label: "Doing", color: "amber" }, { label: "Done", color: "emerald" }],
    });
    assert.deepEqual(newSnippet("collapsible", texts), { kind: "collapsible", summary: "Details", body: "" });
    assert.deepEqual(newSnippet("colored-text", texts), { kind: "colored-text", color: "info", text: "" });
    assert.deepEqual(newSnippet("colored-section", texts), { kind: "colored-section", color: "info", content: "" });
  });

  test("everything else starts empty", () => {
    assert.deepEqual(newSnippet("heading-2", texts), { kind: "heading-2", text: "" });
    assert.deepEqual(newSnippet("image", texts), { kind: "image", alt: "", url: "", width: "", align: "" });
    assert.deepEqual(newSnippet("blockquote", texts), { kind: "blockquote", type: "", icon: false, title: "", content: "" });
  });
});

describe("headings and separator", () => {
  test("a heading is trimmed, and falls back to the translated text", () => {
    assert.equal(build({ kind: "heading-3", text: "  Hello " }), "### Hello");
    assert.equal(build({ kind: "heading-1", text: "" }), "# My heading");
    assert.equal(build({ kind: "heading-4", text: "   " }), "#### My heading");
  });

  test("a separator is three dashes", () => {
    assert.equal(build({ kind: "separator" }), "---");
  });
});

describe("collapsible", () => {
  test("writes details, summary and body, with fallbacks", () => {
    assert.equal(build({ kind: "collapsible", summary: "More", body: "Hidden" }), "<details>\n<summary>More</summary>\n\nHidden\n\n</details>");
    assert.equal(build({ kind: "collapsible", summary: "", body: "  \n" }), "<details>\n<summary>Details</summary>\n\n## Title\n\nText\n\n</details>");
  });
});

describe("lists (R7)", () => {
  test("lines with markers are kept as typed, blank lines dropped", () => {
    assert.equal(build({ kind: "unordered-list", items: "- a\n\n  * b\n\n- c" }), "- a\n  * b\n- c");
    assert.equal(build({ kind: "ordered-list", items: "1. a\n\n2. b" }), "1. a\n2. b");
  });

  test("plain lines become items", () => {
    assert.equal(build({ kind: "unordered-list", items: "a\n\n  b\nc" }), "- a\n  - b\n- c");
  });

  test("ordered plain lines are numbered per indentation level", () => {
    assert.equal(build({ kind: "ordered-list", items: "a\nb\n  c\n  d\ne" }), "1. a\n2. b\n  1. c\n  2. d\n3. e");
  });

  test("an empty text gives the translated example", () => {
    assert.equal(build({ kind: "unordered-list", items: "" }).split("\n")[0], "- Item 1");
  });
});

describe("table", () => {
  test("pads cells to the column width, with a separator of at least three dashes", () => {
    assert.equal(
      build({ kind: "table", style: "", fill: "", bordered: false, rounded: false, color: "", rows: [["Name", "Qty"], ["apple", "1"], ["", ""]] }),
      ["| Name  | Qty |", "| ----- | --- |", "| apple | 1   |", "|       |     |"].join("\n"),
    );
  });

  test("directives come first, in the order style, fill, border, rounded, color, each only when set", () => {
    assert.equal(
      build({ kind: "table", style: "compact", fill: "striped", bordered: true, rounded: true, color: "info", rows: [["a"]] }),
      "<!-- table-style: compact -->\n<!-- table-fill: striped -->\n<!-- table-border: bordered -->\n<!-- table-rounded -->\n<!-- table-color: info -->\n| a   |\n| --- |",
    );
    assert.equal(
      build({ kind: "table", style: "", fill: "", bordered: false, rounded: false, color: "note", rows: [["a"]] }),
      "<!-- table-color: note -->\n| a   |\n| --- |",
    );
    assert.equal(
      build({ kind: "table", style: "intermediate", fill: "full", bordered: false, rounded: true, color: "", rows: [["a"]] }),
      "<!-- table-style: intermediate -->\n<!-- table-fill: full -->\n<!-- table-rounded -->\n| a   |\n| --- |",
    );
  });

  test("the option lists are the select's choices after Default, and the exclusive fills", () => {
    assert.deepEqual(TABLE_STYLES, ["intermediate", "compact"]);
    assert.deepEqual(TABLE_FILLS, ["striped", "full"]);
  });

  test("a pipe in a cell is written \\| and read back as |", () => {
    const markdown = build({ kind: "table", style: "", fill: "", bordered: false, rounded: false, color: "", rows: [["a|b", "c"], ["d", "e"]] });
    assert.equal(markdown, ["| a\\|b | c   |", "| ---- | --- |", "| d    | e   |"].join("\n"));
    assert.deepEqual(parseSnippet("table", markdown), { kind: "table", style: "", fill: "", bordered: false, rounded: false, color: "", rows: [["a|b", "c"], ["d", "e"]] });
  });

  test("reads the legacy bordered style as the border", () => {
    assert.deepEqual(parseSnippet("table", "<!-- table-style: bordered -->\n| a |\n| --- |"), { kind: "table", style: "", fill: "", bordered: true, rounded: false, color: "", rows: [["a"]] });
  });

  test("reads the legacy striped style as the fill", () => {
    assert.deepEqual(parseSnippet("table", "<!-- table-style: striped -->\n| a |\n| --- |"), { kind: "table", style: "", fill: "striped", bordered: false, rounded: false, color: "", rows: [["a"]] });
  });

  test("reads the legacy full style as the full fill, rounded", () => {
    assert.deepEqual(parseSnippet("table", "<!-- table-style: full -->\n| a |\n| --- |"), { kind: "table", style: "", fill: "full", bordered: false, rounded: true, color: "", rows: [["a"]] });
  });

  test("a density and a legacy fill are read independently", () => {
    assert.deepEqual(parseSnippet("table", "<!-- table-style: compact -->\n<!-- table-style: striped -->\n| a |\n| --- |"), { kind: "table", style: "compact", fill: "striped", bordered: false, rounded: false, color: "", rows: [["a"]] });
  });

  test("reads every new directive", () => {
    assert.deepEqual(
      parseSnippet("table", "<!-- table-style: intermediate -->\n<!-- table-fill: full -->\n<!-- table-border: bordered -->\n<!-- table-rounded -->\n<!-- table-color: danger -->\n| a |\n| --- |"),
      { kind: "table", style: "intermediate", fill: "full", bordered: true, rounded: true, color: "danger", rows: [["a"]] },
    );
  });

  test("a table with only the new directives is still detected as a table", () => {
    assert.equal(detectSnippet("<!-- table-rounded -->\n<!-- table-fill: striped -->\n| a |\n| --- |\n| b |"), "table");
  });

});

describe("kanban", () => {
  test("writes the marker line", () => {
    assert.equal(
      build({ kind: "kanban", columns: [{ label: "To do", color: "sky" }, { label: "Done", color: "rose" }] }),
      '<div data-ld-kanban data-columns="To do|Done" data-colors="sky|rose"></div>',
    );
  });

  test("keeps 6 columns at most, turns | into a space, drops empty names", () => {
    const columns = ["a|b", " ", "c", "d", "e", "f", "g"].map((label) => ({ label, color: "sky" as const }));
    assert.equal(build({ kind: "kanban", columns }), '<div data-ld-kanban data-columns="a b|c|d|e|f" data-colors="sky|sky|sky|sky|sky"></div>');
  });

  test("falls back to the translated columns when none is left", () => {
    assert.equal(build({ kind: "kanban", columns: [{ label: "", color: "sky" }] }), '<div data-ld-kanban data-columns="Todo|Doing|Done" data-colors="sky|amber|emerald"></div>');
  });

  test("an unknown colour becomes the default of its position", () => {
    const columns = [{ label: "a", color: "sky" }, { label: "b", color: "pink" }, { label: "c", color: "ROSE" }] as unknown as { label: string; color: "sky" }[];
    assert.equal(build({ kind: "kanban", columns }), '<div data-ld-kanban data-columns="a|b|c" data-colors="sky|amber|rose"></div>');
  });

  test("escapes & and \" in names", () => {
    assert.equal(build({ kind: "kanban", columns: [{ label: 'R&D "x"', color: "sky" }] }), '<div data-ld-kanban data-columns="R&amp;D &quot;x&quot;" data-colors="sky"></div>');
    assert.deepEqual(parseSnippet("kanban", '<div data-ld-kanban data-columns="R&amp;D &quot;x&quot;" data-colors="sky"></div>'), { kind: "kanban", columns: [{ label: 'R&D "x"', color: "sky" }] });
  });
});

describe("tree", () => {
  test("draws the branches with continuation bars and a corner for last items", () => {
    const items = [
      { name: "src/", depth: 0 },
      { name: "lib/", depth: 1 },
      { name: "a.ts", depth: 2 },
      { name: "b.ts", depth: 2 },
      { name: "main.ts", depth: 1 },
      { name: "README.md", depth: 0 },
    ];
    assert.equal(
      build({ kind: "tree", items }),
      "```text\nsrc/\n├── lib/\n│   ├── a.ts\n│   └── b.ts\n└── main.ts\nREADME.md\n```",
    );
  });

  test("names are written as typed, a slash changes nothing", () => {
    assert.equal(build({ kind: "tree", items: [{ name: "dir", depth: 0 }, { name: "sub/", depth: 1 }] }), "```text\ndir\n└── sub/\n```");
  });

  test("no items gives the translated empty text", () => {
    assert.equal(build({ kind: "tree", items: [] }), "```text\n(empty)\n```");
  });
});

describe("code block", () => {
  test("writes the fence with its language", () => {
    assert.equal(build({ kind: "code-block", language: "ts", code: "let a = 1;", width: "", align: "" }), "```ts\nlet a = 1;\n```");
    assert.equal(build({ kind: "code-block", language: "", code: "", width: "", align: "" }), "```\n// code here\n```");
  });

  test("width then align directives", () => {
    assert.equal(
      build({ kind: "code-block", language: "js", code: "x", width: "1/2", align: "center" }),
      "<!-- code-width: 1/2 -->\n<!-- code-align: center -->\n```js\nx\n```",
    );
  });

  test("a mermaid block (any case) writes mermaid directives", () => {
    assert.equal(
      build({ kind: "code-block", language: "Mermaid", code: "graph TD", width: "full", align: "left" }),
      "<!-- mermaid-width: full -->\n<!-- mermaid-align: left -->\n```Mermaid\ngraph TD\n```",
    );
  });

  test("a longer fence wraps code that holds a fence", () => {
    const markdown = build({ kind: "code-block", language: "md", code: "```js\nx\n```", width: "", align: "" });
    assert.equal(markdown, "````md\n```js\nx\n```\n````");
    assert.deepEqual(parseSnippet("code-block", markdown), { kind: "code-block", language: "md", code: "```js\nx\n```", width: "", align: "" });
  });

  test("compare wraps its content", () => {
    assert.equal(build({ kind: "compare", content: "| a |\n| --- |" }), ":::compare\n| a |\n| --- |\n:::");
  });
});

describe("rich text", () => {
  test("colored text uses the swatch border, with a fallback text", () => {
    assert.equal(build({ kind: "colored-text", color: "danger", text: "Careful" }), '<span style="color:#ef4444;">Careful</span>');
    assert.equal(build({ kind: "colored-text", color: "info", text: "" }), '<span style="color:#3b82f6;">colored text</span>');
  });

  test("colored section writes the swatch's three colours", () => {
    assert.equal(
      build({ kind: "colored-section", color: "success", content: "Done." }),
      '<div style="background:#f0fdf4;border-left:4px solid #22c55e;color:#14532d;padding:1rem 1.25rem;border-radius:0.375rem;margin:1rem 0;">\n\nDone.\n\n</div>',
    );
    assert.match(build({ kind: "colored-section", color: "neutral", content: "" }), /\n\ncolored section\n\n<\/div>$/);
  });

  test("reopening maps the border colour back to a swatch, case ignored, unknown is info", () => {
    assert.deepEqual(parseSnippet("colored-text", '<span style="color:#EF4444;">x</span>'), { kind: "colored-text", color: "danger", text: "x" });
    assert.deepEqual(parseSnippet("colored-text", '<span style="color:#123456;">x</span>'), { kind: "colored-text", color: "info", text: "x" });
    assert.deepEqual(parseSnippet("colored-section", build({ kind: "colored-section", color: "note", content: "a\n\nb" })), { kind: "colored-section", color: "note", content: "a\n\nb" });
    assert.equal(SWATCHES.neutral.border, "#6b7280");
  });

  test("a blockquote prefixes every line, a blank one with just >", () => {
    assert.equal(build({ kind: "blockquote", type: "", icon: false, title: "", content: "one\n\ntwo" }), "> one\n>\n> two");
  });

  test("a blockquote's type, title and icon come first, in that order", () => {
    assert.equal(
      build({ kind: "blockquote", type: "warning", icon: true, title: "Careful", content: "x" }),
      "<!-- quote-type: warning -->\n<!-- quote-title: Careful -->\n<!-- quote-icon -->\n> x",
    );
  });

  test("an empty blockquote holds the translated quote and author", () => {
    assert.equal(build({ kind: "blockquote", type: "", icon: false, title: "", content: "" }), "> Quote here\n>\n> — Author");
  });

  test("a blockquote read back accepts type aliases", () => {
    assert.deepEqual(parseSnippet("blockquote", "<!-- quote-type: tip -->\n> hi"), { kind: "blockquote", type: "success", icon: false, title: "", content: "hi" });
    assert.equal((parseSnippet("blockquote", "<!-- quote-type: danger -->\n> hi") as { type: string }).type, "error");
  });

  test("emojis are written as typed", () => {
    assert.equal(build({ kind: "emojis", value: "😀🎉" }), "😀🎉");
  });
});

describe("links and images", () => {
  test("a link is an anchor opening a new tab, with fallbacks", () => {
    assert.equal(build({ kind: "link", text: "Site", url: "https://a.b" }), '<a href="https://a.b" target="_blank">Site</a>');
    assert.equal(build({ kind: "link", text: "", url: "" }), '<a href="https://..." target="_blank">link text</a>');
  });

  test("a link read back also accepts the Markdown form", () => {
    assert.deepEqual(parseSnippet("link", "[Site](https://a.b)"), { kind: "link", text: "Site", url: "https://a.b" });
  });

  test("a doc link encodes the path without .md", () => {
    assert.equal(build({ kind: "doc-link", text: "Doc", path: "folder/my doc.md", title: "T" }), "[Doc](?doc=folder%2Fmy%20doc)");
    assert.equal(build({ kind: "doc-link", text: "", path: "a.md", title: "Title A" }), "[Title A](?doc=a)");
    assert.deepEqual(parseSnippet("doc-link", "[Doc](?doc=folder%2Fmy%20doc)"), { kind: "doc-link", text: "Doc", path: "folder/my doc.md", title: "" });
  });

  test("anchor links, with fallbacks", () => {
    assert.equal(build({ kind: "anchor-link", text: "Up", anchor: "intro" }), "[Up](#intro)");
    assert.equal(build({ kind: "anchor-link", text: "", anchor: "" }), "[anchor text](#anchor)");
    assert.equal(build({ kind: "anchor-doc-link", text: "Go", path: "a/b.md", anchor: "setup" }), "[Go](?doc=a%2Fb#setup)");
    assert.equal(build({ kind: "anchor-doc-link", text: "", path: "a.md", anchor: "" }), "[anchor text](?doc=a#anchor)");
  });

  test("an image with width then align, and fallbacks", () => {
    assert.equal(build({ kind: "image", alt: "Logo", url: "./a.png", width: "1/3", align: "right" }), "<!-- image-width: 1/3 -->\n<!-- image-align: right -->\n![Logo](./a.png)");
    assert.equal(build({ kind: "image", alt: "", url: "", width: "", align: "" }), "![image](./images/my-image.png)");
  });
});

const filled: SnippetData[] = [
  { kind: "heading-1", text: "Title" },
  { kind: "heading-4", text: "Deep" },
  { kind: "separator" },
  { kind: "collapsible", summary: "More", body: "## Sub\n\nText" },
  { kind: "unordered-list", items: "- a\n  - b" },
  { kind: "ordered-list", items: "1. a\n   1. b" },
  { kind: "table", style: "intermediate", fill: "full", bordered: true, rounded: true, color: "warning", rows: [["a", "b"], ["c", ""]] },
  { kind: "kanban", columns: [{ label: "A", color: "violet" }, { label: "B", color: "slate" }] },
  { kind: "tree", items: [{ name: "src/", depth: 0 }, { name: "lib/", depth: 1 }, { name: "a.ts", depth: 2 }, { name: "m.ts", depth: 1 }] },
  { kind: "code-block", language: "ts", code: "let a = 1;\nlet b = 2;", width: "2/3", align: "right" },
  { kind: "code-block", language: "mermaid", code: "graph TD", width: "full", align: "" },
  { kind: "compare", content: "left\n\nright" },
  { kind: "colored-text", color: "success", text: "ok" },
  { kind: "colored-section", color: "danger", content: "Stop\n\nnow" },
  { kind: "blockquote", type: "info", icon: true, title: "Note", content: "a\n\nb" },
  { kind: "emojis", value: "🎉" },
  { kind: "link", text: "Site", url: "https://a.b" },
  { kind: "doc-link", text: "Doc", path: "folder/my doc.md", title: "" },
  { kind: "anchor-link", text: "Up", anchor: "intro" },
  { kind: "anchor-doc-link", text: "Go", path: "a/b.md", anchor: "setup" },
  { kind: "image", alt: "Logo", url: "./a.png", width: "1/4", align: "center" },
];

describe("round trip", () => {
  for (const data of filled) {
    test(`${data.kind} ${JSON.stringify(build(data)).slice(0, 40)} reads back as written`, () => {
      assert.deepEqual(parseSnippet(data.kind, build(data)), data);
    });
  }

  test("unparseable text gives empty values and never throws", () => {
    const kinds = SNIPPET_CATEGORIES.flatMap((each) => each.kinds);
    for (const kind of kinds) assert.doesNotThrow(() => parseSnippet(kind, "???"));
    assert.deepEqual(parseSnippet("link", "???"), { kind: "link", text: "", url: "" });
    assert.deepEqual(parseSnippet("kanban", "???"), { kind: "kanban", columns: [] });
  });
});

describe("detecting the kind of a text", () => {
  test("recognizes each kind written by its builder", () => {
    for (const data of filled) {
      if (data.kind === "emojis") continue;
      assert.equal(detectSnippet(build(data)), data.kind, build(data));
    }
  });

  test("recognizes the shapes the original did", () => {
    assert.equal(detectSnippet("  ## Heading  "), "heading-2");
    assert.equal(detectSnippet("[x](https://a.b)"), "link");
    assert.equal(detectSnippet('<a href="https://a.b" target="_blank">x</a>'), "link");
    assert.equal(detectSnippet("![a](b.png)"), "image");
    assert.equal(detectSnippet("<!-- table-color: info -->\n| a |\n| --- |\n| b |"), "table");
    assert.equal(detectSnippet("* a\n* b"), "unordered-list");
    assert.equal(detectSnippet("---"), "separator");
  });

  test("a plain paragraph is none", () => {
    assert.equal(detectSnippet("Just a paragraph."), null);
    assert.equal(detectSnippet(""), null);
  });
});

describe("headings of a Document", () => {
  test("lists depth, plain text and anchor id", () => {
    const text = "---\ntitle: X\n---\n# Intro\n\nText\n\n## The *big* `code` Part\n\nSetext\n---\n";
    assert.deepEqual(documentHeadings(text), [
      { depth: 1, text: "Intro", id: "intro" },
      { depth: 2, text: "The big code Part", id: "the-big-code-part" },
      { depth: 2, text: "Setext", id: "setext" },
    ]);
  });

  test("ignores headings in fenced code and in compare regions", () => {
    const text = "# A\n\n```md\n# not\n```\n\n:::compare\n# neither\n:::\n\n### B\n";
    assert.deepEqual(documentHeadings(text).map((each) => each.text), ["A", "B"]);
  });
});

describe("emoji picker", () => {
  test("holds the six groups", () => {
    assert.deepEqual(EMOJI_GROUPS.map((each) => each.key), ["smileys", "gestures", "hearts", "objects", "office", "symbols"]);
    assert.equal(EMOJI_GROUPS.flatMap((each) => each.emojis).length, 386);
  });

  test("a query of two characters or more matches the words, accents and case ignored", () => {
    const found = searchEmojis("  RIRE ");
    assert.ok(found.length > 0 && found.some((each) => each.e === "😆"));
    assert.ok(found.every((each) => /rire/.test(each.t)));
    assert.deepEqual(searchEmojis("zzzzqq"), []);
  });

  test("fewer than two characters gives every emoji", () => {
    assert.equal(searchEmojis("r").length, 386);
    assert.equal(searchEmojis(" ").length, 386);
  });
});
