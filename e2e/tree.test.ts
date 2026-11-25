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

const links = (page: Page) => page.getByRole("navigation", { name: "Documents" }).getByRole("link");
/** Chromium writes a narrow no-break space before AM/PM: compare with plain spaces. */
const plain = (text: string | null) => (text ?? "").replace(/\s/g, " ");

describe("creating a Document", () => {
  test("at the root: the file is written, listed in the Tree and opened", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n" });
    const address = page.url();

    await page.getByRole("button", { name: "New document" }).click();
    const dialog = page.getByRole("dialog", { name: "New document" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("My Guide");
    await dialog.getByText("Will be created at").waitFor();
    assert.equal(await dialog.locator("code").innerText(), "My Guide.md");
    await dialog.getByRole("button", { name: "Create" }).click();

    await page.getByRole("heading", { level: 1, name: "My Guide" }).waitFor();
    await dialog.waitFor({ state: "detached" });
    assert.deepEqual(await links(page).allInnerTexts(), ["a.md", "My Guide.md"]);
    const text = host.folders.read(disk, "My Guide.md") ?? "";
    assert.ok(text.startsWith("---\ntimestamp: "), text);
    assert.ok(text.endsWith("---\n# My Guide\n"), text);
    assert.equal(page.url(), address);
  });

  test("Enter in the Name creates it", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n" });
    await page.getByRole("button", { name: "New document" }).click();
    const name = page.getByRole("dialog", { name: "New document" }).getByRole("textbox", { name: "Name" });
    await name.fill("Quick");
    await name.press("Enter");
    await page.getByRole("heading", { level: 1, name: "Quick" }).waitFor();
    assert.ok(host.folders.read(disk, "Quick.md"));
  });

  test("Escape closes the dialog and writes nothing", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n" });
    await page.getByRole("button", { name: "New document" }).click();
    const dialog = page.getByRole("dialog", { name: "New document" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("Nope");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(host.folders.read(disk, "Nope.md"), null);
  });

  test("in the Folder of the open Document, which the Location starts on", async () => {
    const { page, host, disk } = await withProject({ "guide/intro.md": "# Intro\n", "guide/sub/deep.md": "# Deep\n", "zeta.md": "# Z\n" });
    await page.getByRole("link", { name: "intro.md" }).click();
    await page.getByRole("heading", { level: 1, name: "Intro" }).waitFor();

    await page.getByRole("button", { name: "New document" }).click();
    const dialog = page.getByRole("dialog", { name: "New document" });
    const location = dialog.getByRole("combobox", { name: "Location" });
    assert.deepEqual(await location.locator("option").allInnerTexts(), ["/ (root)", "/guide", "/guide/sub"]);
    assert.equal(await location.inputValue(), "guide");
    await dialog.getByRole("textbox", { name: "Name" }).fill("My Guide");
    assert.equal(await dialog.locator("code").innerText(), "guide/My Guide.md");
    await dialog.getByRole("button", { name: "Create" }).click();

    await page.getByRole("heading", { level: 1, name: "My Guide" }).waitFor();
    assert.ok(host.folders.read(disk, "guide/My Guide.md"));
  });
});

describe("a refused name", () => {
  test("a forbidden character shows its message and disables Create", async () => {
    const { page } = await withProject({ "a.md": "# A\n" });
    await page.getByRole("button", { name: "New document" }).click();
    const dialog = page.getByRole("dialog", { name: "New document" });
    const create = dialog.getByRole("button", { name: "Create" });
    assert.equal(await create.isDisabled(), true);
    assert.equal(await dialog.getByRole("alert").count(), 0);

    await dialog.getByRole("textbox", { name: "Name" }).fill("a/b");
    await dialog.getByRole("alert").getByText('A name cannot contain / \\ : * ? " < > |.').waitFor();
    assert.equal(await create.isDisabled(), true);
  });

  test("a name taken ignoring case is refused, and nothing is written", async () => {
    const { page, host, disk } = await withProject({ "Intro.md": "# Intro\n" });
    await page.getByRole("button", { name: "New document" }).click();
    const dialog = page.getByRole("dialog", { name: "New document" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("intro");
    await dialog.getByRole("alert").getByText("An entry with this name already exists in this folder", { exact: false }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Create" }).isDisabled(), true);
    assert.equal(host.folders.read(disk, "intro.md"), null);
  });

  test("a name taken by a hidden file is refused by the Project, in the dialog", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n", "liv-doc-main.md": "---\nhidden: [secret.md]\n---\n", "secret.md": "# S\n" });
    await page.getByRole("button", { name: "New document" }).click();
    const dialog = page.getByRole("dialog", { name: "New document" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("secret");
    await dialog.getByRole("button", { name: "Create" }).click();
    await dialog.getByRole("alert").getByText("An entry with this name already exists", { exact: false }).waitFor();
    assert.equal(host.folders.read(disk, "secret.md"), "# S\n");
  });

  test("the reserved name is refused", async () => {
    const { page } = await withProject({ "a.md": "# A\n" });
    await page.getByRole("button", { name: "New document" }).click();
    const dialog = page.getByRole("dialog", { name: "New document" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("liv-doc-main");
    await dialog.getByRole("alert").getByText("liv-doc-main.md is reserved for the Folder's order.").waitFor();
  });

  test("a name typed with .md is refused: .md is added for the User", async () => {
    const { page } = await withProject({ "a.md": "# A\n" });
    await page.getByRole("button", { name: "New document" }).click();
    const dialog = page.getByRole("dialog", { name: "New document" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("Notes.md");
    await dialog.getByRole("alert").getByText("Type the name without .md: it is added for you.").waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Create" }).isDisabled(), true);
  });
});

describe("a Folder's manifest", () => {
  test("a custom order gets the new Document appended", async () => {
    const { page, host, disk } = await withProject({ "guide/liv-doc-main.md": "---\norder: [b.md, a.md]\n---\n", "guide/a.md": "# A\n", "guide/b.md": "# B\n" });
    await page.getByRole("button", { name: "New document" }).click();
    const dialog = page.getByRole("dialog", { name: "New document" });
    await dialog.getByRole("combobox", { name: "Location" }).selectOption("guide");
    await dialog.getByRole("textbox", { name: "Name" }).fill("Fresh");
    await dialog.getByRole("button", { name: "Create" }).click();
    await page.getByRole("heading", { level: 1, name: "Fresh" }).waitFor();
    const manifest = host.folders.read(disk, "guide/liv-doc-main.md") ?? "";
    assert.match(manifest, /order:[\s\S]*b\.md[\s\S]*a\.md[\s\S]*Fresh\.md/);
  });

  test("an invalid manifest refuses the creation with a message, and nothing is written", async () => {
    const { page, host, disk } = await withProject({ "guide/liv-doc-main.md": "---\norder: [unclosed\n---\n", "guide/a.md": "# A\n" });
    await page.getByRole("button", { name: "New document" }).click();
    const dialog = page.getByRole("dialog", { name: "New document" });
    await dialog.getByRole("combobox", { name: "Location" }).selectOption("guide");
    await dialog.getByRole("textbox", { name: "Name" }).fill("Fresh");
    await dialog.getByRole("button", { name: "Create" }).click();
    await dialog.getByRole("alert").getByText("has an invalid frontmatter", { exact: false }).waitFor();
    assert.equal(host.folders.read(disk, "guide/Fresh.md"), null);
  });
});

describe("creating a Folder", () => {
  test("it shows in the Tree and holds its manifest on disk", async () => {
    const { page, host, disk } = await withProject({ "guide/intro.md": "# Intro\n" });
    const address = page.url();
    await page.getByRole("heading", { level: 1, name: "Intro" }).waitFor();

    await page.getByRole("button", { name: "New folder" }).click();
    const dialog = page.getByRole("dialog", { name: "New folder" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("My Folder");
    assert.equal(await dialog.locator("code").innerText(), "guide/My Folder");
    await dialog.getByRole("button", { name: "Create" }).click();

    await dialog.waitFor({ state: "detached" });
    await page.getByRole("navigation", { name: "Documents" }).getByText("My Folder", { exact: true }).waitFor();
    assert.ok(host.folders.read(disk, "guide/My Folder/liv-doc-main.md") !== undefined);
    assert.equal(page.url(), address);
  });
});

describe("in French", () => {
  test("the buttons and a refusal are in French", async () => {
    const { page } = await withProject({ "a.md": "# A\n" }, { locale: "fr" });
    await page.getByRole("button", { name: "Nouveau dossier" }).waitFor();
    await page.getByRole("button", { name: "Nouveau document" }).click();
    const dialog = page.getByRole("dialog", { name: "Nouveau document" });
    await dialog.getByRole("textbox", { name: "Nom" }).fill("a/b");
    await dialog.getByRole("alert").getByText("Un nom ne peut pas contenir").waitFor();
    await dialog.getByRole("button", { name: "Annuler" }).waitFor();
  });
});

describe("the Tree's dates", () => {
  test("a created date as written, a modified date for a Document without one", async () => {
    const { page, host, disk } = await withProject({ "a.md": "---\ntimestamp: 2026-03-04T14:30:00.000Z\n---\n# A\n" });
    host.folders.write(disk, "b.md", "# B\n", { modified: Date.UTC(2025, 0, 15, 12, 0) });
    await page.reload();
    await page.getByRole("link", { name: "b.md" }).waitFor();

    const created = page.getByTitle("Created");
    assert.equal(plain(await created.innerText()), "March 4, 2026 at 2:30 PM");
    const modified = page.getByTitle("Modified");
    assert.match(await modified.innerText(), /2025/);
    assert.deepEqual(await links(page).allInnerTexts(), ["a.md", "b.md"]);
  });
});

describe("clicking anywhere on a highlighted row", () => {
  test("the date under a Document's name opens it, and the space beside an other file's name opens its preview", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n", "b.md": "# Bee\n", "notes.txt": "hello" });
    const address = page.url();
    await page.getByRole("link", { name: "b.md" }).waitFor();

    await tree(page).locator('[data-entry="b.md"] .date').click();
    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();

    const row = tree(page).locator('[data-entry="notes.txt"]');
    const box = (await row.boundingBox())!;
    await page.mouse.click(box.x + box.width - 4, box.y + box.height - 3);
    await page.getByText("hello", { exact: true }).waitFor();
    assert.equal(page.url(), address);
  });
});

const tree = (page: Page) => page.getByRole("navigation", { name: "Documents" });
/** The Folder's row in the Tree (its summary). */
const folderRow = (page: Page, name: string) => tree(page).locator("summary", { hasText: name });

describe("renaming from the entry menu", () => {
  test("the open Document is renamed, stays open, and links to it are rewritten", async () => {
    const { page, host, disk } = await withProject({ "note.md": "# Note\n", "other.md": "# Other\n\n[note](./note.md#top)\n" });
    await page.getByRole("link", { name: "note.md" }).click();
    await page.getByRole("heading", { level: 1, name: "Note" }).waitFor();

    await page.getByRole("link", { name: "note.md" }).click({ button: "right" });
    const menu = page.getByRole("menu");
    assert.deepEqual(await menu.getByRole("menuitem").allInnerTexts(), ["Hide", "Rename", "Move to…", "Delete"]);
    await menu.getByRole("menuitem", { name: "Rename" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename document" });
    const field = dialog.getByRole("textbox", { name: "New name" });
    assert.equal(await field.inputValue(), "note");
    await dialog.getByText("Links from other documents are updated.").waitFor();
    await field.fill("memo");
    await field.press("Enter");

    await dialog.waitFor({ state: "detached" });
    await page.getByRole("link", { name: "memo.md" }).waitFor();
    assert.deepEqual(await links(page).allInnerTexts(), ["memo.md", "other.md"]);
    assert.equal(await page.getByRole("link", { name: "memo.md" }).getAttribute("aria-current"), "page");
    await page.getByRole("heading", { level: 1, name: "Note" }).waitFor();
    assert.equal(host.folders.read(disk, "note.md"), null);
    assert.equal(host.folders.read(disk, "other.md"), "# Other\n\n[note](./memo.md#top)\n");
  });

  test("Escape and a click elsewhere close the menu", async () => {
    const { page } = await withProject({ "a.md": "# A\n" });
    await page.getByRole("link", { name: "a.md" }).click({ button: "right" });
    await page.getByRole("menu").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "detached" });
    await page.getByRole("link", { name: "a.md" }).click({ button: "right" });
    await page.getByRole("menu").waitFor();
    await page.getByRole("heading", { level: 1, name: "A" }).click();
    await page.getByRole("menu").waitFor({ state: "detached" });
  });

  test("a Folder is renamed: its Documents are reachable at their new paths; Escape writes nothing", async () => {
    const { page, host, disk } = await withProject({ "guide/intro.md": "# Intro\n", "guide/sub/deep.md": "# Deep\n" });
    await page.getByRole("link", { name: "intro.md" }).click();
    await page.getByRole("heading", { level: 1, name: "Intro" }).waitFor();

    await folderRow(page, "guide").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename folder" });
    const field = dialog.getByRole("textbox", { name: "New name" });
    assert.equal(await field.inputValue(), "guide");
    assert.equal(await field.evaluate((input: HTMLInputElement) => input.selectionStart === 0 && input.selectionEnd === input.value.length), true);
    await field.fill("manual");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.ok(host.folders.read(disk, "guide/intro.md"));
    assert.equal(host.folders.read(disk, "manual/intro.md"), null);

    await folderRow(page, "guide").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await field.fill("manual");
    await field.press("Enter");
    await dialog.waitFor({ state: "detached" });
    await folderRow(page, "manual").first().waitFor();
    assert.ok(host.folders.read(disk, "manual/sub/deep.md"));
    assert.equal(await page.getByRole("link", { name: "intro.md" }).getAttribute("aria-current"), "page");
    await page.getByRole("link", { name: "deep.md" }).click();
    await page.getByRole("heading", { level: 1, name: "Deep" }).waitFor();
  });

  test("a name taken ignoring case is refused live, and Rename is disabled", async () => {
    const { page, host, disk } = await withProject({ "Intro.md": "# Intro\n", "other.md": "# Other\n" });
    await page.getByRole("link", { name: "other.md" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename document" });
    await dialog.getByRole("textbox", { name: "New name" }).fill("intro");
    await dialog.getByRole("alert").getByText("An entry with this name already exists", { exact: false }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Rename" }).isDisabled(), true);
    assert.ok(host.folders.read(disk, "other.md"));
  });

  test("an unchanged name just closes", async () => {
    const { page } = await withProject({ "a.md": "# A\n" });
    await page.getByRole("link", { name: "a.md" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename document" });
    await dialog.getByRole("textbox", { name: "New name" }).press("Enter");
    await dialog.waitFor({ state: "detached" });
  });

  test("the menu and the dialog are in French", async () => {
    const { page } = await withProject({ "Intro.md": "# Intro\n", "other.md": "# Other\n" }, { locale: "fr" });
    await page.getByRole("link", { name: "other.md" }).click({ button: "right" });
    assert.deepEqual(await page.getByRole("menu").getByRole("menuitem").allInnerTexts(), ["Masquer", "Renommer", "Déplacer vers…", "Supprimer"]);
    await page.getByRole("menuitem", { name: "Renommer" }).click();
    const dialog = page.getByRole("dialog", { name: "Renommer le document" });
    await dialog.getByRole("textbox", { name: "Nouveau nom" }).fill("intro");
    await dialog.getByText("Les liens depuis les autres documents sont mis à jour.").waitFor();
    await dialog.getByRole("alert").getByText("Une entrée de ce nom existe déjà").waitFor();
    await dialog.getByRole("button", { name: "Annuler" }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Renommer" }).isDisabled(), true);
  });
});

describe("moving from the entry menu", () => {
  test("a Document goes into a Folder: file moved, its links adjusted, appended to the custom order, Folder open", async () => {
    const { page, host, disk } = await withProject({
      "note.md": "# Note\n\n[other](./other.md)\n",
      "other.md": "# Other\n",
      "guide/liv-doc-main.md": "---\norder: [a.md]\n---\n",
      "guide/a.md": "# A\n",
      "zeta/z.md": "# Z\n",
    });
    await page.getByRole("link", { name: "note.md" }).click();
    await page.getByRole("heading", { level: 1, name: "Note" }).waitFor();

    await page.getByRole("link", { name: "note.md" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to…" }).click();
    const dialog = page.getByRole("dialog", { name: "Move document" });
    const destination = dialog.getByRole("combobox", { name: "Destination" });
    assert.deepEqual(await destination.locator("option").allInnerTexts(), ["/guide", "/zeta"]);
    await destination.selectOption("guide");
    await dialog.getByText("Will be moved to").waitFor();
    assert.equal(await dialog.locator("code").innerText(), "guide/note.md");
    await dialog.getByRole("button", { name: "Move" }).click();

    await dialog.waitFor({ state: "detached" });
    await page.getByRole("heading", { level: 1, name: "Note" }).waitFor();
    assert.equal(host.folders.read(disk, "note.md"), null);
    assert.equal(host.folders.read(disk, "guide/note.md"), "# Note\n\n[other](../other.md)\n");
    assert.match(host.folders.read(disk, "guide/liv-doc-main.md") ?? "", /order:[\s\S]*a\.md[\s\S]*note\.md/);
    assert.equal(await page.getByRole("link", { name: "note.md" }).getAttribute("aria-current"), "page");
  });

  test("a name taken in the destination is refused live", async () => {
    const { page, host, disk } = await withProject({ "note.md": "# Note\n", "guide/Note.md": "# Other\n" });
    await page.getByRole("link", { name: "note.md", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to…" }).click();
    const dialog = page.getByRole("dialog", { name: "Move document" });
    await dialog.getByRole("alert").getByText("An entry with this name already exists", { exact: false }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Move" }).isDisabled(), true);
    assert.ok(host.folders.read(disk, "note.md"));
  });

  test("a Folder cannot be moved into itself or its descendants, nor into its own Folder", async () => {
    const { page } = await withProject({ "a/b/c/x.md": "# X\n", "a/b/y.md": "# Y\n", "d/z.md": "# Z\n" });
    await folderRow(page, "b").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to…" }).click();
    const dialog = page.getByRole("dialog", { name: "Move folder" });
    assert.deepEqual(await dialog.getByRole("combobox", { name: "Destination" }).locator("option").allInnerTexts(), ["/ (root)", "/d"]);
  });
});

describe("the entry menu from the keyboard", () => {
  test("Shift+F10 on a focused Document opens it", async () => {
    const { page } = await withProject({ "a.md": "# A\n" });
    await page.getByRole("link", { name: "a.md" }).focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menu").getByRole("menuitem", { name: "Rename" }).waitFor();
  });
});

const row = (page: Page, path: string) => page.locator(`[data-entry="${path}"]`);

describe("drag and drop", () => {
  test("a Document dropped on the top edge of another goes before it; dropping it back where it is writes nothing", async () => {
    const { page, host, disk } = await withProject({
      "liv-doc-main.md": "---\norder: [a.md, b.md, c.md]\n---\n",
      "a.md": "# A\n",
      "b.md": "# B\n",
      "c.md": "# C\n",
    });
    await page.getByRole("link", { name: "a.md" }).waitFor();

    await row(page, "c.md").dragTo(row(page, "a.md"), { targetPosition: { x: 20, y: 2 } });
    await until(() => /order:\s*\n?\s*-?\s*\[?\s*c\.md/.test(host.folders.read(disk, "liv-doc-main.md") ?? ""));
    assert.deepEqual(await links(page).allInnerTexts(), ["c.md", "a.md", "b.md"]);

    const manifest = host.folders.read(disk, "liv-doc-main.md");
    await row(page, "c.md").dragTo(row(page, "a.md"), { targetPosition: { x: 20, y: 2 } });
    await page.getByRole("status").waitFor({ state: "detached" });
    assert.equal(host.folders.read(disk, "liv-doc-main.md"), manifest);
    assert.deepEqual(await links(page).allInnerTexts(), ["c.md", "a.md", "b.md"]);
  });

  test("a line shows where the drop would land while dragging", async () => {
    const { page } = await withProject({ "a.md": "# A\n", "b.md": "# B\n" });
    await row(page, "a.md").hover();
    await page.mouse.down();
    await row(page, "b.md").hover({ position: { x: 20, y: 2 } });
    await row(page, "b.md").hover({ position: { x: 21, y: 3 } });
    await page.locator('.row.before[data-entry="b.md"]').waitFor();
    await page.mouse.up();
    await page.locator(".row.before").waitFor({ state: "detached" });
  });

  test("a Document dropped in the middle of a closed Folder: it opens after the hover delay and the file moves inside", async () => {
    const { page, host, disk } = await withProject({ "doc.md": "# Doc\n", "guide/x.md": "# X\n" });
    await page.getByRole("link", { name: "doc.md" }).click();
    await page.getByRole("heading", { level: 1, name: "Doc" }).waitFor();
    await folderRow(page, "guide").click();
    await page.getByRole("link", { name: "x.md" }).waitFor({ state: "hidden" });

    await row(page, "doc.md").hover();
    await page.mouse.down();
    const box = (await row(page, "guide").boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 5 });
    await page.mouse.move(box.x + 21, box.y + box.height / 2);
    await page.getByRole("link", { name: "x.md" }).waitFor({ state: "visible" });
    await page.mouse.up();

    await until(() => host.folders.read(disk, "guide/doc.md") !== null);
    assert.equal(host.folders.read(disk, "doc.md"), null);
    await page.getByRole("heading", { level: 1, name: "Doc" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "doc.md" }).getAttribute("aria-current"), "page");
    // The Tree is reloaded after the move and passes through another order on the way: the final one must hold.
    await until(async () => {
      const shown = (await links(page).allInnerTexts()).join();
      await page.waitForTimeout(400);
      return shown === "doc.md,x.md" && (await links(page).allInnerTexts()).join() === shown;
    }, "the Tree after the move");
  });

  test("a Folder dropped into its own sub-folder: nothing moves, Could not move with the reason", async () => {
    const { page, host, disk } = await withProject({ "a/b/x.md": "# X\n" });
    await row(page, "a/b").waitFor();
    await row(page, "a").dragTo(row(page, "a/b"));
    const toast = page.getByRole("status");
    await toast.getByText("Could not move “a”.").waitFor();
    await toast.getByText("A folder cannot be moved into itself", { exact: false }).waitFor();
    assert.ok(host.folders.read(disk, "a/b/x.md"));
  });

  test("a drop onto a Folder holding an entry of the same name shows Could not move, with the reason", async () => {
    const { page, host, disk } = await withProject({ "x.md": "# X root\n", "guide/x.md": "# X guide\n" });
    await row(page, "x.md").dragTo(row(page, "guide"));
    const toast = page.getByRole("status");
    await toast.getByText("Could not move “x.md”.").waitFor();
    await toast.getByText("An entry with this name already exists", { exact: false }).waitFor();
    assert.equal(host.folders.read(disk, "x.md"), "# X root\n");
  });
});

const showHidden = (page: Page, locale: "en" | "fr" = "en") =>
  page.getByRole("button", { name: locale === "en" ? "Show hidden items" : "Afficher les éléments masqués" });
const SECRET = "---\nhidden: [secret.md]\n---\n";

describe("Show hidden items", () => {
  test("reveals a hidden Document, the manifest (locked) and other files; it is remembered after reopening the View", async () => {
    const { page } = await withProject({ "a.md": "# A\n", "secret.md": "# Secret\n", "liv-doc-main.md": SECRET, "notes.txt": "hello" });
    await page.getByRole("heading", { level: 1, name: "A" }).waitFor();
    assert.deepEqual(await links(page).allInnerTexts(), ["a.md", "notes.txt"]);
    assert.equal(await showHidden(page).getAttribute("aria-pressed"), "false");

    await showHidden(page).click();
    await page.getByRole("link", { name: "secret.md" }).waitFor();
    assert.deepEqual(await links(page).allInnerTexts(), ["liv-doc-main.md", "a.md", "secret.md", "notes.txt"]);
    assert.equal(await showHidden(page).getAttribute("aria-pressed"), "true");
    assert.match(await row(page, "liv-doc-main.md").innerText(), /🔒/);
    assert.equal(await row(page, "liv-doc-main.md").getAttribute("draggable"), null);
    assert.equal(await row(page, "notes.txt").getAttribute("draggable"), null);
    assert.equal(await row(page, "secret.md").evaluate((each) => getComputedStyle(each).fontStyle), "italic");

    await page.reload();
    await page.getByRole("link", { name: "notes.txt" }).waitFor();
    assert.equal(await showHidden(page).getAttribute("aria-pressed"), "true");
  });

  test("the manifest opens read-only; a click or a right click on it or on a file offers no menu", async () => {
    const { page } = await withProject({ "a.md": "# A\n", "liv-doc-main.md": SECRET, "notes.txt": "hello" });
    await showHidden(page).click();
    await page.getByRole("link", { name: "liv-doc-main.md" }).click();
    await page.getByText("Read-only", { exact: true }).waitFor();
    await page.getByRole("link", { name: "liv-doc-main.md" }).click({ button: "right" });
    await page.getByRole("link", { name: "notes.txt" }).click({ button: "right" });
    assert.equal(await page.getByRole("menu").count(), 0);
  });

  test("the button is named in French", async () => {
    const { page } = await withProject({ "a.md": "# A\n" }, { locale: "fr" });
    await showHidden(page, "fr").waitFor();
  });
});

describe("Hide and Show from the entry menu", () => {
  test("Hide removes the entry and writes the manifest's hidden list; Show brings it back", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n", "b.md": "# B\n" });
    await page.getByRole("link", { name: "b.md" }).click({ button: "right" });
    assert.deepEqual(await page.getByRole("menu").getByRole("menuitem").allInnerTexts(), ["Hide", "Rename", "Move to…", "Delete"]);
    await page.getByRole("menuitem", { name: "Hide" }).click();
    await page.getByRole("link", { name: "b.md" }).waitFor({ state: "detached" });
    assert.match(host.folders.read(disk, "liv-doc-main.md") ?? "", /hidden:[\s\S]*b\.md/);
    assert.equal(host.folders.read(disk, "b.md"), "# B\n");

    await showHidden(page).click();
    await page.getByRole("link", { name: "b.md" }).click({ button: "right" });
    assert.deepEqual(await page.getByRole("menu").getByRole("menuitem").allInnerTexts(), ["Show", "Rename", "Move to…", "Delete"]);
    await page.getByRole("menuitem", { name: "Show" }).click();
    await until(() => !/b\.md/.test(host.folders.read(disk, "liv-doc-main.md") ?? ""));
    await showHidden(page).click();
    await page.getByRole("link", { name: "b.md" }).waitFor();
  });

  test("a refused Hide says so, with the reason", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n", "liv-doc-main.md": "---\norder: [unclosed\n---\n" });
    await page.getByRole("link", { name: "a.md" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Hide" }).click();
    const toast = page.getByRole("status");
    await toast.getByText("Could not hide “a.md”.").waitFor();
    await toast.getByText("has an invalid frontmatter", { exact: false }).waitFor();
    assert.equal(host.folders.read(disk, "liv-doc-main.md"), "---\norder: [unclosed\n---\n");
  });

  test("a reserved images folder offers only Hide, and is not a Location nor a Destination", async () => {
    const { page } = await withProject({ "a.md": "# A\n", "guide/g.md": "# G\n", "images/p.png": "x" });
    await showHidden(page).click();
    await folderRow(page, "images").first().click({ button: "right" });
    assert.deepEqual(await page.getByRole("menu").getByRole("menuitem").allInnerTexts(), ["Hide"]);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "New folder" }).click();
    const dialog = page.getByRole("dialog", { name: "New folder" });
    assert.deepEqual(await dialog.getByRole("combobox", { name: "Location" }).locator("option").allInnerTexts(), ["/ (root)", "/guide"]);
    await dialog.getByRole("combobox", { name: "Location" }).selectOption("");
    await dialog.getByRole("textbox", { name: "Name" }).fill("images");
    await dialog.getByRole("alert").getByText("reserved", { exact: false }).waitFor();
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: "a.md" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to…" }).click();
    const move = page.getByRole("dialog", { name: "Move document" });
    assert.deepEqual(await move.getByRole("combobox", { name: "Destination" }).locator("option").allInnerTexts(), ["/guide"]);
  });
});

describe("deleting", () => {
  const confirmation = (page: Page, title: string) => page.getByRole("dialog", { name: title });

  test("the open Document from the header: the dialog counts the links, the file goes, the link becomes text, the next Document opens", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nsee [b](./b.md)\n", "b.md": "# B\n", "c.md": "# C\n" });
    await page.getByRole("link", { name: "b.md" }).click();
    await page.getByRole("heading", { level: 1, name: "B" }).waitFor();

    await page.getByRole("button", { name: "Delete" }).click();
    const dialog = confirmation(page, "Delete document");
    await dialog.getByText("Permanently delete “b.md”?").waitFor();
    await dialog.getByText("1 document links to it: that link will become plain text.").waitFor();
    await dialog.getByText("This action cannot be undone.").waitFor();
    await dialog.getByRole("button", { name: "Delete" }).click();

    await dialog.waitFor({ state: "detached" });
    await page.getByRole("heading", { level: 1, name: "C" }).waitFor();
    assert.equal(host.folders.read(disk, "b.md"), null);
    assert.doesNotMatch(host.folders.read(disk, "a.md") ?? "", /b\.md/);
    assert.deepEqual(await links(page).allInnerTexts(), ["a.md", "c.md"]);
  });

  test("the last Document of the Tree: the one before opens; the only one left: a hint to choose", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n", "b.md": "# B\n" });
    await page.getByRole("link", { name: "b.md" }).click();
    await page.getByRole("heading", { level: 1, name: "B" }).waitFor();
    await page.getByRole("button", { name: "Delete" }).click();
    await confirmation(page, "Delete document").getByText("Permanently delete “b.md”?").waitFor();
    await confirmation(page, "Delete document").getByRole("button", { name: "Delete" }).click();
    await page.getByRole("heading", { level: 1, name: "A" }).waitFor();

    await page.getByRole("button", { name: "Delete" }).click();
    await confirmation(page, "Delete document").getByRole("button", { name: "Delete" }).click();
    await page.getByText("Choose a document in the Tree.").waitFor();
    assert.equal(host.folders.read(disk, "a.md"), null);
  });

  test("a Folder from the Tree menu: counts by kind, everything goes, links into it become text", async () => {
    const { page, host, disk } = await withProject({
      "a.md": "# A\n\n[x](./guide/x.md)\n",
      "guide/x.md": "# X\n",
      "guide/y.md": "# Y\n",
      "guide/p.png": "png",
      "guide/n.txt": "text",
    });
    await page.getByRole("heading", { level: 1, name: "X" }).waitFor();
    await folderRow(page, "guide").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = confirmation(page, "Delete folder");
    await dialog.getByText("Permanently delete the folder “guide” and everything it contains?").waitFor();
    await dialog.getByText("It holds 2 documents, 1 image, 1 other file.").waitFor();
    await dialog.getByText("1 document links into it: that link will become plain text.").waitFor();
    await dialog.getByRole("button", { name: "Delete" }).click();

    await dialog.waitFor({ state: "detached" });
    await page.getByRole("heading", { level: 1, name: "A" }).waitFor();
    for (const file of ["guide/x.md", "guide/y.md", "guide/p.png", "guide/n.txt"]) assert.equal(host.folders.read(disk, file), null, file);
    assert.doesNotMatch(host.folders.read(disk, "a.md") ?? "", /guide/);
    assert.equal(await folderRow(page, "guide").count(), 0);
  });

  test("Cancel and Escape write nothing", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n", "b.md": "# B\n" });
    await page.getByRole("link", { name: "b.md" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = confirmation(page, "Delete document");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "detached" });

    await page.getByRole("link", { name: "b.md" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(host.folders.read(disk, "b.md"), "# B\n");
    assert.deepEqual(await links(page).allInnerTexts(), ["a.md", "b.md"]);
  });

  test("a hidden Document can be deleted without being shown first", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n", "secret.md": "# S\n", "liv-doc-main.md": SECRET });
    await showHidden(page).click();
    await page.getByRole("link", { name: "secret.md" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await confirmation(page, "Delete document").getByRole("button", { name: "Delete" }).click();
    await page.getByRole("link", { name: "secret.md" }).waitFor({ state: "detached" });
    assert.equal(host.folders.read(disk, "secret.md"), null);
  });

  test("an empty Folder says so; the dialog is in French", async () => {
    const { page } = await withProject({ "a.md": "# A\n", "vide/liv-doc-main.md": "---\n---\n" }, { locale: "fr" });
    await showHidden(page, "fr").click();
    await folderRow(page, "vide").first().click({ button: "right" });
    assert.deepEqual(await page.getByRole("menu").getByRole("menuitem").allInnerTexts(), ["Masquer", "Renommer", "Déplacer vers…", "Supprimer"]);
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    const dialog = confirmation(page, "Supprimer le dossier");
    await dialog.getByText("Supprimer définitivement le dossier « vide » et tout son contenu ?").waitFor();
    await dialog.getByText("Il est vide.").waitFor();
    await dialog.getByText("Cette action est irréversible.").waitFor();
    await dialog.getByRole("button", { name: "Annuler" }).click();

    await page.getByRole("link", { name: "a.md" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    await confirmation(page, "Supprimer le document").getByText("Supprimer définitivement « a.md » ?").waitFor();
  });
});

describe("other files", () => {
  const panel = (page: Page, name: string) => page.getByRole("heading", { level: 2, name });

  test("a text file is shown in place of the Document; opening a Document closes it", async () => {
    const { page } = await withProject({ "a.md": "# A\n", "notes.txt": "hello\nworld" });
    await showHidden(page).click();
    await page.getByRole("link", { name: "notes.txt" }).click();
    await panel(page, "notes.txt").waitFor();
    assert.equal(await page.locator("pre").innerText(), "hello\nworld");
    assert.equal(await page.getByRole("heading", { level: 1, name: "A" }).count(), 0);
    assert.equal(await page.getByText("Truncated", { exact: false }).count(), 0);

    await page.getByRole("link", { name: "a.md" }).click();
    await page.getByRole("heading", { level: 1, name: "A" }).waitFor();
    assert.equal(await panel(page, "notes.txt").count(), 0);
  });

  test("a text over 1 MB is cut and says so", async () => {
    const { page } = await withProject({ "a.md": "# A\n", "big.txt": "a".repeat(1024 * 1024 + 10) });
    await showHidden(page).click();
    await page.getByRole("link", { name: "big.txt" }).click();
    await page.getByText("⚠ Truncated at 1 MB").waitFor();
    assert.equal((await page.locator("pre").innerText()).length, 1024 * 1024);
  });

  test("a binary file offers Download, which saves it under its name", async () => {
    const { page } = await withProject({ "a.md": "# A\n", "data.bin": new Uint8Array([0, 1, 2, 3]) });
    await showHidden(page).click();
    await page.getByRole("link", { name: "data.bin" }).click();
    await page.getByText("This file cannot be shown here.").waitFor();
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download" }).click();
    assert.equal((await downloading).suggestedFilename(), "data.bin");
    assert.equal(await page.locator("a[href]").count(), 0);
  });

  test("an image is previewed from a blob; turning Show hidden items off closes the panel", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="red"/></svg>';
    const { page } = await withProject({ "a.md": "# A\n", "node_modules/pic.svg": svg });
    await showHidden(page).click();
    await page.getByRole("link", { name: "pic.svg" }).click();
    const image = page.getByRole("img", { name: "pic.svg" });
    await image.waitFor();
    assert.match((await image.getAttribute("src")) ?? "", /^blob:/);
    await until(async () => (await image.evaluate((each: HTMLImageElement) => each.naturalWidth)) === 20);

    await showHidden(page).click();
    await image.waitFor({ state: "detached" });
    await page.getByRole("heading", { level: 1, name: "A" }).waitFor();
  });
});

describe("the Tree's look and labels", () => {
  const nav = (page: Page) => page.getByRole("navigation", { name: "Documents" });
  const settings = (page: Page, name = "Display settings") => page.getByRole("button", { name });

  test("the open Document's row stands out; another row does not", async () => {
    const { page } = await withProject({ "a.md": "# A\n", "b.md": "# B\n" });
    await page.getByRole("heading", { level: 1, name: "A" }).waitFor();
    const open = row(page, "a.md");
    const other = row(page, "b.md");
    assert.equal(await open.getByRole("link").getAttribute("aria-current"), "page");
    assert.equal(await other.getByRole("link").getAttribute("aria-current"), null);
    const look = (locator: ReturnType<typeof row>) =>
      locator.evaluate((element) => ({
        background: getComputedStyle(element).backgroundColor,
        weight: Number(getComputedStyle(element.querySelector(".label")!).fontWeight),
      }));
    const mine = await look(open);
    const theirs = await look(other);
    assert.notEqual(mine.background, "rgba(0, 0, 0, 0)");
    assert.ok(mine.weight >= 600, `weight ${mine.weight}`);
    assert.equal(theirs.background, "rgba(0, 0, 0, 0)");
    assert.ok(theirs.weight < 600);
  });

  test("a Document opened from a link is scrolled into view in the Tree, even in a closed Folder", async () => {
    const files: Record<string, string> = { "doc-00.md": "# D0\n\n[go](doc-59.md)\n" };
    for (let index = 1; index < 60; index++) files[`doc-${String(index).padStart(2, "0")}.md`] = `# D${index}\n`;
    files["deep/zz/last.md"] = "# Last\n";
    files["doc-01.md"] = "# D1\n\n[deep](deep/zz/last.md)\n";
    const { page } = await withProject(files);
    // The first Document of the Tree opens first.
    await page.getByRole("heading", { level: 1, name: "Last" }).waitFor();
    await row(page, "doc-00.md").getByRole("link").click();
    await page.getByRole("heading", { level: 1, name: "D0" }).waitFor();

    const visible = async (path: string) =>
      page.evaluate((entry) => {
        const box = document.querySelector(`[data-entry="${entry}"] [role="link"], [data-entry="${entry}"] a`)!.getBoundingClientRect();
        const view = document.querySelector("nav")!.getBoundingClientRect();
        return box.top >= view.top - 1 && box.bottom <= view.bottom + 1;
      }, path);
    assert.equal(await visible("doc-59.md"), false);

    await page.locator("article").getByRole("link", { name: "go" }).click();
    await page.getByRole("heading", { level: 1, name: "D59" }).waitFor();
    await until(() => visible("doc-59.md"));

    // The Folders around a Document opened by a link are opened first.
    await row(page, "deep/zz").click();
    await row(page, "deep").click();
    assert.equal(await row(page, "deep/zz/last.md").count() === 1 && !(await row(page, "deep/zz/last.md").isVisible()), true);
    await page.getByRole("link", { name: "doc-01.md" }).click();
    await page.getByRole("heading", { level: 1, name: "D1" }).waitFor();
    await page.locator("article").getByRole("link", { name: "deep" }).click();
    await page.getByRole("heading", { level: 1, name: "Last" }).waitFor();
    await row(page, "deep/zz/last.md").waitFor({ state: "visible" });
    await until(() => visible("deep/zz/last.md"));
  });

  test("the cog shows titles in the Tree, the file name as tooltip; kept after a reload", async () => {
    const { page } = await withProject({ "a.md": "# Alpha Guide\n", "dir/b.md": "---\ntitle: Beta Title\n---\n# Other\n" });
    await row(page, "a.md").getByRole("link").click();
    await page.getByRole("heading", { level: 1, name: "Alpha Guide" }).waitFor();
    assert.ok((await links(page).allInnerTexts()).includes("a.md"));

    await settings(page).click();
    assert.equal(await settings(page).getAttribute("aria-expanded"), "true");
    const panel = page.getByRole("dialog", { name: "Display settings" });
    await panel.getByRole("radio", { name: "Titles" }).check();
    await until(async () => (await links(page).allInnerTexts()).includes("Alpha Guide"));
    const texts = await links(page).allInnerTexts();
    assert.ok(texts.includes("Beta Title"), texts.join("|"));
    assert.equal(await row(page, "a.md").getAttribute("title"), "a.md");
    assert.equal(await row(page, "dir/b.md").getAttribute("title"), "b.md");
    // Folders keep their names.
    assert.equal(await row(page, "dir").innerText(), "dir");

    await page.reload();
    await page.getByRole("navigation", { name: "Documents" }).waitFor();
    await until(async () => (await links(page).allInnerTexts()).includes("Alpha Guide"));
    await page.getByRole("heading", { level: 1, name: "Alpha Guide" }).waitFor();
    await settings(page).click();
    assert.equal(await page.getByRole("radio", { name: "Titles" }).isChecked(), true);
    await page.getByRole("radio", { name: "File names" }).check();
    await until(async () => (await links(page).allInnerTexts()).includes("a.md"));
  });

  test("the label filter rewrites Documents and Folders, keeps the full name as tooltip, and is kept per Project", async () => {
    const { page, host } = await withProject({
      "2026_04_11_13_25_crer_vos_dossiers.md": "# Créer\n",
      "2026_01_02_03_04_guides/inside.md": "# Inside\n",
    });
    await row(page, "2026_04_11_13_25_crer_vos_dossiers.md").getByRole("link").click();
    await page.getByRole("heading", { level: 1, name: "Créer" }).waitFor();
    await settings(page).click();
    const panel = page.getByRole("dialog", { name: "Display settings" });
    await panel.getByRole("textbox", { name: "Pattern" }).fill("^\\d{4}(_\\d{2}){4}_");

    await until(async () => (await links(page).allInnerTexts()).includes("crer_vos_dossiers.md"));
    assert.equal(await row(page, "2026_04_11_13_25_crer_vos_dossiers.md").getAttribute("title"), "2026_04_11_13_25_crer_vos_dossiers.md");
    assert.equal(await row(page, "2026_01_02_03_04_guides").innerText(), "guides");
    assert.equal(await row(page, "2026_01_02_03_04_guides").getAttribute("title"), "2026_01_02_03_04_guides");

    // Never reload in the middle of a save.
    await until(async () => JSON.stringify(await host.storage.get("labelFilters")).includes("d{4}"));
    await page.reload();
    await page.getByRole("navigation", { name: "Documents" }).waitFor();
    await until(async () => (await links(page).allInnerTexts()).includes("crer_vos_dossiers.md"));
    await page.getByRole("heading", { level: 1, name: "Créer" }).waitFor();
    await settings(page).click();
    assert.equal(await page.getByRole("textbox", { name: "Pattern" }).inputValue(), "^\\d{4}(_\\d{2}){4}_");
  });

  test("an invalid pattern shows a message and changes nothing", async () => {
    const { page } = await withProject({ "a.md": "# A\n", "b.md": "# B\n" });
    await page.getByRole("heading", { level: 1, name: "A" }).waitFor();
    await settings(page).click();
    const pattern = page.getByRole("dialog", { name: "Display settings" }).getByRole("textbox", { name: "Pattern" });
    await pattern.fill("(");
    const message = page.getByText("This pattern is not a valid regular expression.");
    await message.waitFor();
    assert.equal(await pattern.getAttribute("aria-invalid"), "true");
    assert.ok((await pattern.getAttribute("aria-describedby")) !== null);
    assert.deepEqual(await links(page).allInnerTexts(), ["a.md", "b.md"]);
    await pattern.fill("\\.md$");
    await message.waitFor({ state: "detached" });
    assert.deepEqual(await links(page).allInnerTexts(), ["a", "b"]);
  });

  test("Escape closes the panel and gives the focus back to the cog", async () => {
    const { page } = await withProject({ "a.md": "# A\n" });
    await page.getByRole("heading", { level: 1, name: "A" }).waitFor();
    await settings(page).click();
    const panel = page.getByRole("dialog", { name: "Display settings" });
    await panel.waitFor();
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached" });
    assert.equal(await settings(page).evaluate((element) => element === document.activeElement), true);
  });

  test("the cog and its texts in French", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n" }, { locale: "fr" });
    await page.getByRole("heading", { level: 1, name: "Alpha" }).waitFor();
    await settings(page, "Réglages d'affichage").click();
    const panel = page.getByRole("dialog", { name: "Réglages d'affichage" });
    await panel.getByRole("radio", { name: "Noms de fichiers" }).waitFor();
    await panel.getByRole("radio", { name: "Titres" }).check();
    await until(async () => (await links(page).allInnerTexts()).includes("Alpha"));
    await panel.getByRole("textbox", { name: "Remplacement" }).waitFor();
    await panel.getByRole("textbox", { name: "Motif" }).fill("(");
    await page.getByText("Ce motif n'est pas une expression régulière valide.").waitFor();
    assert.ok(nav(page));
  });
});

describe("the sidebar's width", () => {
  const files = { "a.md": "# Alpha\n\nSome text to select.\n", "b.md": "# Beta\n" };
  const separator = (page: Page, name = "Resize the sidebar") => page.getByRole("separator", { name });
  const sidebar = async (page: Page) => Math.round((await page.getByRole("navigation", { name: "Documents" }).boundingBox())!.width);
  const documentArea = async (page: Page) => Math.round((await page.locator("main").boundingBox())!.width);
  const dragBy = async (page: Page, dx: number) => {
    const box = (await separator(page).boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + 100];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 5 });
    await page.mouse.up();
  };

  test("it is 256 px by default; dragging the handle resizes it and the Document area takes the rest", async () => {
    const { page } = await withProject(files);
    await separator(page).waitFor();
    assert.equal(await sidebar(page), 256);
    const area = await documentArea(page);

    await dragBy(page, 60);
    assert.equal(await sidebar(page), 316);
    assert.equal(await documentArea(page), area - 60);
  });

  test("it stays within 200-600 px and is the same after a reload", async () => {
    const { page } = await withProject(files);
    await separator(page).waitFor();
    await dragBy(page, 2000);
    assert.equal(await sidebar(page), 600);
    await dragBy(page, -2000);
    assert.equal(await sidebar(page), 200);
    await dragBy(page, 100);
    assert.equal(await sidebar(page), 300);

    await page.reload();
    await separator(page).waitFor();
    assert.equal(await sidebar(page), 300);
  });

  test("a drag released over the Tree selects no text and opens nothing", async () => {
    const { page } = await withProject(files);
    await page.getByRole("heading", { level: 1, name: "Alpha" }).waitFor();
    const box = (await separator(page).boundingBox())!;
    const link = (await page.getByRole("link", { name: "b.md" }).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(link.x + 10, link.y + link.height / 2, { steps: 5 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.getSelection()?.toString()), "");
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Alpha");
  });

  test("arrow keys on the focused handle move it by 16 px, and the width is kept", async () => {
    const { page, host } = await withProject(files);
    await separator(page).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    assert.equal(await sidebar(page), 288);
    await page.keyboard.press("ArrowLeft");
    assert.equal(await sidebar(page), 272);
    assert.equal(await separator(page).getAttribute("aria-valuenow"), "272");
    await until(async () => ((await host.storage.get("display")) as { sidebar: { width: number } } | null)?.sidebar.width === 272);

    await page.reload();
    await separator(page).waitFor();
    assert.equal(await sidebar(page), 272);
  });

  test("the handle is named in French", async () => {
    const { page } = await withProject(files, { locale: "fr" });
    await separator(page, "Redimensionner la barre latérale").waitFor();
  });
});
