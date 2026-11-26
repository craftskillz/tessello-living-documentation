import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import type { Page } from "playwright";
import { type Opened, useBrowser, withProject as connected } from "./living-documentation.ts";

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

const FILE = ".living-doc.json";
const REFUSED = "Tag markers cannot be inserted in code, a diagram, a compare block or a Kanban board.";
const CHANGED = "This passage changed on disk; try again.";
const INVALID = "A name (letters, digits, hyphens, starting with a letter, not an HTML element), optionally followed by free text without <, > or =.";

const pills = (page: Page) => page.locator("article.document mark.ld-tag-marker");
const insertPopup = (page: Page) => page.getByRole("dialog", { name: "Insert a Tag marker" });
const read = (host: Opened["host"], disk: Parameters<Opened["host"]["folders"]["read"]>[0], file = "a.md") => host.folders.read(disk, file);

/** The centre of the character at `index` of the first text node that contains `text`. */
async function pointOf(page: Page, text: string, index: number) {
  return page.evaluate(
    ([wanted, at]) => {
      const walker = document.createTreeWalker(document.querySelector("article.document")!, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const found = node.data.indexOf(wanted as string);
        if (found < 0) continue;
        const range = document.createRange();
        range.setStart(node, found + (at as number));
        range.setEnd(node, found + (at as number) + 1);
        const box = range.getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      }
      throw new Error(`"${wanted}" not found`);
    },
    [text, index] as const,
  );
}

async function shiftRightClick(page: Page, point: { x: number; y: number }) {
  await page.keyboard.down("Shift");
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page.keyboard.up("Shift");
}

describe("inserting a Tag marker", () => {
  test("Shift + right-click on a character, a name and Enter write the marker before it and show a pill", async () => {
    const { page, host, disk } = await withProject({ "a.md": "Hello unique-zebra world today.\n" });
    await page.getByText("unique-zebra").waitFor();
    await shiftRightClick(page, await pointOf(page, "world", 0));
    const popup = insertPopup(page);
    await popup.waitFor();
    const field = popup.getByPlaceholder("tag-name");
    assert.equal(await field.evaluate((el) => el === document.activeElement), true);
    await field.fill("Rewrite-Section");
    await field.press("Enter");
    await popup.waitFor({ state: "detached" });
    await pills(page).first().waitFor();
    assert.equal(await pills(page).first().getAttribute("data-tag"), "rewrite-section");
    assert.equal(read(host, disk), "Hello unique-zebra <rewrite-section>world today.\n");
  });

  test("the right half of a character still targets that character", async () => {
    const { page, host, disk } = await withProject({ "a.md": "Hello unique-zebra world today.\n" });
    await page.getByText("unique-zebra").waitFor();
    const point = await pointOf(page, "world", 0);
    await shiftRightClick(page, { x: point.x + 2, y: point.y });
    const popup = insertPopup(page);
    await popup.getByPlaceholder("tag-name").fill("todo");
    await popup.getByRole("button", { name: "Insert" }).click();
    await pills(page).first().waitFor();
    assert.equal(read(host, disk), "Hello unique-zebra <todo>world today.\n");
  });

  test("in a table cell it works; in a code block it is refused and nothing is written", async () => {
    const text = "| A | B |\n|---|---|\n| one | two-cell |\n\n```\nplain words here\n```\n";
    const { page, host, disk } = await withProject({ "a.md": text });
    await page.getByText("two-cell").waitFor();
    await shiftRightClick(page, await pointOf(page, "plain words", 4));
    await page.getByText(REFUSED).waitFor();
    assert.equal(await insertPopup(page).count(), 0);
    assert.equal(read(host, disk), text);

    await shiftRightClick(page, await pointOf(page, "two-cell", 4));
    const popup = insertPopup(page);
    await popup.getByPlaceholder("tag-name").fill("check");
    await popup.getByPlaceholder("tag-name").press("Enter");
    await pills(page).first().waitFor();
    assert.equal(read(host, disk), text.replace("two-cell", "two-<check>cell"));
  });

  test("an invalid name shows the error and writes nothing; Escape closes the popup", async () => {
    const text = "Hello unique-zebra world today.\n";
    const { page, host, disk } = await withProject({ "a.md": text });
    await page.getByText("unique-zebra").waitFor();
    await shiftRightClick(page, await pointOf(page, "world", 0));
    const popup = insertPopup(page);
    await popup.getByPlaceholder("tag-name").fill("1bad");
    await popup.getByPlaceholder("tag-name").press("Enter");
    await popup.getByRole("alert").filter({ hasText: INVALID }).waitFor();
    assert.equal(read(host, disk), text);
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "detached" });
    assert.equal(read(host, disk), text);
  });

  test("suggestions: the Tag names of the settings, then the names already used in the Project", async () => {
    const { page } = await withProject({
      "a.md": "Hello unique-zebra world today.\n",
      "b.md": "Check <check-links>this.\n",
      [FILE]: '{"tagSuggestions":["add-footnote"]}\n',
    });
    await page.getByText("unique-zebra").waitFor();
    await shiftRightClick(page, await pointOf(page, "world", 0));
    const popup = insertPopup(page);
    await popup.waitFor();
    await page.locator("datalist option[value='check-links']").waitFor({ state: "attached" });
    const values = await page.locator("datalist option").evaluateAll((all) => all.map((each) => (each as HTMLOptionElement).value));
    assert.deepEqual(values, ["add-footnote", "check-links"]);
  });

  test("an agent changes another paragraph: both changes are kept; the clicked one: the passage changed and the agent's file stays", async () => {
    const first = "Hello unique-zebra world today.\n\nSecond paragraph here.\n";
    const { page, host, disk } = await withProject({ "a.md": first });
    await page.getByText("unique-zebra").waitFor();
    let point = await pointOf(page, "world", 0);
    const other = "Hello unique-zebra world today.\n\nSecond paragraph changed.\n";
    host.folders.write(disk, "a.md", other);
    await shiftRightClick(page, point);
    let popup = insertPopup(page);
    await popup.getByPlaceholder("tag-name").fill("todo");
    await popup.getByPlaceholder("tag-name").press("Enter");
    await popup.waitFor({ state: "detached" });
    await until(() => read(host, disk)?.includes("<todo>") ?? false);
    assert.equal(read(host, disk), "Hello unique-zebra <todo>world today.\n\nSecond paragraph changed.\n");

    const { page: page2, host: host2, disk: disk2 } = await withProject({ "a.md": first });
    await page2.getByText("unique-zebra").waitFor();
    point = await pointOf(page2, "world", 0);
    const theirs = "Hello unique-zebra planet today.\n\nSecond paragraph here.\n";
    host2.folders.write(disk2, "a.md", theirs);
    await shiftRightClick(page2, point);
    popup = insertPopup(page2);
    await popup.getByPlaceholder("tag-name").fill("todo");
    await popup.getByPlaceholder("tag-name").press("Enter");
    await page2.getByText(CHANGED).waitFor();
    assert.equal(read(host2, disk2), theirs);
  });

  test("in French the refusal is translated", async () => {
    const { page } = await withProject({ "a.md": "```\nplain words here\n```\n" }, { locale: "fr" });
    await page.getByText("plain words").waitFor();
    await shiftRightClick(page, await pointOf(page, "plain words", 4));
    await page.getByText(/Les marqueurs ne peuvent pas être insérés/).waitFor();
  });
});

describe("removing a Tag marker", () => {
  test("Shift + right-click on a pill asks, then Remove deletes that tag only; Cancel keeps it", async () => {
    const { page, host, disk } = await withProject({ "a.md": "Hello <add-footnote>world. <add-footnote>again.\n" });
    await pills(page).nth(1).waitFor();
    const box = (await pills(page).nth(1).boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await shiftRightClick(page, point);
    const popup = page.getByRole("dialog", { name: "Remove the add-footnote Tag marker?" });
    await popup.waitFor();
    await popup.getByRole("button", { name: "Cancel" }).click();
    await popup.waitFor({ state: "detached" });
    assert.equal(read(host, disk), "Hello <add-footnote>world. <add-footnote>again.\n");

    await shiftRightClick(page, point);
    await popup.getByRole("button", { name: "Remove" }).click();
    await popup.waitFor({ state: "detached" });
    await until(() => pills(page).count().then((count) => count === 1));
    assert.equal(read(host, disk), "Hello <add-footnote>world. again.\n");
  });
});

describe("Project settings: Tag names", () => {
  test("invalid names show an error and write nothing; fixed, they are kept normalized", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n", [FILE]: '{"tagSuggestions":["todo"]}\n' });
    await page.locator(".switcher > button").click();
    await page.getByRole("dialog", { name: /^Projects$/ }).getByRole("button", { name: "Project settings…" }).click();
    const settings = page.getByRole("dialog", { name: "Project settings" });
    const field = settings.getByRole("textbox", { name: "Tag names" });
    assert.equal(await field.inputValue(), "todo");
    await field.fill("<Add-Footnote>, bad_name");
    await field.press("Enter");
    await settings.getByRole("alert").filter({ hasText: "Invalid Tag names: bad_name." }).waitFor();
    assert.equal(read(host, disk, FILE), '{"tagSuggestions":["todo"]}\n');
    assert.equal(await field.inputValue(), "<Add-Footnote>, bad_name");

    await field.fill("<Add-Footnote>, rewrite-section");
    await field.press("Enter");
    await until(() => read(host, disk, FILE) !== '{"tagSuggestions":["todo"]}\n');
    assert.deepEqual(JSON.parse(String(read(host, disk, FILE))), { tagSuggestions: ["add-footnote", "rewrite-section"] });
    assert.equal(await settings.getByRole("alert").count(), 0);
  });
});
