// Snippets (docs/design.md §9): the Markdown each kind of snippet writes, reads back and is recognized by. Expected Markdown is written out literally.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { EMOJI_GROUPS, searchEmojis } from "../src/lib/emojis.ts";
import { pastedLink } from "../src/lib/pasted.ts";
import {
  buildSnippet,
  CARD_COLORS,
  CARD_PALETTE,
  detectSnippet,
  documentHeadings,
  MAX_TREE_LEVEL,
  MERMAID_CHARTS,
  SEQUENCE_ARROWS,
  NOTE_POSITIONS,
  COLUMN_COUNTS,
  VERTICAL_ALIGNS,
  TEXT_ALIGNS,
  GAPS,
  EDITABLE_KINDS,
  TABLE_FILLS,
  TABLE_STYLES,
  moveColumn,
  moveRow,
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
  column: "Column",
  card: "Card content",
  attachment: "file",
  attachmentUrl: "files/file",
  mermaidItem: "Item",
  mermaidPeriod: "Period",
  mermaidEvent: "Event",
  mermaidNode: "Node",
  mermaidParticipant: "Participant",
  mermaidMessage: "Message",
  mermaid: {
    pieTitle: "DOC WORKFLOW",
    pie: [{ label: "Drafting the first version", value: 50 }, { label: "Reviewing with stakeholders", value: 30 }, { label: "Publishing updates", value: 20 }],
    timelineTitle: "DOCUMENTATION ROADMAP",
    timeline: [
      { period: "2023", event: "First living notes" },
      { period: "2024", event: "Shared review workflow" },
      { period: "2024", event: "Visual diagram catalog" },
      { period: "2025", event: "Agent-assisted documentation" },
      { period: "2026", event: "Workspace automation" },
    ],
    tree: [
      { level: 0, label: "knowledge-workspace/", decorator: "", note: "" },
      { level: 1, label: "documents/", decorator: "", note: "" },
      { level: 2, label: "getting-started.md", decorator: "", note: "Start here" },
      { level: 2, label: "operations.md", decorator: "", note: "" },
      { level: 1, label: "diagrams/", decorator: "", note: "" },
      { level: 1, label: "automation.json", decorator: "", note: "Runs on every save" },
    ],
    sequence: [
      { type: "message", from: "Author", arrow: "->>", to: "Reviewer", message: "Request a review" },
      { type: "message", from: "Reviewer", arrow: "-->>", to: "Author", message: "Send comments" },
      { type: "note", position: "right of", participant: "Reviewer", text: "Checks the style guide" },
      { type: "message", from: "Author", arrow: "->>", to: "Reviewer", message: "Send the revised draft" },
      { type: "message", from: "Reviewer", arrow: "->>", to: "Publisher", message: "Approve the document" },
      { type: "message", from: "Publisher", arrow: "->>", to: "Author", message: "Document published" },
      { type: "message", from: "Publisher", arrow: "-->>", to: "Reviewer", message: "Confirm the release" },
    ],
  },
};

const build = (data: SnippetData) => buildSnippet(data, texts);

describe("the picker", () => {
  test("lists the 26 kinds in four categories, in order", () => {
    assert.deepEqual(
      SNIPPET_CATEGORIES.map((each) => [each.key, each.kinds.join(" ")]),
      [
        ["structure", "heading-1 heading-2 heading-3 heading-4 separator collapsible columns card unordered-list ordered-list table kanban"],
        ["code", "tree code-block mermaid compare"],
        ["rich-text", "colored-text colored-section blockquote emojis"],
        ["links-media", "link doc-link anchor-link anchor-doc-link image attachment"],
      ],
    );
  });

  test("the reading view reopens every kind but emojis and kanban", () => {
    const all = SNIPPET_CATEGORIES.flatMap((each) => each.kinds);
    assert.deepEqual(all.filter((kind) => !EDITABLE_KINDS.has(kind)), ["kanban", "emojis"]);
    assert.equal(EDITABLE_KINDS.size, 24);
  });

  test("the dialog shows the Markdown preview only for kinds without their own live preview", () => {
    const shown = SNIPPET_CATEGORIES.flatMap((each) => each.kinds).filter(showsPreview);
    assert.deepEqual(shown, ["separator", "columns", "card", "kanban", "mermaid", "compare", "emojis", "link", "doc-link", "anchor-link", "anchor-doc-link", "image"]);
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
    assert.deepEqual(newSnippet("table", texts), { kind: "table", style: "", fill: "", border: "", rounded: false, color: "", checkboxes: false, rows: [["Header 1", "Header 2"], ["", ""]] });
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
      build({ kind: "table", style: "", fill: "", border: "", rounded: false, color: "", checkboxes: false, rows: [["Name", "Qty"], ["apple", "1"], ["", ""]] }),
      ["| Name  | Qty |", "| ----- | --- |", "| apple | 1   |", "|       |     |"].join("\n"),
    );
  });

  test("directives come first, in the order style, fill, border, rounded, color, each only when set", () => {
    assert.equal(
      build({ kind: "table", style: "compact", fill: "striped", border: "bordered", rounded: true, color: "info", checkboxes: false, rows: [["a"]] }),
      "<!-- table-style: compact -->\n<!-- table-fill: striped -->\n<!-- table-border: bordered -->\n<!-- table-rounded -->\n<!-- table-color: info -->\n| a   |\n| --- |",
    );
    assert.equal(
      build({ kind: "table", style: "", fill: "", border: "", rounded: false, color: "note", checkboxes: false, rows: [["a"]] }),
      "<!-- table-color: note -->\n| a   |\n| --- |",
    );
    assert.equal(
      build({ kind: "table", style: "intermediate", fill: "full", border: "", rounded: true, color: "", checkboxes: false, rows: [["a"]] }),
      "<!-- table-style: intermediate -->\n<!-- table-fill: full -->\n<!-- table-rounded -->\n| a   |\n| --- |",
    );
  });

  test("the option lists are the select's choices after Default, and the exclusive fills", () => {
    assert.deepEqual(TABLE_STYLES, ["intermediate", "compact"]);
    assert.deepEqual(TABLE_FILLS, ["striped", "full"]);
  });

  test("a pipe in a cell is written \\| and read back as |", () => {
    const markdown = build({ kind: "table", style: "", fill: "", border: "", rounded: false, color: "", checkboxes: false, rows: [["a|b", "c"], ["d", "e"]] });
    assert.equal(markdown, ["| a\\|b | c   |", "| ---- | --- |", "| d    | e   |"].join("\n"));
    assert.deepEqual(parseSnippet("table", markdown), { kind: "table", style: "", fill: "", border: "", rounded: false, color: "", checkboxes: false, rows: [["a|b", "c"], ["d", "e"]] });
  });

  test("writes the softened border at the border's place in the order", () => {
    assert.equal(
      build({ kind: "table", style: "compact", fill: "striped", border: "soft-bordered", rounded: true, color: "info", checkboxes: false, rows: [["a"]] }),
      "<!-- table-style: compact -->\n<!-- table-fill: striped -->\n<!-- table-border: soft-bordered -->\n<!-- table-rounded -->\n<!-- table-color: info -->\n| a   |\n| --- |",
    );
  });

  test("reads the softened border, and the last valid border wins", () => {
    assert.deepEqual(parseSnippet("table", "<!-- table-border: soft-bordered -->\n| a |\n| --- |"), { kind: "table", style: "", fill: "", border: "soft-bordered", rounded: false, color: "", checkboxes: false, rows: [["a"]] });
    assert.equal((parseSnippet("table", "<!-- table-border: bordered -->\n<!-- table-border: soft-bordered -->\n| a |\n| --- |") as { border: string }).border, "soft-bordered");
    assert.equal((parseSnippet("table", "<!-- table-border: soft-bordered -->\n<!-- table-border: bordered -->\n| a |\n| --- |") as { border: string }).border, "bordered");
    assert.equal((parseSnippet("table", "<!-- table-border: soft-bordered -->\n<!-- table-border: borderless -->\n| a |\n| --- |") as { border: string }).border, "");
  });

  test("check boxes: the directive comes last, and an empty box is written [ ]", () => {
    const markdown = build({ kind: "table", style: "", fill: "", border: "", rounded: true, color: "", checkboxes: true, rows: [["", "Task"], ["[x]", "Spec"], ["", "Tests"]] });
    assert.equal(markdown, ["<!-- table-rounded -->", "<!-- table-checkboxes -->", "|     | Task  |", "| --- | ----- |", "| [x] | Spec  |", "| [ ] | Tests |"].join("\n"));
    assert.deepEqual(parseSnippet("table", markdown), { kind: "table", style: "", fill: "", border: "", rounded: true, color: "", checkboxes: true, rows: [["", "Task"], ["[x]", "Spec"], ["[ ]", "Tests"]] });
    assert.equal(detectSnippet("<!-- table-checkboxes -->\n| | a |\n| --- | --- |\n| [x] | 1 |"), "table");
  });

  test("a table with the softened border is still detected as a table", () => {
    assert.equal(detectSnippet("<!-- table-border: soft-bordered -->\n| a |\n| --- |"), "table");
  });

  test("the softened border survives a round trip", () => {
    const data: SnippetData = { kind: "table", style: "", fill: "", border: "soft-bordered", rounded: false, color: "", checkboxes: false, rows: [["a", "b"]] };
    assert.deepEqual(parseSnippet("table", build(data)), data);
  });

  test("reads the legacy bordered style as the border", () => {
    assert.deepEqual(parseSnippet("table", "<!-- table-style: bordered -->\n| a |\n| --- |"), { kind: "table", style: "", fill: "", border: "bordered", rounded: false, color: "", checkboxes: false, rows: [["a"]] });
  });

  test("reads the legacy striped style as the fill", () => {
    assert.deepEqual(parseSnippet("table", "<!-- table-style: striped -->\n| a |\n| --- |"), { kind: "table", style: "", fill: "striped", border: "", rounded: false, color: "", checkboxes: false, rows: [["a"]] });
  });

  test("reads the legacy full style as the full fill, rounded", () => {
    assert.deepEqual(parseSnippet("table", "<!-- table-style: full -->\n| a |\n| --- |"), { kind: "table", style: "", fill: "full", border: "", rounded: true, color: "", checkboxes: false, rows: [["a"]] });
  });

  test("a density and a legacy fill are read independently", () => {
    assert.deepEqual(parseSnippet("table", "<!-- table-style: compact -->\n<!-- table-style: striped -->\n| a |\n| --- |"), { kind: "table", style: "compact", fill: "striped", border: "", rounded: false, color: "", checkboxes: false, rows: [["a"]] });
  });

  test("reads every new directive", () => {
    assert.deepEqual(
      parseSnippet("table", "<!-- table-style: intermediate -->\n<!-- table-fill: full -->\n<!-- table-border: bordered -->\n<!-- table-rounded -->\n<!-- table-color: danger -->\n| a |\n| --- |"),
      { kind: "table", style: "intermediate", fill: "full", border: "bordered", rounded: true, color: "danger", checkboxes: false, rows: [["a"]] },
    );
  });

  test("a table with only the new directives is still detected as a table", () => {
    assert.equal(detectSnippet("<!-- table-rounded -->\n<!-- table-fill: striped -->\n| a |\n| --- |\n| b |"), "table");
  });

  const grid = (checkboxes: boolean, rows: string[][]): Extract<SnippetData, { kind: "table" }> =>
    ({ kind: "table", style: "", fill: "", border: "", rounded: false, color: "", checkboxes, rows });

  test("a body row moves up or down by swapping with its neighbour; the header row stays first", () => {
    const table = grid(false, [["H"], ["a"], ["b"], ["c"]]);
    assert.equal(moveRow(table, 1, 1), 2);
    assert.deepEqual(table.rows, [["H"], ["b"], ["a"], ["c"]]);
    assert.equal(moveRow(table, 3, -1), 2);
    assert.deepEqual(table.rows, [["H"], ["b"], ["c"], ["a"]]);
    assert.equal(moveRow(table, 1, -1), null, "no row goes above the header");
    assert.equal(moveRow(table, 0, 1), null, "the header does not move");
    assert.equal(moveRow(table, 3, 1), null, "the last row does not go further");
    assert.deepEqual(table.rows, [["H"], ["b"], ["c"], ["a"]]);
  });

  test("a column moves left or right in every row; with check boxes the box column stays first", () => {
    const table = grid(false, [["A", "B", "C"], ["1", "2", "3"]]);
    assert.equal(moveColumn(table, 0, 1), 1);
    assert.deepEqual(table.rows, [["B", "A", "C"], ["2", "1", "3"]]);
    assert.equal(moveColumn(table, 0, -1), null);
    assert.equal(moveColumn(table, 2, 1), null);
    const checked = grid(true, [["", "A", "B"], ["[x]", "1", "2"]]);
    assert.equal(moveColumn(checked, 1, -1), null, "nothing goes before the boxes");
    assert.equal(moveColumn(checked, 0, 1), null, "the boxes do not move");
    assert.equal(moveColumn(checked, 2, -1), 1);
    assert.deepEqual(checked.rows, [["", "B", "A"], ["[x]", "2", "1"]]);
    assert.equal(build(checked), "<!-- table-checkboxes -->\n|     | B   | A   |\n| --- | --- | --- |\n| [x] | 2   | 1   |");
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
  { kind: "table", style: "intermediate", fill: "full", border: "bordered", rounded: true, color: "warning", checkboxes: false, rows: [["a", "b"], ["c", ""]] },
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

const MERMAID_PIE = '```mermaid\npie title DOC WORKFLOW\n         "Drafting the first version" : 50\n         "Reviewing with stakeholders" : 30\n         "Publishing updates" : 20\n```';
const MERMAID_TIMELINE = "```mermaid\ntimeline\n    title DOCUMENTATION ROADMAP\n    2023 : First living notes\n    2024 : Shared review workflow : Visual diagram catalog\n    2025 : Agent-assisted documentation\n    2026 : Workspace automation\n```";
const MERMAID_TREE = "```mermaid\ntreeView-beta\n    knowledge-workspace/\n        documents/\n            getting-started.md ## Start here\n            operations.md\n        diagrams/\n        automation.json ## Runs on every save\n```";
const MERMAID_SEQUENCE = "```mermaid\nsequenceDiagram\n    Author ->> Reviewer: Request a review\n    Reviewer -->> Author: Send comments\n    Note right of Reviewer: Checks the style guide\n    Author ->> Reviewer: Send the revised draft\n    Reviewer ->> Publisher: Approve the document\n    Publisher ->> Author: Document published\n    Publisher -->> Reviewer: Confirm the release\n```";

type MermaidData = Extract<SnippetData, { kind: "mermaid" }>;
const mermaid = (changes: Partial<MermaidData>): MermaidData => ({ ...(newSnippet("mermaid", texts) as MermaidData), ...changes });
type ColumnsData = Extract<SnippetData, { kind: "columns" }>;
const columnsOf = (changes: Partial<ColumnsData>): ColumnsData => ({ ...(newSnippet("columns", texts) as ColumnsData), ...changes });

describe("the Mermaid Builder", () => {
  test("a new form starts as a pie with the four examples", () => {
    const data = newSnippet("mermaid", texts) as MermaidData;
    assert.equal(data.chart, "pie");
    assert.equal(data.pie.length, 3);
    assert.equal(data.timeline.length, 5);
    assert.equal(data.tree.length, 6);
    assert.equal(data.sequence.length, 7);
    assert.equal(build(data), MERMAID_PIE);
  });

  test("each chart writes its example", () => {
    assert.equal(build(mermaid({ chart: "timeline" })), MERMAID_TIMELINE);
    assert.equal(build(mermaid({ chart: "tree-view" })), MERMAID_TREE);
    assert.equal(build(mermaid({ chart: "sequence" })), MERMAID_SEQUENCE);
  });

  test("a pie has no total cap, writes a negative weight as 0, escapes quotes, and falls back for empty labels and title", () => {
    assert.equal(
      build(mermaid({ pieTitle: "  My   pie \n", pie: [{ label: " A \"b\" ", value: 70 }, { label: "", value: 60 }, { label: "C", value: -5 }, { label: "D", value: NaN }, { label: "E", value: 2.5 }] })),
      '```mermaid\npie title My pie\n         "A \\"b\\"" : 70\n         "Item 2" : 60\n         "C" : 0\n         "D" : 0\n         "E" : 2.5\n```',
    );
    assert.equal(build(mermaid({ pieTitle: " ", pie: [] })), "```mermaid\npie title DOC WORKFLOW\n```");
  });

  test("a timeline groups events by period in first-seen order and falls back for empty cells", () => {
    assert.equal(
      build(mermaid({ chart: "timeline", timelineTitle: "", timeline: [{ period: "2024", event: "a" }, { period: "2023", event: "b" }, { period: "2024", event: "c" }, { period: "", event: "" }] })),
      "```mermaid\ntimeline\n    title DOCUMENTATION ROADMAP\n    2024 : a : c\n    2023 : b\n    Period 4 : Event 4\n```",
    );
  });

  test("a tree view indents by level (clamped to 0..6), with decorator and note", () => {
    assert.equal(
      build(mermaid({ chart: "tree-view", tree: [{ level: 9, label: "deep", decorator: ":::folder", note: "n" }, { level: -3, label: "", decorator: "", note: "" }, { level: NaN, label: "x  y", decorator: "", note: "" }] })),
      "```mermaid\ntreeView-beta\n                            deep :::folder ## n\n    Node 2\n    x y\n```",
    );
    assert.equal(MAX_TREE_LEVEL, 6);
  });

  test("a sequence writes messages and notes, with fallbacks for empty and unknown values", () => {
    assert.equal(
      build(mermaid({
        chart: "sequence",
        sequence: [
          { type: "message", from: "A", arrow: "--x", to: "B", message: "hi" },
          { type: "message", from: "", arrow: "nope" as never, to: "", message: "" },
          { type: "note", position: "over", participant: "A", text: "t" },
          { type: "note", position: "nope" as never, participant: "", text: "" },
        ],
      })),
      "```mermaid\nsequenceDiagram\n    A --x B: hi\n    Participant 2 ->> Participant 2: Message 2\n    Note over A: t\n    Note right of Participant 4: Message 4\n```",
    );
  });

  test("an empty row list still writes the chart, and reads back", () => {
    const written = build(mermaid({ chart: "sequence", sequence: [] }));
    assert.equal(written, "```mermaid\nsequenceDiagram\n```");
    assert.equal((parseSnippet("mermaid", written, texts) as MermaidData).chart, "sequence");
  });

  test("the option lists", () => {
    assert.deepEqual(MERMAID_CHARTS, ["pie", "timeline", "tree-view", "sequence"]);
    assert.deepEqual(SEQUENCE_ARROWS, ["->>", "-->>", "--x", "-x", "-->", "->"]);
    assert.deepEqual(NOTE_POSITIONS, ["left of", "right of", "over"]);
  });

  test("reading a builder chart back fills its rows, the other charts keep the examples", () => {
    const data = parseSnippet("mermaid", '```mermaid\npie title T\n  "a\\"b"   :   3.5\n  "c" : 0\n```', texts) as MermaidData;
    assert.equal(data.chart, "pie");
    assert.equal(data.pieTitle, "T");
    assert.deepEqual(data.pie, [{ label: 'a"b', value: 3.5 }, { label: "c", value: 0 }]);
    assert.equal(build({ ...data, chart: "timeline" }), MERMAID_TIMELINE);
    assert.equal((parseSnippet("mermaid", "```mermaid\ntimeline\n    title T\n    2024 : a : b\n    2024 : c\n```", texts) as MermaidData).timeline.length, 3);
    const tree = parseSnippet("mermaid", MERMAID_TREE, texts) as MermaidData;
    assert.deepEqual(tree.tree[2], { level: 2, label: "getting-started.md", decorator: "", note: "Start here" });
    assert.deepEqual((parseSnippet("mermaid", "```mermaid\ntreeView-beta\n    a :::folder ## n\n```", texts) as MermaidData).tree, [{ level: 0, label: "a", decorator: ":::folder", note: "n" }]);
    assert.deepEqual((parseSnippet("mermaid", "```mermaid\nsequenceDiagram\n    A -x B: m\n    Note left of B: t\n```", texts) as MermaidData).sequence, [
      { type: "message", from: "A", arrow: "-x", to: "B", message: "m" },
      { type: "note", position: "left of", participant: "B", text: "t" },
    ]);
  });

  test("a chart that is not a builder shape is not read, and falls back to the example", () => {
    for (const code of ["sequenceDiagram\n    participant A\n    A ->> B: x", "sequenceDiagram\n    loop every\n    A ->> B: x\n    end", "pie title T\n    %% comment", "flowchart TD\n  A --> B", "", "treeView-beta\n  odd", "timeline\n    title T\n    section S"]) {
      const markdown = "```mermaid\n" + code + "\n```";
      assert.equal(detectSnippet(markdown), "code-block", code);
      assert.equal(build(parseSnippet("mermaid", markdown, texts)), MERMAID_PIE);
    }
  });
});

describe("layout columns", () => {
  test("a new layout has 2 columns", () => {
    assert.equal(build(newSnippet("columns", texts)), "<!-- layout-columns -->\n\n<!-- col -->\n\nColumn 1\n\n<!-- col -->\n\nColumn 2\n\n<!-- /layout-columns -->");
    assert.deepEqual(COLUMN_COUNTS, [2, 3, 4]);
  });

  test("4 columns with every option, in order", () => {
    assert.equal(
      build(columnsOf({ count: 4, ratio: " 2/1/1/1 ", verticalAlign: "top", textAlign: "justify", gap: "lg" })),
      "<!-- layout-columns: 2/1/1/1 | vertical-align: top | text-align: justify | gap: lg -->\n\n<!-- col -->\n\nColumn 1\n\n<!-- col -->\n\nColumn 2\n\n<!-- col -->\n\nColumn 3\n\n<!-- col -->\n\nColumn 4\n\n<!-- /layout-columns -->",
    );
    assert.deepEqual([VERTICAL_ALIGNS, TEXT_ALIGNS, GAPS], [["top", "center", "bottom", "stretch"], ["left", "center", "right", "justify"], ["sm", "md", "lg"]]);
  });

  test("default options are omitted", () => {
    assert.equal(build(columnsOf({ verticalAlign: "center", gap: "md" })).split("\n")[0], "<!-- layout-columns -->");
    assert.equal(build(columnsOf({ gap: "sm" })).split("\n")[0], "<!-- layout-columns: gap: sm -->");
  });

  test("a reopened layout keeps its columns byte for byte while options change", () => {
    const source = "<!-- layout-columns: 1/2 -->\n\n<!-- col -->\n\n**Left**   text\n\n<!-- col -->\n\n- a\n- b\n\n<!-- /layout-columns -->";
    const data = parseSnippet("columns", source) as ColumnsData;
    assert.deepEqual({ ...data, body: "…" }, { kind: "columns", count: 2, ratio: "1/2", verticalAlign: "", textAlign: "", gap: "", body: "…" });
    assert.equal(build(data), source);
    assert.equal(
      build({ ...data, gap: "lg", ratio: "" }),
      "<!-- layout-columns: gap: lg -->\n\n<!-- col -->\n\n**Left**   text\n\n<!-- col -->\n\n- a\n- b\n\n<!-- /layout-columns -->",
    );
  });

  test("6 columns are counted and kept", () => {
    const six = "<!-- layout-columns -->\n\n" + [1, 2, 3, 4, 5, 6].map((n) => `<!-- col -->\n\nc${n}`).join("\n\n") + "\n\n<!-- /layout-columns -->";
    const data = parseSnippet("columns", six) as ColumnsData;
    assert.equal(data.count, 6);
    assert.equal(build(data), six);
  });

  test("content before the first column makes a group", () => {
    const source = "<!-- layout-columns: vertical-align: bottom | text-align: right -->\n\nintro\n\n<!-- col -->\n\nx\n\n<!-- /layout-columns -->";
    const data = parseSnippet("columns", source) as ColumnsData;
    assert.deepEqual([data.count, data.verticalAlign, data.textAlign], [2, "bottom", "right"]);
    assert.equal(build(data), source);
  });
});

describe("attachments", () => {
  test("a new attachment is empty and writes the fallbacks", () => {
    assert.deepEqual(newSnippet("attachment", texts), { kind: "attachment", text: "", url: "" });
    assert.equal(build(newSnippet("attachment", texts)), "[📎 file](files/file)");
  });

  test("writes what pastedLink writes", () => {
    assert.equal(build({ kind: "attachment", text: "report.pdf", url: "files/report.pdf" }), "[📎 report.pdf](files/report.pdf)");
    assert.equal(build({ kind: "attachment", text: "report.pdf", url: "files/report.pdf" }), pastedLink("a.md", "files/report.pdf", "file", "report.pdf"));
    assert.equal(build({ kind: "attachment", text: "a [b] \\c", url: "files/x" }), pastedLink("a.md", "files/x", "file", "a [b] \\c"));
    assert.equal(build({ kind: "attachment", text: "a [b] \\c", url: "files/x" }), "[📎 a \\[b\\] \\\\c](files/x)");
  });

  test("an empty text is the file name of the url", () => {
    assert.equal(build({ kind: "attachment", text: "", url: "files/my%20report.pdf" }), "[📎 my report.pdf](files/my%20report.pdf)");
  });

  test("reads text (unescaped) and url back", () => {
    assert.deepEqual(parseSnippet("attachment", "[📎 a \\[b\\] \\\\c](../files/x%20y.pdf)"), { kind: "attachment", text: "a [b] \\c", url: "../files/x%20y.pdf" });
  });
});

describe("detecting the three kinds", () => {
  test("builder Mermaid is mermaid, but not with a width directive", () => {
    assert.equal(detectSnippet(MERMAID_PIE), "mermaid");
    assert.equal(detectSnippet(MERMAID_SEQUENCE), "mermaid");
    assert.equal(detectSnippet("<!-- mermaid-width: full -->\n" + MERMAID_PIE), "code-block");
    assert.equal(detectSnippet("```mermaid\nsequenceDiagram\n    participant A\n```"), "code-block");
    assert.equal(detectSnippet("```js\nx\n```"), "code-block");
  });

  test("layouts are columns", () => {
    assert.equal(detectSnippet("<!-- layout-columns -->\n\n<!-- col -->\n\na\n\n<!-- /layout-columns -->"), "columns");
  });

  test("a paperclip link is an attachment; other links are unchanged", () => {
    assert.equal(detectSnippet("[📎 report.pdf](files/report.pdf)"), "attachment");
    assert.equal(detectSnippet("[report](files/report.pdf)"), "link");
    assert.equal(detectSnippet("![📎 x](img.png)"), "image");
    assert.equal(detectSnippet("[📎 x](?doc=a)"), "doc-link");
  });
});

describe("round trips of the three kinds", () => {
  test("every output reads back to itself", () => {
    const outputs = [
      MERMAID_PIE, MERMAID_TIMELINE, MERMAID_TREE, MERMAID_SEQUENCE,
      "```mermaid\ntimeline\n    title T\n```",
      '```mermaid\npie title T\n         "x" : 1e+21\n```',
      "```mermaid\ntreeView-beta\n    a :::folder\n    b icon(file) ## note\n                            deep\n```",
      "```mermaid\nsequenceDiagram\n    A -->> B: x: y\n    A --> B: z\n    A -> B: w\n    Note over A: t\n```",
      "<!-- layout-columns: 1/2 | gap: sm -->\n\n<!-- col -->\n\nx\n\n<!-- /layout-columns -->",
      "[📎 report.pdf](files/report.pdf)",
      "[📎 a \\[b\\]](files/x)",
    ];
    for (const markdown of outputs) {
      const kind = detectSnippet(markdown)!;
      assert.ok(["mermaid", "columns", "attachment"].includes(kind), markdown);
      assert.equal(buildSnippet(parseSnippet(kind, markdown, texts), texts), markdown);
    }
  });
});

describe("cards", () => {
  type CardData = Extract<SnippetData, { kind: "card" }>;
  const cardOf = (changes: Partial<CardData>): CardData => ({ ...(newSnippet("card", texts) as CardData), ...changes });

  test("a new card is plain, full width, without a title, around a placeholder", () => {
    assert.deepEqual(newSnippet("card", texts), { kind: "card", title: "", style: "", color: "", width: "", align: "", body: null });
    assert.equal(build(newSnippet("card", texts)), "<!-- card -->\n\nCard content\n\n<!-- /card -->");
  });

  test("the title, then the options that are set, in order", () => {
    assert.equal(build(cardOf({ title: " My  recipe ", style: "bristol", color: "sky", width: "1/2", align: "right" })).split("\n")[0], "<!-- card: My recipe | style: bristol | color: sky | width: 1/2 | align: right -->");
    assert.equal(build(cardOf({ style: "deck" })).split("\n")[0], "<!-- card | style: deck -->");
    assert.equal(build(cardOf({ title: "T", style: "plain", width: "full", align: "left" })).split("\n")[0], "<!-- card: T -->");
  });

  test("a title cannot break the comment or its options", () => {
    assert.equal(build(cardOf({ title: "a | b --> c" })).split("\n")[0], "<!-- card: a / b —> c -->");
  });

  test("a reopened card keeps its content byte for byte while its options change", () => {
    const source = "<!-- card: Old | width: 1/3 -->\n\n**Body**   text\n\n- a\n\n<!-- /card -->";
    const data = parseSnippet("card", source) as CardData;
    assert.deepEqual(data, { kind: "card", title: "Old", style: "", color: "", width: "1/3", align: "", body: "\n\n**Body**   text\n\n- a\n\n" });
    assert.equal(build({ ...data, title: "New", style: "deck" }), "<!-- card: New | style: deck | width: 1/3 -->\n\n**Body**   text\n\n- a\n\n<!-- /card -->");
  });

  test("a colour is read back; the palette has a dozen backgrounds, each with its own ink and title", () => {
    assert.equal((parseSnippet("card", "<!-- card | color: rose -->\nx\n<!-- /card -->") as CardData).color, "rose");
    assert.equal(CARD_COLORS.length, 12);
    for (const color of CARD_COLORS) assert.match(CARD_PALETTE[color].bg + CARD_PALETTE[color].ink + CARD_PALETTE[color].title, /^(#[0-9a-f]{6}){3}$/);
  });

  test("a card is recognized, with or without options, around anything", () => {
    assert.equal(detectSnippet("<!-- card -->\n\nx\n\n<!-- /card -->"), "card");
    assert.equal(detectSnippet("<!-- card: T | style: deck -->\n\n<!-- layout-columns -->\n<!-- col -->\na\n<!-- /layout-columns -->\n\n<!-- /card -->"), "card");
    assert.equal(detectSnippet("<!-- cards -->\n\nx\n\n<!-- /card -->"), null);
  });
});
