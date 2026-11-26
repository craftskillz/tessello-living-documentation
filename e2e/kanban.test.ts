// The Kanban board in the View: a Document with a Kanban block shows its text, then its columns of cards. Like every journey
// in the View, none may change the page address (the View is an about:srcdoc page in the Host).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import type { Page } from "playwright";
import { useBrowser, withProject } from "./living-documentation.ts";

useBrowser();

const block = '<div data-ld-kanban data-columns="To do|Doing|Done" data-colors="sky|amber|emerald"></div>';
const manifest = (...names: string[]) => `---\norder: [${names.join(", ")}]\nhidden: []\n---\n`;

const files = (): Record<string, string> => ({
  "projets/board.md": `# Project board\n\nIntro text.\n\n${block}\n`,
  "projets/To_do/liv-doc-main.md": manifest("b.md", "a.md"),
  "projets/To_do/a.md": "# Task A\n\nFirst task.\n\n## Content\n\nMore.",
  "projets/To_do/b.md": "# Task B\n\nSecond task.",
  "projets/To_do/c.md": "# Task C\n",
  "projets/Doing/d.md": "# Task D\n\nIn progress.",
  "other.md": "# Other\n\n[the task](projets/To_do/a.md)\n",
});

const openBoard = async (page: Page) => {
  await page.getByRole("link", { name: "board.md", exact: true }).click();
  await page.getByRole("heading", { name: "Project board" }).waitFor();
};
const column = (page: Page, label: string) => page.getByRole("list", { name: label, exact: true });
const cardsOf = async (page: Page, label: string) => column(page, label).getByRole("button").allInnerTexts();

describe("the board", () => {
  test("a board Document shows its text, then its columns with their cards", async () => {
    const { page, host, disk } = await withProject(files());
    const address = page.url();
    await openBoard(page);
    await column(page, "To do").waitFor();
    assert.ok(await page.getByText("Intro text.").isVisible());
    const intro = await page.getByText("Intro text.").boundingBox();
    const board = await column(page, "To do").boundingBox();
    assert.ok(board!.y > intro!.y, "the board is under the text");
    assert.equal(await page.locator(".ld-kanban").count(), 0, "no read-only preview");

    const labels = await page.locator(".board-label").allInnerTexts();
    assert.deepEqual(labels.map((each) => each.toLowerCase()), ["to do", "doing", "done"]);
    const card = (label: string, title: string) => column(page, label).getByRole("button", { name: new RegExp(title) });
    assert.deepEqual((await cardsOf(page, "To do")).map((each) => each.split("\n")[0]), ["Task B", "Task A", "Task C"]);
    assert.ok(await card("To do", "Task A").getByText("First task.").isVisible());
    assert.ok(await column(page, "Done").getByText("No cards").isVisible());
    assert.equal(await column(page, "Doing").getByRole("button").count(), 1);

    await until(() => host.folders.read(disk, "projets/Done/liv-doc-main.md") !== null);
    await page.getByRole("navigation", { name: "Documents" }).getByText("Done", { exact: true }).waitFor();
    assert.equal(page.url(), address);
  });

  test("a column whose folder cannot be created says why; the other columns load", async () => {
    const { page } = await withProject({
      "board.md": '# Root board\n\n<div data-ld-kanban data-columns="images|Doing"></div>\n',
      "Doing/d.md": "# Task D\n",
    });
    const address = page.url();
    await page.getByRole("link", { name: "board.md", exact: true }).click();
    await column(page, "Doing").getByRole("button", { name: "Task D" }).waitFor();
    const alert = page.getByRole("alert").filter({ hasText: "The folder of the column “images” could not be created." });
    await alert.waitFor();
    await alert.getByText("are reserved for pasted images", { exact: false }).waitFor();
    assert.equal(page.url(), address);
  });

  test("the header of a board has Favorite, Edit columns, Edit, Copy path and Delete only; a block in code makes no board", async () => {
    const { page } = await withProject({ ...files(), "code.md": `# Code\n\n\`\`\`html\n${block}\n\`\`\`\n` });
    const address = page.url();
    await openBoard(page);
    await column(page, "To do").waitFor();
    const header = page.locator("header.toolbar");
    for (const name of ["Favorite", "Edit columns", "Edit", "Copy path", "Delete"]) assert.equal(await header.getByRole("button", { name, exact: name === "Edit" }).count(), 1, name);
    for (const name of ["Lines", "White background", "Table of contents", "Marker", "View as HTML", "Generate as HTML"]) {
      assert.equal(await header.getByRole("button", { name }).count(), 0, name);
    }
    assert.equal(await header.getByRole("button").count(), 5);

    await page.getByRole("link", { name: "code.md", exact: true }).click();
    await page.locator("pre code").waitFor();
    assert.equal(await header.getByRole("button", { name: "Marker" }).count(), 1);
    assert.equal(await page.getByRole("list", { name: "To do" }).count(), 0);
    assert.equal(page.url(), address);
  });

  test("clicking a card opens its Document, and the back trail returns to the board", async () => {
    const { page } = await withProject(files());
    const address = page.url();
    await openBoard(page);
    await column(page, "To do").getByRole("button", { name: "Task A" }).click();
    await page.getByRole("heading", { name: "Task A" }).waitFor();
    assert.equal(await column(page, "To do").count(), 0);
    await page.getByRole("group", { name: "Back" }).getByRole("button", { name: /Project board/ }).click();
    await column(page, "To do").waitFor();
    assert.equal(page.url(), address);
  });

  const card = (page: Page, label: string, title: string) => column(page, label).getByRole("button", { name: title });
  const titles = async (page: Page, label: string) => (await cardsOf(page, label)).map((each) => each.split("\n")[0]);

  test("dragging a card onto the top edge of another in its column reorders the column", async () => {
    const { page, host, disk } = await withProject(files());
    const address = page.url();
    await openBoard(page);
    await column(page, "To do").waitFor();
    await card(page, "To do", "Task C").dragTo(card(page, "To do", "Task B"), { targetPosition: { x: 20, y: 2 } });
    await until(() => /order:\s*\n?\s*-?\s*\[?\s*c\.md/.test(host.folders.read(disk, "projets/To_do/liv-doc-main.md") ?? ""));
    await until(async () => (await titles(page, "To do")).join() === "Task C,Task B,Task A");
    assert.equal(page.url(), address);
  });

  test("dragging a card to another column moves its file to the end there and rewrites links to it", async () => {
    const { page, host, disk } = await withProject(files());
    const address = page.url();
    await openBoard(page);
    await column(page, "To do").waitFor();
    await card(page, "To do", "Task A").dragTo(column(page, "Doing"));
    await until(() => host.folders.read(disk, "projets/Doing/a.md") !== null);
    assert.equal(host.folders.read(disk, "projets/To_do/a.md"), null);
    assert.match(host.folders.read(disk, "other.md") ?? "", /projets\/Doing\/a\.md/);
    await until(async () => (await titles(page, "Doing")).join() === "Task D,Task A");
    assert.deepEqual(await titles(page, "To do"), ["Task B", "Task C"]);
    assert.equal(page.url(), address);
  });

  test("a name already in the target column blocks the move with a message", async () => {
    const { page, host, disk } = await withProject({ ...files(), "projets/Doing/a.md": "# Other A\n" });
    const address = page.url();
    await openBoard(page);
    await column(page, "To do").waitFor();
    await card(page, "To do", "Task A").dragTo(column(page, "Doing"));
    const toast = page.getByRole("status");
    await toast.waitFor();
    assert.match((await toast.textContent())!, /“a\.md” cannot move to Doing: a card with this name is already there\./);
    assert.ok(host.folders.read(disk, "projets/To_do/a.md") !== null);
    assert.equal(page.url(), address);
  });

  test("a card file an agent adds on disk shows on the board within the change check", async () => {
    const { page, host, disk } = await withProject(files());
    const address = page.url();
    await openBoard(page);
    await column(page, "To do").waitFor();
    host.folders.write(disk, "projets/Done/z.md", "# Task Z\n\nBy an agent.");
    await column(page, "Done").getByRole("button", { name: "Task Z" }).waitFor({ timeout: 12_000 });
    assert.ok(await column(page, "Done").getByText("By an agent.").isVisible());
    assert.equal(page.url(), address);
  });

  test("in French, an empty column and a collision are in French", async () => {
    const { page } = await withProject({ ...files(), "projets/Doing/a.md": "# Other A\n" }, { locale: "fr" });
    const address = page.url();
    await page.getByRole("link", { name: "board.md", exact: true }).click();
    await column(page, "To do").waitFor();
    assert.ok(await column(page, "Done").getByText("Aucune carte").isVisible());
    await card(page, "To do", "Task A").dragTo(column(page, "Doing"));
    const toast = page.getByRole("status");
    await toast.waitFor();
    assert.match((await toast.textContent())!, /« a\.md » ne peut pas aller dans Doing : une carte de ce nom s’y trouve déjà\./);
    assert.equal(page.url(), address);
  });

  const dialog = (page: Page) => page.getByRole("dialog", { name: "Edit columns" });
  const rowsOf = (page: Page) => dialog(page).getByRole("textbox", { name: "Column name" });
  const boardText = (host: { folders: { read: (disk: never, path: string) => string | null } }, disk: unknown) =>
    host.folders.read(disk as never, "projets/board.md") ?? "";

  test("Edit columns changes a color, renames a column (its folder follows) and adds one (its folder is created)", async () => {
    const { page, host, disk } = await withProject(files());
    const address = page.url();
    await openBoard(page);
    await column(page, "To do").waitFor();
    await page.locator("header.toolbar").getByRole("button", { name: "Edit columns" }).click();
    await dialog(page).waitFor();
    assert.deepEqual(await rowsOf(page).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)), ["To do", "Doing", "Done"]);
    assert.equal(await dialog(page).getByRole("combobox", { name: "Column color" }).first().inputValue(), "sky");

    await dialog(page).getByRole("combobox", { name: "Column color" }).nth(2).selectOption("violet");
    await rowsOf(page).nth(1).fill("En cours");
    await dialog(page).getByRole("button", { name: "Add column" }).click();
    await rowsOf(page).nth(3).fill("Archive");
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await dialog(page).waitFor({ state: "detached" });

    assert.match(boardText(host, disk), /data-columns="To do\|En cours\|Done\|Archive" data-colors="sky\|amber\|violet\|rose"/);
    assert.equal(host.folders.read(disk, "projets/Doing/d.md"), null);
    assert.notEqual(host.folders.read(disk, "projets/En_cours/d.md"), null);
    await until(() => host.folders.read(disk, "projets/Archive/liv-doc-main.md") !== null);
    await column(page, "En cours").getByRole("button", { name: "Task D" }).waitFor();
    await column(page, "Archive").waitFor();
    assert.equal(page.url(), address);
  });

  test("a column renamed in Edit columns rewrites the links to its cards", async () => {
    const { page, host, disk } = await withProject(files());
    const address = page.url();
    await openBoard(page);
    await column(page, "To do").waitFor();
    await page.locator("header.toolbar").getByRole("button", { name: "Edit columns" }).click();
    await rowsOf(page).nth(0).fill("Backlog");
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await dialog(page).waitFor({ state: "detached" });
    assert.match(host.folders.read(disk, "other.md") ?? "", /projets\/Backlog\/a\.md/);
    await column(page, "Backlog").getByRole("button", { name: "Task A" }).waitFor();
    assert.equal(page.url(), address);
  });

  const openEditColumns = async (page: Page) => {
    await openBoard(page);
    await column(page, "To do").waitFor();
    await page.locator("header.toolbar").getByRole("button", { name: "Edit columns" }).click();
    await dialog(page).waitFor();
  };

  test("two names for one folder are refused as typed: a message, Save disabled, nothing written", async () => {
    const { page, host, disk } = await withProject(files());
    const address = page.url();
    const before = boardText(host, disk);
    await openEditColumns(page);
    await rowsOf(page).nth(1).fill("Prêt");
    await rowsOf(page).nth(2).fill("Pret");
    const alert = dialog(page).getByRole("alert");
    assert.match((await alert.textContent())!, /“Prêt” and “Pret” would use the same folder “Pret”\./);
    assert.ok(await dialog(page).getByRole("button", { name: "Save" }).isDisabled());
    await rowsOf(page).nth(2).fill("???");
    assert.match((await alert.textContent())!, /“\?\?\?” has no folder name\./);
    assert.ok(await dialog(page).getByRole("button", { name: "Save" }).isDisabled());
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await dialog(page).waitFor({ state: "detached" });
    assert.equal(boardText(host, disk), before);
    assert.equal(host.folders.read(disk, "projets/Pret/liv-doc-main.md"), null);
    assert.equal(page.url(), address);
  });

  test("Remove column is disabled at one column, Add column at six", async () => {
    const { page } = await withProject(files());
    const address = page.url();
    await openEditColumns(page);
    const add = dialog(page).getByRole("button", { name: "Add column" });
    for (let i = 0; i < 3; i++) await add.click();
    assert.ok(await add.isDisabled());
    for (let i = 0; i < 5; i++) await dialog(page).getByRole("button", { name: "Remove column" }).first().click();
    assert.ok(await dialog(page).getByRole("button", { name: "Remove column" }).isDisabled());
    assert.equal(page.url(), address);
  });

  test("removing a column that holds cards offers to move them to another column", async () => {
    const { page, host, disk } = await withProject(files());
    const address = page.url();
    await openEditColumns(page);
    await dialog(page).getByRole("button", { name: "Remove column" }).first().click();
    await dialog(page).getByText("“To do” holds 3 cards").waitFor();
    await dialog(page).getByRole("combobox", { name: "Move them to" }).selectOption({ label: "Done" });
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await dialog(page).waitFor({ state: "detached" });
    for (const name of ["a", "b", "c"]) {
      assert.notEqual(host.folders.read(disk, `projets/Done/${name}.md`), null, name);
      assert.equal(host.folders.read(disk, `projets/To_do/${name}.md`), null, name);
    }
    assert.equal(host.folders.read(disk, "projets/To_do/liv-doc-main.md"), null);
    assert.match(host.folders.read(disk, "other.md") ?? "", /projets\/Done\/a\.md/);
    await until(async () => (await titles(page, "Done")).join() === "Task B,Task A,Task C");
    await column(page, "To do").waitFor({ state: "detached" });
    assert.equal(page.url(), address);
  });

  test("removing a column and keeping its folder leaves the folder and its cards on disk", async () => {
    const { page, host, disk } = await withProject(files());
    const address = page.url();
    await openEditColumns(page);
    await dialog(page).getByRole("button", { name: "Remove column" }).first().click();
    await dialog(page).getByRole("radio", { name: /Keep the folder “To_do”/ }).check();
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await dialog(page).waitFor({ state: "detached" });
    assert.doesNotMatch(boardText(host, disk), /To do/);
    for (const name of ["a", "b", "c"]) assert.notEqual(host.folders.read(disk, `projets/To_do/${name}.md`), null, name);
    await column(page, "To do").waitFor({ state: "detached" });
    assert.equal(page.url(), address);
  });

  test("a column renamed onto an existing folder says so and stays in the dialog; a board edited meanwhile reloads", async () => {
    const { page, host, disk } = await withProject({ ...files(), "projets/Archive/old.md": "# Old\n" });
    const address = page.url();
    await openEditColumns(page);
    await rowsOf(page).nth(2).fill("Archive");
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await dialog(page).getByText("a folder named “Archive” already exists", { exact: false }).waitFor();
    assert.ok(await dialog(page).isVisible());
    assert.match(boardText(host, disk), /To do\|Doing\|Done/);

    await rowsOf(page).nth(2).fill("Finished");
    host.folders.write(disk, "projets/board.md", `# Project board\n\nAgent edit.\n\n${block}\n`);
    await dialog(page).getByRole("button", { name: "Save" }).click();
    await page.getByText("The board changed on disk; it was reloaded. Edit the columns again.").waitFor();
    await dialog(page).waitFor({ state: "detached" });
    assert.match(boardText(host, disk), /Agent edit\./);
    assert.doesNotMatch(boardText(host, disk), /Finished/);
    assert.equal(page.url(), address);
  });

  const addCard = async (page: Page, label: string, name: string, template?: string) => {
    const form = column(page, label).locator("xpath=ancestor::div[contains(@class,'column')]");
    await form.getByRole("button", { name: "Add a card" }).click();
    await form.getByRole("textbox", { name: "Card name" }).fill(name);
    if (template) await form.getByRole("combobox", { name: "Template" }).selectOption({ label: template });
    return form;
  };

  test("a new card in a column is a file with a skeleton, shown last; the board stays open", async () => {
    const { page, host, disk } = await withProject(files());
    const address = page.url();
    await openBoard(page);
    await column(page, "Doing").waitFor();
    const form = column(page, "Doing").locator("xpath=ancestor::div[contains(@class,'column')]");
    await form.getByRole("button", { name: "Add a card" }).click();
    const name = form.getByRole("textbox", { name: "Card name" });
    assert.equal(await name.getAttribute("placeholder"), "Card name…");
    assert.ok(await form.getByRole("button", { name: "Create" }).isDisabled());
    await name.fill("My new task");
    await name.press("Enter");
    await until(() => host.folders.read(disk, "projets/Doing/My new task.md") !== null);
    const text = host.folders.read(disk, "projets/Doing/My new task.md")!;
    assert.match(text, /^---\ntimestamp: \d{4}-\d\d-\d\dT[^\n]*\n---\n# My new task\n\nHere is the description\n\n## Content\n\nHere is the Full Content\n$/);
    await until(async () => (await titles(page, "Doing")).join() === "Task D,My new task");
    assert.equal(await form.getByRole("textbox", { name: "Card name" }).count(), 0, "the form closed");
    await column(page, "Doing").waitFor();
    assert.equal(page.url(), address);
  });

  test("a new card from a template of the library copies it", async () => {
    const { page, host, disk } = await withProject({
      ...files(),
      ".templates/Cards/liv-doc-main.md": manifest("Bug.md"),
      ".templates/Cards/Bug.md": "# Bug\n\nSteps to reproduce.\n",
    });
    const address = page.url();
    await openBoard(page);
    await column(page, "To do").waitFor();
    const form = await addCard(page, "To do", "Crash on start", "Bug");
    const options = await form.getByRole("combobox", { name: "Template" }).locator("option").allInnerTexts();
    assert.equal(options[0], "No template");
    await form.getByRole("button", { name: "Create" }).click();
    await until(() => host.folders.read(disk, "projets/To_do/Crash on start.md") !== null);
    assert.match(host.folders.read(disk, "projets/To_do/Crash on start.md")!, /# Crash on start[\s\S]*Steps to reproduce\./);
    await until(async () => (await titles(page, "To do")).join() === "Task B,Task A,Task C,Crash on start");
    assert.equal(page.url(), address);
  });

  test("a card name already in the column shows a message in the form", async () => {
    const { page, host, disk } = await withProject(files());
    const address = page.url();
    await openBoard(page);
    await column(page, "To do").waitFor();
    const form = await addCard(page, "To do", "a");
    await form.getByRole("button", { name: "Create" }).click();
    await form.getByRole("alert").waitFor();
    assert.match((await form.getByRole("alert").textContent())!, /already|taken|exists/i);
    assert.equal(host.folders.read(disk, "projets/To_do/a.md"), "# Task A\n\nFirst task.\n\n## Content\n\nMore.");
    assert.equal(page.url(), address);
  });

  test("in French the card skeleton and the form are in French", async () => {
    const { page, host, disk } = await withProject(files(), { locale: "fr" });
    const address = page.url();
    await page.getByRole("link", { name: "board.md", exact: true }).click();
    await column(page, "Doing").waitFor();
    const form = column(page, "Doing").locator("xpath=ancestor::div[contains(@class,'column')]");
    await form.getByRole("button", { name: "Ajouter une carte" }).click();
    await form.getByRole("textbox", { name: "Nom de la carte" }).fill("Tâche");
    await form.getByRole("button", { name: "Créer" }).click();
    await until(() => host.folders.read(disk, "projets/Doing/Tâche.md") !== null);
    assert.match(host.folders.read(disk, "projets/Doing/Tâche.md")!, /# Tâche\n\nVoici la description\n\n## Contenu\n\nVoici le contenu complet\n$/);
    assert.equal(page.url(), address);
  });

  test("deleting a board says its folders and cards are kept, and removes only the Document", async () => {
    const { page, host, disk } = await withProject(files());
    const address = page.url();
    await openBoard(page);
    await column(page, "To do").waitFor();
    await page.locator("header.toolbar").getByRole("button", { name: "Delete", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: /Delete/ });
    await confirm.getByText("Delete the board “board.md”? Its column folders and their cards are kept.").waitFor();
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await until(() => host.folders.read(disk, "projets/board.md") === null);
    for (const path of ["projets/To_do/a.md", "projets/To_do/b.md", "projets/Doing/d.md"]) assert.notEqual(host.folders.read(disk, path), null, path);
    assert.equal(page.url(), address);
  });
});
