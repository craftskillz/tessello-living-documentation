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
