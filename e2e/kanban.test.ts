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

  test("the header of a board has Favorite, Edit, Copy path and Delete only; a block in code makes no board", async () => {
    const { page } = await withProject({ ...files(), "code.md": `# Code\n\n\`\`\`html\n${block}\n\`\`\`\n` });
    const address = page.url();
    await openBoard(page);
    await column(page, "To do").waitFor();
    const header = page.locator("header.toolbar");
    for (const name of ["Favorite", "Edit", "Copy path", "Delete"]) assert.equal(await header.getByRole("button", { name }).count(), 1, name);
    for (const name of ["Lines", "White background", "Table of contents", "Marker", "View as HTML", "Generate as HTML"]) {
      assert.equal(await header.getByRole("button", { name }).count(), 0, name);
    }
    assert.equal(await header.getByRole("button").count(), 4);

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
});
