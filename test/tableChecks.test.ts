// Check boxes of a table (`<!-- table-checkboxes -->`): the boxes drawn from the first column, and a tick written back.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { parseDocument } from "../src/lib/document.ts";
import { toggleCheck } from "../src/lib/markerWrites.ts";
import { openProject } from "../src/lib/project.ts";
import { renderDocument } from "../src/lib/render.ts";
import { checkOfCell, toggledCheck } from "../src/lib/tableChecks.ts";

const render = (text: string, path = "a.md") => renderDocument(parseDocument(text, path), path, {}, { softBreaks: false });
const TABLE = "<!-- table-checkboxes -->\n|   | Task |\n|---|---|\n| [x] | Spec |\n| [ ] | Tests |\n|  | Ship |\n";
const ranges = (html: string) => [...html.matchAll(/data-table-check="(\d+)-(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])] as const);

describe("the first cell of a row", () => {
  test("[ ], [x] and [X] are boxes, the range being the brackets", () => {
    assert.deepEqual(checkOfCell("| [ ] "), { checked: false, range: { from: 2, to: 5 } });
    assert.deepEqual(checkOfCell("| [x] "), { checked: true, range: { from: 2, to: 5 } });
    assert.deepEqual(checkOfCell("|[X]"), { checked: true, range: { from: 1, to: 4 } });
  });

  test("an empty cell is an unchecked box whose range is its spaces", () => {
    assert.deepEqual(checkOfCell("|   "), { checked: false, range: { from: 1, to: 4 } });
    assert.deepEqual(checkOfCell("|"), { checked: false, range: { from: 1, to: 1 } });
  });

  test("any other content is no box", () => {
    assert.equal(checkOfCell("| done "), null);
    assert.equal(checkOfCell("| [x] done "), null);
  });

  test("a tick swaps [ ] and [x], and fills an empty cell", () => {
    assert.equal(toggledCheck("[ ]"), "[x]");
    assert.equal(toggledCheck("[x]"), "[ ]");
    assert.equal(toggledCheck("[X]"), "[ ]");
    assert.equal(toggledCheck("   "), " [x] ");
    assert.equal(toggledCheck(""), " [x] ");
  });
});

describe("a table with check boxes", () => {
  test("the table is marked and each body row's first cell is a box; a checked row is marked", () => {
    const html = render(TABLE);
    assert.match(html, /<table class="table-checkboxes" data-table-checkboxes="" /);
    assert.match(html, /<tr class="ld-checked">\n<td class="ld-check-cell"><input type="checkbox" checked data-table-check="\d+-\d+"><\/td>\n<td>Spec<\/td>/);
    assert.match(html, /<tr>\n<td class="ld-check-cell"><input type="checkbox" data-table-check="\d+-\d+"><\/td>\n<td>Tests<\/td>/);
    assert.equal((html.match(/<input/g) ?? []).length, 3);
  });

  test("each box's range points at its source in the Document, frontmatter included", () => {
    const text = `---\ntitle: T\n---\n${TABLE}`;
    const found = ranges(render(text)).map(([from, to]) => text.slice(from, to));
    assert.deepEqual(found, ["[x]", "[ ]", "  "]);
  });

  test("a first cell holding other text stays as written", () => {
    assert.match(render("<!-- table-checkboxes -->\n| | a |\n|---|---|\n| done | 1 |\n"), /<tr>\n<td>done<\/td>/);
  });

  test("without the directive, [x] is plain text", () => {
    const html = render("| | a |\n|---|---|\n| [x] | 1 |\n");
    assert.doesNotMatch(html, /<input|ld-checked/);
    assert.match(html, /<td>\[x\]<\/td>/);
  });

  test("table-checkboxes with a value is ignored", () => {
    assert.doesNotMatch(render("<!-- table-checkboxes: yes -->\n| | a |\n|---|---|\n| [x] | 1 |\n"), /<input/);
  });
});

describe("ticking a box", () => {
  async function projectOf(files: Record<string, string>) {
    const host = createTestHost({ module: { id: "@craftskillz/living-documentation", version: "0.0.1" }, permissions: { folders: true } });
    host.folders.choose(host.folders.create("docs", files));
    const module = await connect({ transport: host.mount({ surface: "view" }).transport });
    return openProject(module, (await module.folders.request())!);
  }

  test("writes [x], [ ] or fills the empty cell, and keeps the rest", async () => {
    const project = await projectOf({ "a.md": TABLE });
    let base = await project.read("a.md");
    for (const range of ranges(render(base.text)).map(([from, to]) => ({ from, to })).reverse()) base = await toggleCheck(project, "a.md", base, range);
    assert.equal((await project.read("a.md")).text, "<!-- table-checkboxes -->\n|   | Task |\n|---|---|\n| [ ] | Spec |\n| [x] | Tests |\n| [x] | Ship |\n");
  });
});
