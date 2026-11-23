// The Kanban block of a Document: one line of raw HTML naming the columns and their colors.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseKanbanBlock } from "../src/lib/kanban.ts";

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
