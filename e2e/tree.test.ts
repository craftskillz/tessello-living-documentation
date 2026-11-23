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
