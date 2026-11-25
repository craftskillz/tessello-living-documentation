// Diagrams, Kanban boards and tag markers in the View. Like every journey in the View, none may change the page
// address (the View is an about:srcdoc page in the Host).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Page } from "playwright";
import { useBrowser, withProject } from "./living-documentation.ts";

useBrowser();

const open = async (page: Page, name = "a.md") => page.getByRole("link", { name, exact: true }).click();

describe("diagrams", () => {
  test("a Mermaid block is drawn as an SVG with its text", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n```mermaid\ngraph TD\n  A[Start] --> B[End]\n```\n" });
    const address = page.url();
    await open(page);
    await page.locator(".ld-mermaid svg").waitFor();
    assert.ok((await page.locator(".ld-mermaid svg").textContent())!.includes("Start"));
    assert.equal(await page.locator(".ld-mermaid-error").count(), 0);
    assert.equal(page.url(), address);
  });

  test("a broken diagram shows its error and its source, not a blank", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n```mermaid\ngraph TD\n  A --> (((\n```\n" });
    const address = page.url();
    await open(page);
    const alert = page.locator(".ld-mermaid .ld-mermaid-error[role=alert]");
    await alert.waitFor();
    assert.match((await alert.textContent())!, /This diagram could not be drawn/);
    assert.match((await page.locator(".ld-mermaid pre").textContent())!, /A --> \(\(\(/);
    assert.equal(await page.locator("body > [id^=d]").count(), 0, "no stray Mermaid error node in the page");
    assert.equal(page.url(), address);
  });

  test("the error of a broken diagram is in French in French", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n```mermaid\ngraph TD\n  A --> (((\n```\n" }, { locale: "fr" });
    const address = page.url();
    await open(page);
    const alert = page.locator(".ld-mermaid-error[role=alert]");
    await alert.waitFor();
    assert.match((await alert.textContent())!, /Ce diagramme n’a pas pu être dessiné/);
    assert.equal(page.url(), address);
  });
});

describe("Kanban", () => {
  const block = '<div data-ld-kanban data-columns="To do|Doing|Done" data-colors="sky|amber|emerald"></div>';

  test("a Kanban block shows the board of its columns side by side; in a code block it stays code", async () => {
    const { page } = await withProject({ "a.md": `# Alpha\n\n${block}\n`, "b.md": `# Beta\n\n\`\`\`html\n${block}\n\`\`\`\n` });
    const address = page.url();
    await open(page);
    await page.getByRole("list", { name: "To do" }).waitFor();
    assert.equal(await page.locator(".ld-kanban").count(), 0, "the board replaces the preview");
    const titles = page.locator(".board-label");
    assert.deepEqual((await titles.allTextContents()).map((each) => each.toLowerCase()), ["to do", "doing", "done"]);
    const boxes = await page.locator(".board .column").evaluateAll((each) => each.map((el) => el.getBoundingClientRect().toJSON()));
    assert.ok(boxes[1].x > boxes[0].x + boxes[0].width - 1 && boxes[2].x > boxes[1].x + boxes[1].width - 1, "side by side");
    assert.ok(Math.abs(boxes[0].y - boxes[2].y) < 2, "one row");
    assert.ok(boxes[0].height >= 50, "a board has some height");

    await open(page, "b.md");
    await page.locator("pre code").waitFor();
    assert.equal(await page.locator(".ld-kanban").count(), 0);
    assert.equal(page.url(), address);
  });
});

describe("tag markers", () => {
  test("a tag shows as a pill holding the whole tag in its title; a details element is not a pill", async () => {
    const { page } = await withProject({
      "a.md": "# Alpha\n\nHello <add-footnote>world.\n\n<rewrite-section in three parts>\n\n<details><summary>More</summary>inside</details>\n",
    });
    const address = page.url();
    await open(page);
    const pills = page.locator(".ld-tag-marker");
    await pills.first().waitFor();
    assert.deepEqual(await pills.allTextContents(), ["add-footnote", "rewrite-section"]);
    assert.equal(await pills.nth(1).getAttribute("title"), "<rewrite-section in three parts>");
    const style = await pills.first().evaluate((el) => getComputedStyle(el));
    assert.equal(style.cursor, "help");
    assert.notEqual(style.backgroundColor, "rgba(0, 0, 0, 0)");
    assert.equal(page.url(), address);
  });
});
