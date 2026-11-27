import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Page } from "playwright";
import { until } from "@tessello/sdk/testing";
import { useBrowser, withProject } from "./living-documentation.ts";

useBrowser();

const startEditing = async (page: Page, button = "Edit") => {
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.getByRole("textbox", { name: "Markdown" }).click();
  await page.keyboard.press("ControlOrMeta+End");
};

const picker = (page: Page, title = "🧩 Insert a snippet") => page.getByRole("dialog", { name: title });

describe("the snippet picker", () => {
  test("a search, Enter and the table grid write the table with its directives; autosave puts it on disk", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n" });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("searchbox", { name: "Search a snippet…" }).waitFor();
    assert.ok(await dialog.getByRole("searchbox").evaluate((each) => each === document.activeElement), "the search is focused");
    await page.keyboard.type("table");
    await page.keyboard.press("Enter");

    await dialog.getByRole("button", { name: "← Back" }).waitFor();
    await dialog.getByRole("button", { name: "Insert", exact: true }).waitFor();
    await dialog.getByLabel("Table style").selectOption({ label: "Intermediate" });
    await dialog.getByRole("checkbox", { name: "Striped" }).check();
    await dialog.getByRole("checkbox", { name: "Borders", exact: true }).check();
    await dialog.getByRole("checkbox", { name: "Rounded" }).check();
    await dialog.getByLabel("Color").selectOption({ label: "Info (blue)" });
    await dialog.getByRole("textbox", { name: "Row 1, column 1" }).fill("Name");
    await dialog.getByRole("textbox", { name: "Row 1, column 2" }).fill("Role");
    await dialog.getByRole("textbox", { name: "Row 2, column 1" }).fill("Ann");
    const last = dialog.getByRole("textbox", { name: "Row 2, column 2" });
    await last.fill("Dev");
    await last.press("ArrowDown");
    await dialog.getByRole("textbox", { name: "Row 3, column 2" }).waitFor();
    const head = dialog.getByRole("textbox", { name: "Row 1, column 2" });
    await head.click();
    await head.press("End");
    await head.press("ArrowRight");
    await dialog.getByRole("textbox", { name: "Row 1, column 3" }).fill("Note");
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();

    const expected =
      "# A\n\nFirst.\n\n<!-- table-style: intermediate -->\n<!-- table-fill: striped -->\n<!-- table-border: bordered -->\n<!-- table-rounded -->\n<!-- table-color: info -->\n" +
      "| Name | Role | Note |\n| ---- | ---- | ---- |\n| Ann  | Dev  |      |\n|      |      |      |\n";
    await until(() => host.folders.read(disk, "a.md") === expected, "the table on disk");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(page.url(), address);
  });

  test("no match says so, Back returns to the picker, Escape closes without inserting", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n" });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await page.keyboard.type("zzzzqq");
    await dialog.getByText("No matching snippet.").waitFor();
    await dialog.getByRole("searchbox").fill("");
    await dialog.getByRole("button", { name: "Bullet list" }).click();
    await dialog.getByRole("button", { name: "← Back" }).click();
    await dialog.getByRole("searchbox").waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Insert", exact: true }).count(), 0);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("textbox", { name: "Markdown" }).waitFor();
    assert.equal(host.folders.read(disk, "a.md"), "# A\n");
    assert.equal(page.url(), address);
  });

  test("a bullet list holds the translated example; in French, Élément 1", async () => {
    const english = await withProject({ "a.md": "# A\n" });
    const englishAddress = english.page.url();
    await startEditing(english.page);
    await english.page.getByRole("button", { name: "Snippets" }).click();
    await picker(english.page).getByRole("button", { name: "Bullet list" }).click();
    await picker(english.page).getByRole("button", { name: "Insert", exact: true }).click();
    await until(() => english.host.folders.read(english.disk, "a.md")?.includes("- Item 1\n- Item 2\n  - Sub-item 2.1"), "the English list");
    assert.equal(english.page.url(), englishAddress);

    const { page, host, disk } = await withProject({ "a.md": "# A\n" }, { locale: "fr" });
    const address = page.url();
    await startEditing(page, "Modifier");
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page, "🧩 Insérer un snippet");
    await dialog.getByRole("button", { name: "Liste à puces" }).click();
    await dialog.getByRole("button", { name: "Insérer", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md")?.includes("- Élément 1\n- Élément 2\n  - Sous-élément 2.1"), "the French list");
    assert.equal(page.url(), address);
  });

  test("a table selected in the editor reopens in the Table form and Insert replaces it", async () => {
    const table = "| H1 | H2 |\n| --- | --- |\n| a  | b  |\n";
    const { page, host, disk } = await withProject({ "a.md": table });
    const address = page.url();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("textbox", { name: "Markdown" }).click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    assert.equal(await dialog.getByRole("button", { name: "← Back" }).count(), 0);
    assert.equal(await dialog.getByText("Detected").count(), 0);
    const cell = dialog.getByRole("textbox", { name: "Row 2, column 2" });
    assert.equal(await cell.inputValue(), "b");
    await cell.fill("changed");
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md") === "| H1  | H2      |\n| --- | ------- |\n| a   | changed |\n", "the table replaced");
    assert.equal(page.url(), address);
  });

  test("Striped and Full are exclusive: checking one unchecks the other", async () => {
    const { page } = await withProject({ "a.md": "# A\n" });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("button", { name: "Table", exact: true }).click();
    const striped = dialog.getByRole("checkbox", { name: "Striped" });
    const full = dialog.getByRole("checkbox", { name: "Full" });
    await striped.check();
    await full.check();
    assert.equal(await striped.isChecked(), false);
    assert.equal(await full.isChecked(), true);
    await striped.check();
    assert.equal(await full.isChecked(), false);
    assert.deepEqual(await dialog.getByLabel("Table style").locator("option").allTextContents(), ["Default", "Intermediate", "Compact"]);
    assert.equal(page.url(), address);
  });

  test("Borders and Softened borders are exclusive, and Insert writes the soft directive", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n" });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("button", { name: "Table", exact: true }).click();
    const borders = dialog.getByRole("checkbox", { name: "Borders", exact: true });
    const soft = dialog.getByRole("checkbox", { name: "Softened borders", exact: true });
    await borders.check();
    await soft.check();
    assert.equal(await borders.isChecked(), false);
    assert.equal(await soft.isChecked(), true);
    await borders.check();
    assert.equal(await soft.isChecked(), false);
    await soft.check();
    assert.equal(await dialog.locator(".grid table").evaluate((el) => el.classList.contains("table-border-soft-bordered") && !el.classList.contains("table-border-bordered")), true);
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md")?.includes("<!-- table-border: soft-bordered -->") === true, "the soft directive on disk");
    assert.equal(page.url(), address);
  });

  test("the grid of the Table form looks like the table of the Document", async () => {
    const source = "<!-- table-style: intermediate -->\n<!-- table-fill: striped -->\n<!-- table-rounded -->\n<!-- table-color: info -->\n| H1 | H2 |\n| -- | -- |\n| a  | b  |\n| c  | d  |\n";
    const { page } = await withProject({ "a.md": source });
    const address = page.url();
    const read = (locator: ReturnType<Page["locator"]>, cell: string) =>
      locator.evaluate((table, cellSelector) => {
        const style = (each: Element) => getComputedStyle(each);
        const body = [...table.querySelectorAll(cellSelector)];
        const row = (index: number) => body[index]!;
        return {
          radius: style(table).borderTopLeftRadius,
          frame: style(table).borderTopWidth,
          overflow: style(table).overflow,
          padding: style(row(0)).padding,
          font: style(row(0)).fontSize,
          headFill: style(row(0)).backgroundColor,
          stripe: style(row(2)).backgroundColor,
          plain: style(row(4)).backgroundColor,
        };
      }, cell);
    const rendered = await read(page.locator(".document table").first(), "th, td");
    await page.getByRole("cell", { name: "a", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit table" }).click();
    const grid = await read(page.getByRole("dialog").locator(".grid table"), "th, td");
    assert.notEqual(rendered.radius, "0px", "the Document table is rounded");
    assert.deepEqual(grid, rendered);
    assert.equal(page.url(), address);
  });

  test("a | typed in a cell is written \\|", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n" });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("button", { name: "Table", exact: true }).click();
    await dialog.getByRole("textbox", { name: "Row 2, column 1" }).fill("a|b");
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md")?.includes("| a\\|b "), "the escaped bar");
    assert.equal(page.url(), address);
  });

  test("a separator never turns the line above into a heading", async () => {
    const { page, host, disk } = await withProject({ "a.md": "Text\n" });
    const address = page.url();
    await startEditing(page);
    await page.keyboard.press("End");
    await page.getByRole("button", { name: "Snippets" }).click();
    await picker(page).getByRole("button", { name: "Horizontal rule" }).click();
    await picker(page).getByRole("button", { name: "Insert", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md")?.includes("Text\n\n---\n"), "the rule with its blank line");
    assert.equal(page.url(), address);
  });

  test("the tree's indent buttons speak French", async () => {
    const { page } = await withProject({ "a.md": "# A\n" }, { locale: "fr" });
    const address = page.url();
    await startEditing(page, "Modifier");
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page, "🧩 Insérer un snippet");
    await dialog.getByRole("button", { name: "Arborescence" }).click();
    await dialog.getByRole("button", { name: "Indenter", exact: true }).first().waitFor();
    await dialog.getByRole("button", { name: "Désindenter", exact: true }).first().waitFor();
    await dialog.getByRole("button", { name: "Supprimer", exact: true }).first().waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Indenter", exact: true }).first().getAttribute("title"), "Indenter");
    assert.equal(page.url(), address);
  });
});

describe("snippets in the section editor", () => {
  test("Link to anchor lists the Document's headings, inserts into the draft; Escape closes only the snippet dialog", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# One\n\nFirst.\n\n## Two words\n\nSecond.\n" });
    const address = page.url();
    await page.getByText("Second.").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit section" }).click();
    const section = page.getByRole("dialog", { name: "Edit section" });
    await section.getByRole("textbox", { name: "Markdown" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await section.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("button", { name: "Link to anchor", exact: true }).click();
    const options = await dialog.getByLabel("Anchor").locator("option").allInnerTexts();
    assert.ok(options.some((each) => each.includes("One")) && options.some((each) => each.includes("Two words")), options.join("|"));
    await dialog.getByLabel("Anchor").selectOption({ label: options.find((each) => each.includes("One"))! });
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md")?.includes("[View section](#one)"), "the link in the section on disk");

    await section.getByRole("button", { name: "Snippets" }).click();
    await picker(page).waitFor();
    await page.keyboard.press("Escape");
    await picker(page).waitFor({ state: "detached" });
    await section.waitFor();
    assert.equal(page.url(), address);
  });
});

const edit = (page: Page) => page.getByRole("dialog", { name: "Edit snippet" });
const sure = (page: Page) => page.getByRole("dialog", { name: "Delete block" });
const entries = async (page: Page) => (await page.getByRole("menuitem").allInnerTexts()).map((each) => each.trim());

describe("block actions in the reading view", () => {
  test("Insert a snippet here puts a bullet list after the clicked paragraph", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n\nSecond.\n" });
    const address = page.url();
    await page.getByText("First.").click({ button: "right" });
    assert.deepEqual(await entries(page), ["Insert a snippet here", "Edit section"]);
    await page.getByRole("menuitem", { name: "Insert a snippet here" }).click();
    const dialog = picker(page);
    await dialog.getByRole("button", { name: "Bullet list" }).click();
    await dialog.getByRole("textbox", { name: "Items" }).fill("one\ntwo\nthree");
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md") === "# A\n\nFirst.\n\n- one\n- two\n- three\n\nSecond.\n", "the list after the paragraph");
    await page.getByRole("listitem").filter({ hasText: "three" }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(page.url(), address);
  });

  test("the empty space below a short Document offers only Insert, at the end", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nShort.\n" });
    const address = page.url();
    const box = (await page.locator("article.document").boundingBox())!;
    await page.mouse.click(box.x + 20, box.y + box.height + 120, { button: "right" });
    await page.getByRole("menuitem").first().waitFor();
    assert.deepEqual(await entries(page), ["Insert a snippet here"]);
    await page.getByRole("menuitem", { name: "Insert a snippet here" }).click();
    await picker(page).getByRole("button", { name: "Horizontal rule" }).click();
    await picker(page).getByRole("button", { name: "Insert", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md") === "# A\n\nShort.\n\n---\n", "the rule at the end");
    assert.equal(page.url(), address);
  });

  test("Edit blockquote reopens the form filled in; Save changes only that block", async () => {
    const source = "# A\n\nBefore.\n\n<!-- quote-type: warning -->\n<!-- quote-title: Heads up -->\n<!-- quote-icon -->\n> Be careful\n\nAfter.\n";
    const { page, host, disk } = await withProject({ "a.md": source });
    const address = page.url();
    await page.getByText("Be careful").click({ button: "right" });
    assert.deepEqual(await entries(page), ["Edit blockquote", "Delete blockquote", "Edit section"]);
    await page.getByRole("menuitem", { name: "Edit blockquote" }).click();
    const dialog = edit(page);
    await dialog.waitFor();
    assert.equal(await dialog.getByRole("button", { name: "← Back" }).count(), 0);
    assert.equal(await dialog.getByLabel("Type").inputValue(), "warning");
    assert.equal(await dialog.getByRole("checkbox", { name: "Show icon" }).isChecked(), true);
    assert.equal(await dialog.getByLabel("Title (optional)").inputValue(), "Heads up");
    assert.equal(await dialog.getByLabel("Content").inputValue(), "Be careful");
    await dialog.getByLabel("Content").fill("Be very careful");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md") === source.replace("Be careful", "Be very careful"), "only the quote changed");
    await page.getByText("Be very careful").waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(page.url(), address);
  });

  test("a table inside a quote edits as a table and stays in the quote; a double-click on a cell focuses it", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\n> | a | b |\n> | - | - |\n> | 1 | 2 |\n" });
    const address = page.url();
    await page.getByRole("cell", { name: "1", exact: true }).click({ button: "right" });
    assert.ok((await entries(page)).includes("Edit table"));
    await page.getByRole("menuitem", { name: "Edit table" }).click();
    await edit(page).getByRole("textbox", { name: "Row 2, column 1" }).fill("x");
    await edit(page).getByRole("button", { name: "Save", exact: true }).click();
    await until(() => {
      const text = host.folders.read(disk, "a.md") ?? "";
      return text.includes("| x ") && text.trim().split("\n").slice(2).every((line) => line.startsWith("> "));
    }, "the table still in the quote");
    await edit(page).waitFor({ state: "detached" });

    await page.getByRole("cell", { name: "2", exact: true }).dblclick();
    const dialog = edit(page);
    await dialog.waitFor();
    await until(() => dialog.getByRole("textbox", { name: "Row 2, column 2" }).evaluate((each) => each === document.activeElement), "the cell focused");
    assert.equal(page.url(), address);
  });

  test("Delete table asks first: Cancel leaves it, Delete removes exactly that block", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nAfter.\n" });
    const address = page.url();
    const original = host.folders.read(disk, "a.md");
    await page.getByRole("cell", { name: "1", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete table" }).click();
    await sure(page).getByText("Delete this block from the document?").waitFor();
    await sure(page).getByRole("button", { name: "Cancel" }).click();
    await sure(page).waitFor({ state: "detached" });
    assert.equal(host.folders.read(disk, "a.md"), original);

    await page.getByRole("cell", { name: "1", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete table" }).click();
    await sure(page).getByRole("button", { name: "Delete", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md") === "# A\n\nAfter.\n", "the table gone");
    assert.equal(await page.getByRole("table").count(), 0);
    assert.equal(page.url(), address);
  });

  test("Delete block in the edit dialog confirms too", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\n### Third\n\nAfter.\n" });
    const address = page.url();
    await page.getByRole("heading", { name: "Third" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit heading level 3" }).click();
    await edit(page).getByRole("button", { name: "Delete block" }).click();
    await sure(page).getByRole("button", { name: "Cancel" }).click();
    await edit(page).waitFor();
    await edit(page).getByRole("button", { name: "Delete block" }).click();
    await sure(page).getByRole("button", { name: "Delete", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md") === "# A\n\nAfter.\n", "the heading gone");
    await edit(page).waitFor({ state: "detached" });
    assert.equal(page.url(), address);
  });

  const quote = "# A\n\n> Quote one\n\nTail.\n";
  const openQuote = async (page: Page, text = "Quote one") => {
    await page.getByText(text).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit blockquote" }).click();
    await edit(page).getByLabel("Content").waitFor();
  };

  test("conflict, moved: the agent edits elsewhere; Retry saves where the block is now, the agent's text kept", async () => {
    const { page, host, disk } = await withProject({ "a.md": quote });
    const address = page.url();
    await openQuote(page);
    host.folders.write(disk, "a.md", `Intro by the agent.\n\n${quote}`);
    await edit(page).getByLabel("Content").fill("Quote changed");
    await edit(page).getByRole("button", { name: "Save", exact: true }).click();
    await edit(page).getByText("This document changed on disk. Retry applies your change where the block is now.").waitFor();
    assert.equal(await edit(page).getByLabel("Content").inputValue(), "Quote changed");
    await edit(page).getByRole("button", { name: "Retry" }).click();
    await until(() => host.folders.read(disk, "a.md") === "Intro by the agent.\n\n# A\n\n> Quote changed\n\nTail.\n", "saved at the new place");
    await edit(page).waitFor({ state: "detached" });
    assert.equal(page.url(), address);
  });

  test("conflict, gone: the agent rewrites the block; no Retry, Copy Markdown copies the form's Markdown", async () => {
    const { page, host, disk } = await withProject({ "a.md": quote });
    const address = page.url();
    await openQuote(page);
    const theirs = "# A\n\n> Rewritten by the agent\n\nTail.\n";
    host.folders.write(disk, "a.md", theirs);
    await edit(page).getByLabel("Content").fill("Mine");
    await edit(page).getByRole("button", { name: "Save", exact: true }).click();
    await edit(page).getByText("This block changed on disk.").waitFor();
    assert.equal(await edit(page).getByRole("button", { name: "Retry" }).count(), 0);
    await edit(page).getByRole("button", { name: "Copy Markdown" }).click();
    await edit(page).getByText("Copied").waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "> Mine");
    assert.equal(host.folders.read(disk, "a.md"), theirs);
    assert.equal(page.url(), address);
  });

  test("a save the disk refuses shows the message and Retry; the dialog keeps its content", async () => {
    const { page, host, disk } = await withProject({ "a.md": quote });
    const address = page.url();
    await openQuote(page);
    host.folders.restart();
    await edit(page).getByLabel("Content").fill("Kept");
    await edit(page).getByRole("button", { name: "Save", exact: true }).click();
    await edit(page).getByText("Saving failed. Try again; if it keeps failing, reconnect the folder.").waitFor();
    await edit(page).getByRole("button", { name: "Retry" }).waitFor();
    assert.equal(await edit(page).getByLabel("Content").inputValue(), "Kept");
    assert.equal(host.folders.read(disk, "a.md"), quote);
    assert.equal(page.url(), address);
  });

  test("a code block inside a collapsible edits on its own; a heading inside a colored section edits the section", async () => {
    const section = '<div style="background:#eff6ff;border-left:4px solid #3b82f6;color:#1e3a5f;padding:1rem 1.25rem;border-radius:0.375rem;margin:1rem 0;">\n\n## Inner\n\nWords.\n\n</div>\n';
    const source = `# A\n\n<details>\n<summary>More</summary>\n\n\`\`\`js\nlet a = 1;\n\`\`\`\n\n</details>\n\n${section}`;
    const { page, host, disk } = await withProject({ "a.md": source });
    const address = page.url();
    await page.getByText("More", { exact: true }).click();
    await page.getByText("let a = 1;").click({ button: "right" });
    assert.ok((await entries(page)).includes("Edit code block"), (await entries(page)).join("|"));
    assert.ok(!(await entries(page)).includes("Edit collapsible block"));
    await page.getByRole("menuitem", { name: "Edit code block" }).click();
    await edit(page).getByLabel("Code").fill("let a = 2;");
    await edit(page).getByRole("button", { name: "Save", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md") === source.replace("let a = 1;", "let a = 2;"), "only the code changed");
    await edit(page).waitFor({ state: "detached" });

    await page.getByRole("heading", { name: "Inner" }).click({ button: "right" });
    assert.ok((await entries(page)).includes("Edit colored section"), (await entries(page)).join("|"));
    await page.getByRole("menuitem", { name: "Edit colored section" }).click();
    assert.equal(await edit(page).getByLabel("Content").inputValue(), "## Inner\n\nWords.");
    assert.equal(page.url(), address);
  });

  test("in French, the menu entries and the confirmation are translated", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nTexte.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n" }, { locale: "fr" });
    const address = page.url();
    await page.getByText("Texte.").click({ button: "right" });
    assert.deepEqual(await entries(page), ["Insérer un snippet ici", "Modifier la section"]);
    await page.keyboard.press("Escape");
    await page.getByRole("cell", { name: "1", exact: true }).click({ button: "right" });
    assert.deepEqual(await entries(page), ["Éditer le tableau", "Copier le tableau", "Supprimer le tableau", "Modifier la section"]);
    await page.getByRole("menuitem", { name: "Supprimer le tableau" }).click();
    const dialog = page.getByRole("dialog", { name: "Supprimer le bloc" });
    await dialog.getByText("Supprimer ce bloc du document ?").waitFor();
    await dialog.getByRole("button", { name: "Supprimer", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md") === "# A\n\nTexte.\n", "the table gone");
    assert.equal(page.url(), address);
  });
});

describe("Snippets II: Mermaid, Layout and File attachment", () => {
  const fence = (...lines: string[]) => ["```mermaid", ...lines, "```"].join("\n");
  const pie = (title: string, ...rows: [string, number][]) => fence(`pie title ${title}`, ...rows.map(([label, value]) => `         "${label}" : ${value}`));

  test("a Mermaid pie from the picker: title and weights are written, no cap", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n" });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("button", { name: "Mermaid", exact: true }).click();
    assert.equal(await dialog.getByLabel("Type").inputValue(), "pie");
    await dialog.getByLabel("Title", { exact: true }).fill("MY PIE");
    await dialog.getByLabel("Weight 1", { exact: true }).fill("70");
    await dialog.getByLabel("Weight 2", { exact: true }).fill("60");
    await dialog.getByLabel("Weight 3", { exact: true }).fill("");
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    const expected = pie("MY PIE", ["Drafting the first version", 70], ["Reviewing with stakeholders", 60], ["Publishing updates", 0]);
    await until(() => host.folders.read(disk, "a.md") === `# A\n\nFirst.\n\n${expected}\n`, "the pie on disk");
    assert.equal(page.url(), address);
  });

  test("the last row of a list cannot be removed; Add item adds one", async () => {
    const { page } = await withProject({ "a.md": "# A\n" });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("button", { name: "Mermaid", exact: true }).click();
    await dialog.getByRole("button", { name: "Remove row 3" }).click();
    await dialog.getByRole("button", { name: "Remove row 2" }).click();
    assert.equal(await dialog.getByRole("button", { name: "Remove row 1" }).isDisabled(), true);
    await dialog.getByRole("button", { name: "Add item" }).click();
    assert.equal(await dialog.getByLabel("Label 2", { exact: true }).count(), 1);
    assert.equal(page.url(), address);
  });

  test("a Sequence diagram with an added note writes the Note line", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n" });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("button", { name: "Mermaid", exact: true }).click();
    await dialog.getByLabel("Type").selectOption({ label: "Sequence diagram" });
    await dialog.getByRole("button", { name: "Add note" }).click();
    await dialog.getByLabel("Note position 8", { exact: true }).selectOption({ label: "Over" });
    await dialog.getByLabel("Participant 8", { exact: true }).fill("Author");
    await dialog.getByLabel("Note text 8", { exact: true }).fill("Thinks");
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md")?.includes("    Note over Author: Thinks\n```") === true, "the note on disk");
    assert.equal(page.url(), address);
  });

  test("Timeline and Tree view rows are written", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n" });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("button", { name: "Mermaid", exact: true }).click();
    await dialog.getByLabel("Type").selectOption({ label: "Tree view" });
    await dialog.getByLabel("Decorator 1", { exact: true }).fill(":::highlight");
    await dialog.getByRole("button", { name: "Add node" }).click();
    await dialog.getByLabel("Node 7", { exact: true }).fill("extra.md");
    await dialog.getByLabel("Level 7", { exact: true }).fill("2");
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    await until(() => {
      const text = host.folders.read(disk, "a.md") ?? "";
      return text.includes("treeView-beta\n    knowledge-workspace/ :::highlight\n") && text.includes("            extra.md\n```");
    }, "the tree on disk");
    assert.equal(page.url(), address);
  });

  test("right-click a builder pie: Edit Mermaid chart reopens on Pie; Save changes only that block", async () => {
    const block = pie("TITLE", ["Alpha", 40], ["Beta", 60]);
    const source = `# A\n\nBefore.\n\n${block}\n\nAfter.\n`;
    const { page, host, disk } = await withProject({ "a.md": source });
    const address = page.url();
    await page.locator(".ld-mermaid").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit Mermaid chart" }).click();
    const dialog = edit(page);
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel("Type").inputValue(), "pie");
    assert.equal(await dialog.getByLabel("Label 1", { exact: true }).inputValue(), "Alpha");
    assert.equal(await dialog.getByLabel("Weight 2", { exact: true }).inputValue(), "60");
    await dialog.getByLabel("Label 1", { exact: true }).fill("Gamma");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md") === source.replace("Alpha", "Gamma"), "only the pie changed");
    assert.equal(page.url(), address);
  });

  test("a Mermaid block with a participant line reopens as a code block", async () => {
    const { page } = await withProject({ "a.md": `# A\n\n${fence("sequenceDiagram", "    participant A", "    A->>B: hi")}\n` });
    const address = page.url();
    await page.locator(".ld-mermaid").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit code block" }).waitFor();
    assert.equal(await page.getByRole("menuitem", { name: "Edit Mermaid chart" }).count(), 0);
    assert.equal(page.url(), address);
  });

  test("a Layout of 3 columns, gap Large, vertical align Top is written", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n" });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("button", { name: "Layout", exact: true }).click();
    assert.equal(await dialog.getByLabel("Vertical align").locator("option:checked").innerText(), "Center");
    assert.equal(await dialog.getByLabel("Gap").locator("option:checked").innerText(), "Medium");
    await dialog.getByLabel("Columns").selectOption("3");
    await dialog.getByLabel("Gap").selectOption({ label: "Large" });
    await dialog.getByLabel("Vertical align").selectOption({ label: "Top" });
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    const layout = "<!-- layout-columns: vertical-align: top | gap: lg -->\n\n<!-- col -->\n\nColumn 1\n\n<!-- col -->\n\nColumn 2\n\n<!-- col -->\n\nColumn 3\n\n<!-- /layout-columns -->";
    await until(() => host.folders.read(disk, "a.md") === `# A\n\nFirst.\n\n${layout}\n`, "the layout on disk");
    assert.equal(page.url(), address);
  });

  test("a reopened Layout: Columns is disabled, Gap changes the header, the columns stay byte-identical", async () => {
    const source = "# A\n\n<!-- layout-columns: gap: sm -->\n\n<!-- col -->\n\nLeft *text*\n\n<!-- col -->\n\nRight text\n\n<!-- /layout-columns -->\n\nAfter.\n";
    const { page, host, disk } = await withProject({ "a.md": source });
    const address = page.url();
    await page.getByText("Right text").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit layout" }).click();
    const dialog = edit(page);
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel("Columns").isDisabled(), true);
    assert.equal(await dialog.getByLabel("Columns").locator("option:checked").innerText(), "2");
    assert.equal(await dialog.getByLabel("Gap").locator("option:checked").innerText(), "Small");
    await dialog.getByLabel("Gap").selectOption({ label: "Large" });
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md") === source.replace("gap: sm", "gap: lg"), "only the header changed");
    assert.equal(page.url(), address);
  });

  const chooseFile = async (page: Page, dialog: ReturnType<Page["getByRole"]>, name: string, text: string) => {
    const chooser = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    await (await chooser).setFiles({ name, mimeType: "text/plain", buffer: Buffer.from(text) });
  };

  test("File attachment from Insert a snippet here saves under files/ and links after the clicked block", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n\nSecond.\n" });
    const address = page.url();
    await page.getByText("First.").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Insert a snippet here" }).click();
    const dialog = picker(page);
    await dialog.getByRole("button", { name: "File attachment" }).click();
    await dialog.getByText("Click Insert to choose a file.", { exact: false }).waitFor();
    await dialog.getByText("Tip: you can also drop a file onto the editor, or paste it.").waitFor();
    await chooseFile(page, dialog, "notes.txt", "hello");
    await until(() => host.folders.read(disk, "a.md") === "# A\n\nFirst.\n\n[📎 notes.txt](files/notes.txt)\n\nSecond.\n", "the link after the block");
    assert.equal(host.folders.read(disk, "files/notes.txt"), "hello");
    assert.equal(page.url(), address);
  });

  test("File attachment from the editor's Snippets button inserts the link at the caret", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nNotes: " });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("button", { name: "File attachment" }).click();
    await chooseFile(page, dialog, "plan.png", "not really an image");
    await until(() => host.folders.read(disk, "a.md")?.includes("Notes: [📎 plan.png](files/plan.png)") === true, "the link at the caret");
    assert.equal(host.folders.read(disk, "files/plan.png"), "not really an image");
    assert.equal(page.url(), address);
  });

  test("a file the disk refuses shows the translated failure with Retry", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n" });
    const address = page.url();
    await page.getByText("First.").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Insert a snippet here" }).click();
    const dialog = picker(page);
    await dialog.getByRole("button", { name: "File attachment" }).click();
    host.folders.restart();
    await chooseFile(page, dialog, "notes.txt", "hello");
    await dialog.getByText("The file could not be saved.").waitFor();
    await dialog.getByRole("button", { name: "Retry" }).waitFor();
    assert.equal(host.folders.read(disk, "files/notes.txt"), null);
    assert.equal(page.url(), address);
  });

  test("a reopened attachment edits its text and target", async () => {
    const source = "# A\n\n[📎 old.txt](files/old.txt)\n\nAfter.\n";
    const { page, host, disk } = await withProject({ "a.md": source });
    const address = page.url();
    await page.getByRole("link", { name: "📎 old.txt" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit attachment" }).click();
    const dialog = edit(page);
    assert.equal(await dialog.getByLabel("Link text", { exact: true }).inputValue(), "old.txt");
    assert.equal(await dialog.getByLabel("Target", { exact: true }).inputValue(), "files/old.txt");
    assert.equal(await dialog.getByText("Click Insert to choose a file.", { exact: false }).count(), 0);
    await dialog.getByLabel("Link text", { exact: true }).fill("The plan");
    await dialog.getByLabel("Target", { exact: true }).fill("files/plan.pdf");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md") === "# A\n\n[📎 The plan](files/plan.pdf)\n\nAfter.\n", "the attachment edited");
    assert.equal(page.url(), address);
  });

  test("in French, the Mermaid and Layout forms and the menu entry are French", async () => {
    const { page } = await withProject({ "a.md": "# A\n\n<!-- layout-columns -->\n\n<!-- col -->\n\nGauche\n\n<!-- col -->\n\nDroite\n\n<!-- /layout-columns -->\n" }, { locale: "fr" });
    const address = page.url();
    await page.getByText("Droite").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Éditer la mise en page" }).click();
    const reopened = page.getByRole("dialog", { name: "Modifier le snippet" });
    await reopened.getByLabel("Alignement vertical").waitFor();
    await reopened.getByLabel("Espacement").waitFor();
    await reopened.getByRole("button", { name: "Annuler" }).click();

    await page.getByRole("button", { name: "Modifier", exact: true }).click();
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page, "🧩 Insérer un snippet");
    await dialog.getByRole("button", { name: "Mermaid", exact: true }).click();
    await dialog.getByRole("button", { name: "Ajouter un élément" }).waitFor();
    await dialog.getByLabel("Type").selectOption({ label: "Diagramme de séquence" });
    await dialog.getByRole("button", { name: "Ajouter une note" }).waitFor();
    assert.equal(page.url(), address);
  });
});

describe("the snippet dialog's width", () => {
  test("a snippet's form takes 80% of the window's width", async () => {
    const { page } = await withProject({ "a.md": "# A\n\nFirst.\n" });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("searchbox", { name: "Search a snippet…" }).waitFor();
    await page.keyboard.type("table");
    await page.keyboard.press("Enter");
    await dialog.getByRole("button", { name: "Insert", exact: true }).waitFor();
    const box = (await dialog.boundingBox())!;
    const { width } = page.viewportSize()!;
    assert.ok(Math.abs(box.width - width * 0.8) <= 2, `${box.width} is 80% of ${width}`);
    assert.equal(page.url(), address);
  });
});

describe("a line break in a table cell", () => {
  test("Shift+Enter in a cell writes <br> at the caret; the reading shows it as a line break", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n" });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("searchbox", { name: "Search a snippet…" }).waitFor();
    await page.keyboard.type("table");
    await page.keyboard.press("Enter");
    const cell = dialog.getByRole("textbox", { name: "Row 2, column 1" });
    await cell.fill("one");
    await cell.press("Shift+Enter");
    await page.keyboard.type("two");
    assert.equal(await cell.inputValue(), "one<br>two");
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    await page.getByRole("button", { name: "Done" }).click();

    await until(() => host.folders.read(disk, "a.md")?.includes("one<br>two"), "the table on disk");
    const td = page.getByRole("cell", { name: /one\s*two/ });
    assert.equal(await td.evaluate((each) => each.querySelectorAll("br").length), 1);
    assert.equal(page.url(), address);
  });
});

describe("the Card snippet", () => {
  test("a Card with a title, the Bristol style, half width and right alignment is written and shown", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n" });
    const address = page.url();
    await startEditing(page);
    await page.getByRole("button", { name: "Snippets" }).click();
    const dialog = picker(page);
    await dialog.getByRole("group", { name: "Structure" }).getByRole("button", { name: "Card", exact: true }).click();
    await dialog.getByLabel("Title").fill("My recipe");
    await dialog.getByLabel("Style").selectOption({ label: "Bristol card" });
    await dialog.getByLabel("Width").selectOption({ label: "Half (1/2)" });
    await dialog.getByLabel("Alignment").selectOption({ label: "Right" });
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    const card = "<!-- card: My recipe | style: bristol | width: 1/2 | align: right -->\n\nCard content\n\n<!-- /card -->";
    await until(() => host.folders.read(disk, "a.md") === `# A\n\nFirst.\n\n${card}\n`, "the card on disk");

    await page.getByRole("button", { name: "Done" }).click();
    const shown = page.locator(".ld-card.ld-card-bristol.ld-card-width-half.ld-card-align-right");
    await shown.getByText("My recipe").waitFor();
    await shown.getByText("Card content").waitFor();
    assert.equal(page.url(), address);
  });

  test("a reopened Card: its options change, its content stays byte-identical", async () => {
    const source = "# A\n\n<!-- card: Old | style: deck -->\n\nInside *text*\n\n- a\n\n<!-- /card -->\n\nAfter.\n";
    const { page, host, disk } = await withProject({ "a.md": source });
    const address = page.url();
    await page.getByText("Inside").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit card" }).click();
    const dialog = edit(page);
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel("Title").inputValue(), "Old");
    assert.equal(await dialog.getByLabel("Style").locator("option:checked").innerText(), "Playing card");
    await dialog.getByLabel("Title").fill("New");
    await dialog.getByLabel("Style").selectOption({ label: "Plain" });
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await until(() => host.folders.read(disk, "a.md") === source.replace("<!-- card: Old | style: deck -->", "<!-- card: New -->"), "only the header changed");
    assert.equal(page.url(), address);
  });
});
