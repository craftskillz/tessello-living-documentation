import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import type { Page } from "playwright";
import { useBrowser, withProject as connected } from "./living-documentation.ts";

useBrowser();

// In the Host, the View is an about:srcdoc page: no journey may change its address.
let opened: { page: Page; address: string } | null = null;
const withProject: typeof connected = async (...args) => {
  const project = await connected(...args);
  opened = { page: project.page, address: project.page.url() };
  return project;
};
afterEach(() => {
  if (opened) assert.equal(opened.page.url(), opened.address, "the page address changed");
  opened = null;
});

const TABLE = "<!-- table-checkboxes -->\n|     | Task  |\n| --- | ----- |\n| [x] | Spec  |\n| [ ] | Tests |\n";
const boxes = (page: Page) => page.locator("article.document input[data-table-check]");

describe("a table with check boxes", () => {
  test("a click ticks or unticks a row, writes it to the Document and hatches the row", async () => {
    const { page, host, disk } = await withProject({ "a.md": TABLE });
    await boxes(page).first().waitFor();
    assert.deepEqual(await boxes(page).evaluateAll((all) => all.map((each) => (each as HTMLInputElement).checked)), [true, false]);
    const row = page.locator("article.document tbody tr").nth(1);
    assert.equal(await row.evaluate((el) => el.classList.contains("ld-checked")), false);
    await boxes(page).nth(1).click();
    await until(() => host.folders.read(disk, "a.md") === TABLE.replace("| [ ] | Tests", "| [x] | Tests"), "the tick on disk");
    await until(async () => (await row.evaluate((el) => el.classList.contains("ld-checked"))) === true, "the row hatched");
    const cell = row.locator("td").nth(1);
    assert.equal(await cell.evaluate((el) => getComputedStyle(el).opacity), "0.55");
    assert.match(await cell.evaluate((el) => getComputedStyle(el, "::after").backgroundImage), /repeating-linear-gradient/);
    await boxes(page).first().click();
    await until(() => host.folders.read(disk, "a.md") === TABLE.replace("| [ ] | Tests", "| [x] | Tests").replace("| [x] | Spec", "| [ ] | Spec"), "the untick on disk");
  });

  test("the table stays where it is on screen: an unfolded code block stays unfolded, a shrinking image above is made up for", async () => {
    const filler = Array.from({ length: 30 }, (_, i) => `Paragraph ${i}.\n`).join("\n");
    const code = "```js\n" + Array.from({ length: 60 }, (_, i) => `line${i}();`).join("\n") + "\n```\n";
    const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64"));
    const { page, host, disk } = await withProject({ "a.md": `# T\n\n![dot](dot.png)\n\n${code}\n${filler}\n${TABLE}\n${filler}`, "dot.png": png });
    await page.addStyleTag({ content: "article.document img { width: 400px; }" });
    await page.locator("article.document pre button").click();
    const box = boxes(page).nth(1);
    await box.scrollIntoViewIfNeeded();
    const top = await box.evaluate((el) => el.getBoundingClientRect().top);
    await box.click();
    await until(() => host.folders.read(disk, "a.md")?.includes("| [x] | Tests") === true, "the tick on disk");
    await until(async () => (await boxes(page).nth(1).evaluate((el) => (el as HTMLInputElement).checked)) === true, "the new render");
    assert.equal(await page.locator("article.document pre").evaluate((el) => el.classList.contains("ld-expanded")), true);
    await page.evaluate(() => document.querySelectorAll<HTMLElement>("article.document img").forEach((img) => (img.style.height = "0px")));
    await until(async () => Math.abs((await boxes(page).nth(1).evaluate((el) => el.getBoundingClientRect().top)) - top) < 1, "the box at its place");
  });

  test("a double-click on a box ticks it twice and opens no form", async () => {
    const { page, host, disk } = await withProject({ "a.md": TABLE });
    await boxes(page).first().waitFor();
    await boxes(page).nth(1).click();
    await until(() => host.folders.read(disk, "a.md")?.includes("| [x] | Tests") === true, "the first tick");
    await boxes(page).nth(1).click();
    await until(() => host.folders.read(disk, "a.md") === TABLE, "back as it was");
    await boxes(page).nth(1).dblclick();
    assert.equal(await page.getByRole("dialog").count(), 0);
  });

  test("the Table form's Check boxes option adds the column, a box ticks a row, and Insert writes them", async () => {
    const { page, host, disk } = await withProject({ "a.md": "| H1 | H2 |\n| --- | --- |\n| a  | b  |\n| c  | d  |\n" });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("textbox", { name: "Markdown" }).click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Check boxes" }).check();
    await dialog.getByRole("checkbox", { name: "Check row 2" }).check();
    assert.equal(await dialog.getByRole("textbox", { name: "Row 2, column 2" }).inputValue(), "a");
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    await until(
      () => host.folders.read(disk, "a.md") === "<!-- table-checkboxes -->\n|     | H1  | H2  |\n| --- | --- | --- |\n| [ ] | a   | b   |\n| [x] | c   | d   |\n",
      "the boxes on disk",
    );
  });
});
