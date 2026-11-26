// Reading the original's formats in the View: columns, callouts, table styles, long code, footnotes and compare.
// Like every journey in the View, none may change the page address (the View is an about:srcdoc page in the Host).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Page } from "playwright";
import { useBrowser, withProject } from "./living-documentation.ts";

useBrowser();

const filler = "\n\nFiller paragraph.".repeat(80);
const longCode = "```js\n" + Array.from({ length: 40 }, (_, i) => `const value${i} = ${i};`).join("\n") + "\n```\n";

const open = async (page: Page, name = "a.md") => page.getByRole("link", { name, exact: true }).click();
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
const inView = (page: Page, id: string) =>
  page.waitForFunction((target) => {
    const rect = document.getElementById(target)!.getBoundingClientRect();
    return rect.top >= -2 && rect.bottom <= window.innerHeight;
  }, id);

describe("layout and tables", () => {
  test("columns sit side by side, a callout shows its title, a styled table keeps its classes", async () => {
    const { page } = await withProject({
      "a.md": [
        "# Alpha",
        "",
        "<!-- layout-columns: 1/1 -->",
        "<!-- col -->",
        "Left side",
        "",
        "<!-- col -->",
        "Right side",
        "<!-- /layout-columns -->",
        "",
        "<!-- quote-type: tip -->",
        "<!-- quote-title: Heads up -->",
        "> Mind the gap",
        "",
        "<!-- table-style: striped -->",
        "<!-- table-color: info -->",
        "| a | b |",
        "|---|---|",
        "| 1 | 2 |",
        "",
      ].join("\n"),
    });
    const address = page.url();
    await open(page);
    await page.getByRole("heading", { level: 1, name: "Alpha" }).waitFor();

    const left = await box(page, ".ld-column:nth-child(1)");
    const right = await box(page, ".ld-column:nth-child(2)");
    assert.ok(right.x > left.x + left.width - 1, "the second column starts where the first ends");
    assert.ok(Math.abs(left.y - right.y) < 40, "the columns share a row");

    await page.locator(".ld-callout .ld-callout-title", { hasText: "Heads up" }).waitFor();
    const classes = await page.locator("table").getAttribute("class");
    assert.match(classes!, /table-fill-striped/);
    assert.match(classes!, /table-color-info/);
    const header = await page.locator("table thead th").first().evaluate((th) => getComputedStyle(th).backgroundColor);
    assert.notEqual(header, "rgba(0, 0, 0, 0)", "the colored table tints its header");
    assert.equal(page.url(), address);
  });
});

describe("code", () => {
  test("a long block is collapsed until Show more; a short one has no button; tokens are highlighted", async () => {
    const { page } = await withProject({ "a.md": `# Alpha\n\n${longCode}\n\`\`\`js\nconst short = 1;\n\`\`\`\n` });
    const address = page.url();
    await open(page);
    const more = page.getByRole("button", { name: "▾ Show more" });
    await more.waitFor();
    assert.equal(await page.locator("button.ld-code-toggle").count(), 1);
    assert.equal(await page.locator("pre.ld-collapsible").count(), 1);
    await page.locator("pre code .hljs-keyword").first().waitFor();

    const collapsed = (await box(page, "pre.ld-collapsible")).height;
    assert.ok(collapsed <= 410, `collapsed height ${collapsed}`);
    await more.click();
    await page.getByRole("button", { name: "▴ Show less" }).waitFor();
    assert.ok((await box(page, "pre.ld-collapsible")).height > collapsed + 100);

    await page.getByRole("button", { name: "▴ Show less" }).click();
    await page.getByRole("button", { name: "▾ Show more" }).waitFor();
    assert.ok((await box(page, "pre.ld-collapsible")).height <= 410);
    assert.equal(page.url(), address);
  });
});

describe("footnotes and compare", () => {
  test("a footnote reference scrolls to the footnote, and its back link returns", async () => {
    const { page } = await withProject({ "a.md": `# Alpha\n\nA claim[^x] here.\n${filler}\n\n[^x]: The proof.\n` });
    const address = page.url();
    await open(page);
    await page.getByRole("heading", { level: 2, name: "Footnotes" }).waitFor({ state: "attached" });

    await page.locator("#ld-fnref-x").click();
    await inView(page, "ld-fn-x");
    await page.getByRole("link", { name: "Back to reference" }).click();
    await inView(page, "ld-fnref-x");
    assert.equal(page.url(), address);
  });

  test(":::compare shows the source and the result side by side, with labels", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n:::compare\n**bold**\n:::\n" });
    const address = page.url();
    await open(page);
    await page.locator(".ld-compare-render strong").waitFor();
    const source = await box(page, ".ld-compare-source");
    const render = await box(page, ".ld-compare-render");
    assert.ok(render.x >= source.x + source.width - 1);
    assert.equal(await page.locator(".ld-compare-source code").textContent(), "**bold**");
    const label = await page.locator(".ld-compare-render").evaluate((el) => getComputedStyle(el, "::before").content);
    assert.equal(label, '"Result"');
    assert.equal(page.url(), address);
  });
});

describe("language and theme", () => {
  test("in French the footnotes heading and the code button are French", async () => {
    const { page } = await withProject({ "a.md": `# Alpha\n\nClaim[^x].\n\n${longCode}\n[^x]: Preuve.\n` }, { locale: "fr" });
    const address = page.url();
    await open(page);
    await page.getByRole("heading", { level: 2, name: "Notes de bas de page" }).waitFor({ state: "attached" });
    await page.getByRole("button", { name: "▾ Afficher plus" }).click();
    await page.getByRole("button", { name: "▴ Réduire" }).waitFor();
    assert.equal(page.url(), address);
  });

  test("dark mode recolors the code keywords", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n```js\nconst a = 1;\n```\n" });
    const address = page.url();
    await open(page);
    const keyword = page.locator("pre code .hljs-keyword").first();
    await keyword.waitFor();
    const light = await keyword.evaluate((el) => getComputedStyle(el).color);
    await page.evaluate(() => (document.documentElement.dataset.mode = "dark"));
    const dark = await keyword.evaluate((el) => getComputedStyle(el).color);
    assert.notEqual(light, dark);
    assert.equal(page.url(), address);
  });
});
