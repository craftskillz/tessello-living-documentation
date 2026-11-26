// The Kanban block of a Document: one line of raw HTML naming the columns and their colors.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { boardColumns, cardDescription, cardText, columnFolder, columnsProblem, kanbanBlockText, parseKanbanBlock } from "../src/lib/kanban.ts";

describe("parseKanbanBlock", () => {
  test("columns and colors", () => {
    assert.deepEqual(parseKanbanBlock('<div data-ld-kanban data-columns="To do|Doing|Done" data-colors="sky|amber|emerald"></div>'), {
      columns: [
        { label: "To do", color: "sky" },
        { label: "Doing", color: "amber" },
        { label: "Done", color: "emerald" },
      ],
    });
  });

  test("labels are decoded and trimmed, empty ones dropped", () => {
    const block = parseKanbanBlock('<div data-ld-kanban data-columns=" Q&amp;A | |&quot;Hot&quot;" data-colors="rose"></div>');
    assert.deepEqual(block?.columns.map((c) => c.label), ["Q&A", '"Hot"']);
  });

  test("a missing or unknown color takes the default of its index", () => {
    const block = parseKanbanBlock('<div data-ld-kanban data-columns="a|b|c|d" data-colors=" ROSE |pink"></div>');
    assert.deepEqual(block?.columns.map((c) => c.color), ["rose", "amber", "emerald", "rose"]);
  });

  test("at most 6 columns", () => {
    const block = parseKanbanBlock('<div data-ld-kanban data-columns="1|2|3|4|5|6|7"></div>');
    assert.deepEqual(block?.columns.map((c) => [c.label, c.color]), [["1", "sky"], ["2", "amber"], ["3", "emerald"], ["4", "rose"], ["5", "violet"], ["6", "slate"]]);
  });

  test("no column label is a block with no column", () => {
    assert.deepEqual(parseKanbanBlock("<div data-ld-kanban></div>"), { columns: [] });
  });

  test("anything else is not a block", () => {
    assert.equal(parseKanbanBlock("<div class=x></div>"), null);
    assert.equal(parseKanbanBlock("<div data-ld-kanban>text</div> more"), null);
    assert.equal(parseKanbanBlock("<div data-ld-kanban>\n</div>"), null);
  });
});

describe("columnFolder", () => {
  test("a label becomes a folder name", () => {
    assert.equal(columnFolder("To do"), "To_do");
    assert.equal(columnFolder("Prêt"), "Pret");
    assert.equal(columnFolder("To/do"), "To_do");
    assert.equal(columnFolder("To-do"), "To-do");
    assert.equal(columnFolder("  ** "), "");
  });

  test("runs of underscores collapse, edges are trimmed", () => {
    assert.equal(columnFolder("_a__b_"), "a_b");
    assert.equal(columnFolder("a / _ / b"), "a_b");
  });
});

describe("boardColumns", () => {
  const block = (...labels: string[]) => ({ columns: labels.map((label) => ({ label, color: "sky" as const })) });

  test("each column is a subfolder of the board's folder", () => {
    assert.deepEqual(boardColumns(block("To do"), "projets/board.md"), [{ label: "To do", color: "sky", folder: "projets/To_do" }]);
  });

  test("a board at the Project root has top-level columns", () => {
    assert.deepEqual(boardColumns(block("Prêt"), "board.md").map((c) => c.folder), ["Pret"]);
  });

  test("a folder named twice, ignoring case, is shown once as the first", () => {
    assert.deepEqual(boardColumns(block("Prêt", "Pret", "Todo", "todo"), "board.md").map((c) => c.label), ["Prêt", "Todo"]);
  });

  test("a label without a folder name is not a column", () => {
    assert.deepEqual(boardColumns(block("***", "Doing"), "board.md").map((c) => c.label), ["Doing"]);
  });
});

describe("cardDescription", () => {
  test("the text between the title and ## Content", () => {
    assert.equal(cardDescription("# Card\n\nWhat it is.\n\n## Content\n\nHidden.\n"), "What it is.");
  });

  test("it stops at the French ## Contenu too", () => {
    assert.equal(cardDescription("# Carte\n\nCe que c'est.\n\n## Contenu\n\nCaché.\n"), "Ce que c'est.");
  });

  test("without a Content heading, all the text after the title", () => {
    assert.equal(cardDescription("# Card\n\nOne.\n\nTwo.\n"), "One. Two.");
  });

  test("the frontmatter is removed", () => {
    assert.equal(cardDescription("---\ntitle: T\n---\n# Card\n\nBody.\n"), "Body.");
  });

  test("lists, tables, headings and quotes become one line", () => {
    const text = "# Card\n\n- one\n* two\n+ three\n1. four\n2) five\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n### Sub\n\n> quoted\n\n---\n";
    assert.equal(cardDescription(text), "• one • two • three • four • five a · b 1 · 2 Sub quoted");
  });

  test("inline marks are removed", () => {
    assert.equal(cardDescription("# C\n\n**bold** __b__ ~~s~~ *i* _j_ `code` ![alt](x.png) [label](y.md)\n"), "bold b s i j code alt label");
  });

  test("at most 140 characters, then an ellipsis", () => {
    assert.equal(cardDescription(`# C\n\n${"a".repeat(140)}\n`), "a".repeat(140));
    assert.equal(cardDescription(`# C\n\n${"a".repeat(141)}\n`), `${"a".repeat(140)}…`);
  });

  test("nothing after the title is an empty description", () => {
    assert.equal(cardDescription("# Card\n"), "");
    assert.equal(cardDescription(""), "");
  });
});

describe("kanbanBlockText", () => {
  test("the block line of the columns", () => {
    assert.equal(
      kanbanBlockText([{ label: "To do", color: "sky" }, { label: "Doing", color: "amber" }]),
      '<div data-ld-kanban data-columns="To do|Doing" data-colors="sky|amber"></div>',
    );
  });

  test("labels are trimmed and a pipe becomes a space", () => {
    assert.equal(
      kanbanBlockText([{ label: "  A|B ", color: "rose" }]),
      '<div data-ld-kanban data-columns="A B" data-colors="rose"></div>',
    );
  });

  test("ampersand and quote are escaped and read back exactly", () => {
    const text = kanbanBlockText([{ label: 'Q&A "hot"', color: "violet" }, { label: "&amp;", color: "slate" }]);
    assert.equal(text, '<div data-ld-kanban data-columns="Q&amp;A &quot;hot&quot;|&amp;amp;" data-colors="violet|slate"></div>');
    assert.deepEqual(parseKanbanBlock(text)?.columns.map((c) => c.label), ['Q&A "hot"', "&amp;"]);
  });
});

describe("columnsProblem", () => {
  test("no problem for usable labels", () => {
    assert.equal(columnsProblem(["To do", "To-do", "Done"]), null);
  });

  test("fewer than 1 or more than 6 labels", () => {
    assert.deepEqual(columnsProblem([]), { kind: "count" });
    assert.deepEqual(columnsProblem(["1", "2", "3", "4", "5", "6", "7"]), { kind: "count" });
    assert.equal(columnsProblem(["1", "2", "3", "4", "5", "6"]), null);
  });

  test("the first label without a folder name", () => {
    assert.deepEqual(columnsProblem(["A", "  ", "???"]), { kind: "noFolder", index: 1 });
  });

  test("two labels with the same folder ignoring case and accents", () => {
    assert.deepEqual(columnsProblem(["Prêt", "Doing", "Pret"]), { kind: "sameFolder", first: 0, second: 2 });
    assert.deepEqual(columnsProblem(["To do", "To/do"]), { kind: "sameFolder", first: 0, second: 1 });
    assert.deepEqual(columnsProblem(["Done", "DONE"]), { kind: "sameFolder", first: 0, second: 1 });
  });

  test("the count is checked before the folders", () => {
    assert.deepEqual(columnsProblem(["", "", "", "", "", "", ""]), { kind: "count" });
  });

  test("a folder problem is reported for the earliest second index", () => {
    assert.deepEqual(columnsProblem(["a", "b", "B", "a"]), { kind: "sameFolder", first: 1, second: 2 });
  });
});

describe("cardText", () => {
  test("a new card: frontmatter, title, description, content", () => {
    assert.equal(
      cardText("Fix login", { description: "Users cannot log in.", contentHeading: "Content", content: "Steps:\n- one" }, new Date("2026-03-04T05:06:07.000Z")),
      "---\ntimestamp: 2026-03-04T05:06:07.000Z\n---\n# Fix login\n\nUsers cannot log in.\n\n## Content\n\nSteps:\n- one\n",
    );
  });

  test("its description reads back", () => {
    const text = cardText("T", { description: "Short **text**.", contentHeading: "Contenu", content: "x" }, new Date(0));
    assert.equal(cardDescription(text), "Short text.");
  });
});
