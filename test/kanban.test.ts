// The Kanban block of a Document: one line of raw HTML naming the columns and their colors.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { boardColumns, cardDescription, columnFolder, parseKanbanBlock } from "../src/lib/kanban.ts";

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
