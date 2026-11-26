import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import type { Page } from "playwright";
import { useBrowser, withProject as connected, type Opened } from "./living-documentation.ts";
import type { TestFolder } from "@tessello/sdk/testing";

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

const MANIFEST = "---\norder: []\nhidden: []\n---\n";
const files = {
  "a.md": "# Alpha\n",
  ".templates/Réunions/liv-doc-main.md": MANIFEST,
  ".templates/Réunions/Rétro.md": "# Rétro\n\nCe qui a bien marché.\n",
  ".templates/Réunions/Standard.md": "# Agenda\n\nOrdre du jour\n",
  ".templates/Specs/liv-doc-main.md": MANIFEST,
  ".templates/Specs/Feature.md": "# Feature\n",
};

const menuButton = (page: Page) => page.getByRole("button", { name: "Templates", exact: true });
const menu = (page: Page) => page.getByRole("dialog", { name: "Templates" });
const openMenu = async (page: Page) => {
  await menuButton(page).click();
  await menu(page).waitFor();
};
const screen = (page: Page) => page.getByRole("heading", { level: 1, name: "Template library" });

describe("the Templates menu", () => {
  test(".templates/ never shows in the Tree; the menu lists folders one at a time with their templates", async () => {
    const { page } = await withProject(files);
    const nav = page.getByRole("navigation", { name: "Documents" });
    assert.equal(await nav.getByText("Réunions").count(), 0);
    assert.equal(await nav.getByText(".templates").count(), 0);

    await openMenu(page);
    await menu(page).getByRole("button", { name: "Réunions" }).waitFor();
    await menu(page).getByRole("button", { name: "Standard" }).waitFor();
    assert.equal(await menu(page).getByRole("button", { name: "Feature" }).count(), 0);

    await menu(page).getByRole("button", { name: "Specs" }).click();
    await menu(page).getByRole("button", { name: "Feature" }).waitFor();
    assert.equal(await menu(page).getByRole("button", { name: "Standard" }).count(), 0);
  });

  test("searches name and content ignoring case and accents; Escape closes it", async () => {
    const { page } = await withProject(files);
    await openMenu(page);
    const search = menu(page).getByRole("searchbox", { name: "Search templates" });
    assert.equal(await search.getAttribute("placeholder"), "Name or content…");

    await search.fill("RETRO");
    await until(async () => (await menu(page).getByRole("button", { name: "Standard" }).count()) === 0, "only the match is listed");
    await menu(page).getByRole("button", { name: "Rétro" }).waitFor();
    await search.fill("ordre DU jour");
    await menu(page).getByRole("button", { name: "Standard" }).waitFor();
    await until(async () => (await menu(page).getByRole("button", { name: "Rétro" }).count()) === 0, "only the match is listed");
    await search.fill("zzz");
    await menu(page).getByText("No matching templates").waitFor();

    await page.keyboard.press("Escape");
    await menu(page).waitFor({ state: "detached" });
  });

  test("says when there are no folders; a click outside closes it", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n" });
    await openMenu(page);
    await menu(page).getByText("No template folders yet.").waitFor();
    await page.getByRole("heading", { level: 1, name: "Alpha" }).click();
    await menu(page).waitFor({ state: "detached" });
  });

  test("Open library opens the screen; a template opens it with that template selected", async () => {
    const { page } = await withProject(files);
    await openMenu(page);
    await menu(page).getByRole("button", { name: "Open library" }).click();
    await screen(page).waitFor();
    assert.equal(await page.getByRole("navigation", { name: "Documents" }).count(), 0);
    await page.getByRole("button", { name: "← Back to documents" }).click();
    await page.getByRole("navigation", { name: "Documents" }).waitFor();

    await openMenu(page);
    await menu(page).getByRole("button", { name: "Standard" }).click();
    await screen(page).waitFor();
    await page.getByRole("heading", { level: 2, name: "Réunions / Standard" }).waitFor();
  });
});

type Project = Opened & { disk: TestFolder };
const onDisk = ({ host, disk }: Project, path: string) => host.folders.read(disk, path);
/** Waits until a file on the disk is (or, with null, is no longer) exactly `text`. */
const reads = (project: Project, path: string, text: string | null) => until(() => onDisk(project, path) === text, `${path} on disk (now ${JSON.stringify(onDisk(project, path))})`);

/** The library screen, opened from the menu, the first template selected. */
async function library(project: Project, selected = "Réunions / Rétro") {
  await project.page.getByRole("button", { name: "Templates", exact: true }).click();
  await project.page.getByRole("dialog", { name: "Templates" }).getByRole("button", { name: "Open library" }).click();
  await screen(project.page).waitFor();
  await project.page.getByRole("heading", { level: 2, name: selected }).waitFor();
}
const folderButton = (page: Page, name: string) => page.getByRole("region", { name: "Folders" }).getByRole("button", { name: new RegExp(`^${name}`) });
const templateButton = (page: Page, name: string) => page.getByRole("region", { name: "Templates" }).getByRole("button", { name: new RegExp(`^${name}`) });
const folderDialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const detail = (page: Page, title: string) => page.getByRole("heading", { level: 2, name: title });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

describe("the library screen", () => {
  test("lists folders with their counts and templates with their folder; the first template is selected; the heading and the count show", async () => {
    const project = await withProject(files);
    const { page } = project;
    await library(project);
    await page.getByText("Find a template, preview it, and create your document.").waitFor();
    await folderButton(page, "All templates").getByText("3").waitFor();
    await folderButton(page, "Réunions").getByText("2").waitFor();
    await page.getByRole("region", { name: "Templates" }).getByText("3 templates").waitFor();
    assert.equal(await templateButton(page, "Standard").innerText().then((text) => text.replace(/\s+/g, " ")), "Standard Réunions");

    await folderButton(page, "Specs").click();
    await page.getByRole("region", { name: "Templates" }).getByText("1 template", { exact: true }).waitFor();
    await detail(page, "Specs / Feature").waitFor();
    await templateButton(page, "Feature").waitFor();
    assert.equal(await templateButton(page, "Standard").count(), 0);
  });

  test("without a folder, it says where the library starts and New template is disabled", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n" });
    await page.getByRole("button", { name: "Templates", exact: true }).click();
    await page.getByRole("button", { name: "Open library" }).click();
    await screen(page).waitFor();
    await page.getByText("Your template library starts here").waitFor();
    await page.getByText("Select a template").waitFor();
    assert.equal(await button(page, "New template").isDisabled(), true);
  });
});

describe("folders", () => {
  test("creating refuses a taken name ignoring case, live; then creates it on disk", async () => {
    const project = await withProject(files);
    const { page } = project;
    await library(project);

    await button(page, "+ Folder").click();
    const dialog = folderDialog(page, "New folder");
    await dialog.getByRole("textbox", { name: "Name" }).fill("réunions");
    await dialog.getByRole("alert").getByText("already exists").waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Create" }).isDisabled(), true);
    await dialog.getByRole("textbox", { name: "Name" }).fill("a/b");
    await dialog.getByRole("alert").getByText("cannot contain").waitFor();
    await dialog.getByRole("textbox", { name: "Name" }).fill("Archives");
    await dialog.getByRole("button", { name: "Create" }).click();

    await folderButton(page, "Archives").waitFor();
    await page.getByText("No templates in this folder.").waitFor();
    assert.notEqual(onDisk(project, ".templates/Archives/liv-doc-main.md"), null);
  });

  test("renaming moves the templates with it; deleting says how many templates go", async () => {
    const project = await withProject(files);
    const { page } = project;
    await library(project);

    await folderButton(page, "Réunions").click();
    await page.getByRole("button", { name: "Rename folder" }).click();
    const rename = folderDialog(page, "Rename folder");
    assert.equal(await rename.getByRole("textbox", { name: "Name" }).inputValue(), "Réunions");
    await rename.getByRole("textbox", { name: "Name" }).fill("Meetings");
    await rename.getByRole("button", { name: "Rename" }).click();
    await folderButton(page, "Meetings").waitFor();
    await detail(page, "Meetings / Rétro").waitFor();
    await reads(project, ".templates/Meetings/Standard.md", "# Agenda\n\nOrdre du jour\n");
    assert.equal(onDisk(project, ".templates/Réunions/Standard.md"), null);

    await page.getByRole("button", { name: "Delete folder" }).click();
    const remove = folderDialog(page, "Delete folder");
    await remove.getByText("Permanently delete the folder “Meetings” and its 2 templates?").waitFor();
    await remove.getByRole("button", { name: "Cancel" }).click();
    assert.equal(onDisk(project, ".templates/Meetings/Standard.md") !== null, true);
    await page.getByRole("button", { name: "Delete folder" }).click();
    await remove.getByRole("button", { name: "Delete", exact: true }).click();
    await until(() => onDisk(project, ".templates/Meetings/Standard.md") === null && onDisk(project, ".templates/Meetings/Rétro.md") === null, "the folder's templates deleted");
    await detail(page, "Specs / Feature").waitFor();
    assert.equal(await folderButton(page, "Meetings").count(), 0);
  });

  test("deleting a folder with one template says so in the singular", async () => {
    const project = await withProject(files);
    const { page } = project;
    await library(project);
    await folderButton(page, "Specs").click();
    await page.getByRole("button", { name: "Delete folder" }).click();
    await folderDialog(page, "Delete folder").getByText("and its 1 template?").waitFor();
  });
});

describe("a template", () => {
  test("New template writes `# <name>` at once and opens the editor; typing autosaves; Revert restores; Done", async () => {
    const project = await withProject(files);
    const { page } = project;
    await library(project);

    await button(page, "New template").click();
    const dialog = folderDialog(page, "New template");
    await dialog.getByRole("textbox", { name: "Name" }).fill("standard");
    await dialog.getByRole("alert").getByText("already exists").waitFor();
    await dialog.getByRole("textbox", { name: "Name" }).fill("Plan");
    await dialog.getByRole("combobox", { name: "Folder" }).selectOption("Specs");
    await dialog.getByRole("button", { name: "Create" }).click();

    await detail(page, "Specs / Plan").waitFor();
    const editor = page.getByRole("textbox", { name: "Markdown" });
    await editor.waitFor();
    await reads(project, ".templates/Specs/Plan.md", "# Plan\n");

    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("Goal.\n");
    await reads(project, ".templates/Specs/Plan.md", "# Plan\nGoal.\n");
    await page.keyboard.type("Extra.\n");
    await reads(project, ".templates/Specs/Plan.md", "# Plan\nGoal.\nExtra.\n");

    await button(page, "Revert").click();
    await reads(project, ".templates/Specs/Plan.md", "# Plan\n");
    await button(page, "Edit").waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);

    await button(page, "Edit").click();
    await page.getByRole("textbox", { name: "Markdown" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("Done.");
    await button(page, "Done").click();
    await button(page, "Edit").waitFor();
    assert.equal(onDisk(project, ".templates/Specs/Plan.md"), "# Plan\nDone.");
    await page.getByRole("article").getByText("Done.").waitFor();
  });

  test("Back saves what was just typed", async () => {
    const project = await withProject(files);
    const { page } = project;
    await library(project);
    await button(page, "Edit").click();
    await page.getByRole("textbox", { name: "Markdown" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("Quick.\n");
    await page.getByRole("button", { name: "← Back to documents" }).click();
    await page.getByRole("navigation", { name: "Documents" }).waitFor();
    assert.ok(onDisk(project, ".templates/Réunions/Rétro.md")?.includes("Quick."));
  });

  test("rename and move: the files follow, a taken name is refused", async () => {
    const project = await withProject(files);
    const { page } = project;
    await library(project);

    await button(page, "Rename").click();
    const rename = folderDialog(page, "Rename template");
    await rename.getByRole("textbox", { name: "Name" }).fill("standard");
    await rename.getByRole("button", { name: "Rename" }).isEnabled();
    await rename.getByRole("textbox", { name: "Name" }).fill("Standard");
    await rename.getByRole("alert").getByText("already exists").waitFor();
    await rename.getByRole("textbox", { name: "Name" }).fill("Bilan");
    await rename.getByRole("button", { name: "Rename" }).click();
    await detail(page, "Réunions / Bilan").waitFor();
    await reads(project, ".templates/Réunions/Bilan.md", "# Rétro\n\nCe qui a bien marché.\n");
    assert.equal(onDisk(project, ".templates/Réunions/Rétro.md"), null);

    await button(page, "Move").click();
    const move = folderDialog(page, "Move template");
    await move.getByRole("combobox", { name: "Folder" }).selectOption("Specs");
    await move.getByRole("button", { name: "Move" }).click();
    await detail(page, "Specs / Bilan").waitFor();
    await reads(project, ".templates/Specs/Bilan.md", "# Rétro\n\nCe qui a bien marché.\n");
    assert.equal(onDisk(project, ".templates/Réunions/Bilan.md"), null);
  });

  test("moving over a template of the same name is refused under the field", async () => {
    const project = await withProject({ ...files, ".templates/Specs/Standard.md": "# Other\n" });
    const { page } = project;
    await library(project);
    await templateButton(page, "Standard").first().click();
    await button(page, "Move").click();
    const move = folderDialog(page, "Move template");
    await move.getByRole("combobox", { name: "Folder" }).selectOption("Specs");
    await move.getByRole("alert").getByText("already exists").waitFor();
    assert.equal(await move.getByRole("button", { name: "Move" }).isDisabled(), true);
  });

  test("duplicate writes `X copy`, then `X copy 2`, selects it and confirms; delete asks first", async () => {
    const project = await withProject(files);
    const { page } = project;
    await library(project, "Réunions / Rétro");

    await button(page, "Duplicate").click();
    await detail(page, "Réunions / Rétro copy").waitFor();
    await page.getByText("Duplicated as “Rétro copy”.").waitFor();
    await reads(project, ".templates/Réunions/Rétro copy.md", "# Rétro\n\nCe qui a bien marché.\n");
    await templateButton(page, "Rétro copy").first().click();
    await templateButton(page, "Rétro").first().click();
    await detail(page, "Réunions / Rétro").waitFor();
    await button(page, "Duplicate").click();
    await detail(page, "Réunions / Rétro copy 2").waitFor();
    await reads(project, ".templates/Réunions/Rétro copy 2.md", "# Rétro\n\nCe qui a bien marché.\n");

    await button(page, "Delete").click();
    const remove = folderDialog(page, "Delete template");
    await remove.getByText("Permanently delete the template “Rétro copy 2”?").waitFor();
    await remove.getByRole("button", { name: "Cancel" }).click();
    assert.notEqual(onDisk(project, ".templates/Réunions/Rétro copy 2.md"), null);
    await button(page, "Delete").click();
    await remove.getByRole("button", { name: "Delete", exact: true }).click();
    await reads(project, ".templates/Réunions/Rétro copy 2.md", null);
    await templateButton(page, "Rétro copy 2").waitFor({ state: "detached" });
    assert.notEqual(onDisk(project, ".templates/Réunions/Rétro.md"), null);
  });
});

describe("searching the library", () => {
  test("by name and by content, ignoring case and accents; the count updates; the folder narrows it", async () => {
    const project = await withProject(files);
    const { page } = project;
    await library(project);
    const search = page.getByRole("region", { name: "Templates" }).getByRole("searchbox", { name: "Search templates" });
    const region = page.getByRole("region", { name: "Templates" });

    await search.fill("RETRO");
    await region.getByText("1 template", { exact: true }).waitFor();
    await templateButton(page, "Rétro").waitFor();
    await search.fill("ordre du JOUR");
    await region.getByText("1 template", { exact: true }).waitFor();
    await templateButton(page, "Standard").waitFor();
    assert.equal(await templateButton(page, "Rétro").count(), 0);
    await detail(page, "Réunions / Standard").waitFor();
    await search.fill("e");
    await region.getByText("3 templates").waitFor();
    await folderButton(page, "Specs").click();
    await region.getByText("1 template", { exact: true }).waitFor();
    await search.fill("zzz");
    await region.getByText("No matching templates").waitFor();
    await region.getByText("0 templates").waitFor();
    await page.getByText("Select a template").waitFor();
  });
});

describe("preview", () => {
  const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64"));
  const body = "# Visual\n\nSee [other](other.md) and [web](https://example.com/x).\n\n![a dot](../../images/a.png)\n";

  test("formatted shows the heading and the Project's image loaded from the template's place; source shows the raw text; links are inert", async () => {
    const project = await withProject({ "a.md": "# Alpha\n", ".templates/Docs/liv-doc-main.md": MANIFEST, ".templates/Docs/Visual.md": body, "images/a.png": png });
    const { page } = project;
    await library(project, "Docs / Visual");

    const article = page.getByRole("article");
    await article.getByRole("heading", { level: 1, name: "Visual" }).waitFor();
    await until(
      () => article.getByRole("img", { name: "a dot" }).evaluate((img: HTMLImageElement) => img.src.startsWith("blob:") && img.complete && img.naturalWidth > 0).catch(() => false),
      "the image of the template",
    );

    await article.getByText("other", { exact: true }).click();
    await article.getByText("web", { exact: true }).click();
    await detail(page, "Docs / Visual").waitFor();
    await screen(page).waitFor();

    await button(page, "Markdown source").click();
    await page.getByText("![a dot](../../images/a.png)", { exact: false }).waitFor();
    assert.equal(await page.getByRole("article").count(), 0);
    await button(page, "Formatted preview").click();
    await page.getByRole("article").waitFor();
  });
});

describe("agent edits", () => {
  test("a change while the template is edited shows the banner; Compare lists both; Keep mine writes mine", async () => {
    const project = await withProject(files);
    const { page, host, disk } = project;
    await library(project);
    await button(page, "Edit").click();
    const editor = page.getByRole("textbox", { name: "Markdown" });
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("Mine.\n");
    await reads(project, ".templates/Réunions/Rétro.md", "# Rétro\n\nCe qui a bien marché.\nMine.\n");

    host.folders.write(disk, ".templates/Réunions/Rétro.md", "# Rétro\n\nTheirs.\n");
    const banner = page.getByRole("alert");
    await banner.getByText("This document changed on disk since you started editing.").waitFor();
    await banner.getByRole("button", { name: "Compare" }).click();
    await page.getByRole("region", { name: "Compare" }).getByRole("row").filter({ hasText: "Theirs." }).waitFor();
    await banner.getByRole("button", { name: "Keep mine" }).click();
    await reads(project, ".templates/Réunions/Rétro.md", "# Rétro\n\nCe qui a bien marché.\nMine.\n");
    assert.equal(await page.getByRole("alert").count(), 0);
  });

  test("Take theirs copies mine to the clipboard and loads theirs; Back stays while the conflict is pending", async () => {
    const project = await withProject(files);
    const { page, host, disk } = project;
    await library(project);
    await button(page, "Edit").click();
    host.folders.write(disk, ".templates/Réunions/Rétro.md", "# Rétro\n\nTheirs.\n");
    await page.getByRole("textbox", { name: "Markdown" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("Mine.\n");
    await page.getByRole("alert").getByText("changed on disk").waitFor();

    await page.getByRole("button", { name: "← Back to documents" }).click();
    await page.getByText("choose Keep mine or Take theirs before leaving it").waitFor();
    await screen(page).waitFor();

    await page.getByRole("alert").getByRole("button", { name: "Take theirs" }).click();
    await page.getByRole("textbox", { name: "Markdown" }).getByText("Theirs.").waitFor();
    assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes("Mine."));
    assert.equal(onDisk(project, ".templates/Réunions/Rétro.md"), "# Rétro\n\nTheirs.\n");
  });

  test("a change while not editing reloads the shown template and the list", async () => {
    const project = await withProject(files);
    const { page, host, disk } = project;
    await library(project);

    host.folders.write(disk, ".templates/Réunions/Rétro.md", "# Rétro\n\nNouveau texte.\n");
    host.folders.write(disk, ".templates/Specs/Plan.md", "# Plan\n");
    await page.getByRole("article").getByText("Nouveau texte.").waitFor();
    await templateButton(page, "Standard").waitFor();
    await folderButton(page, "Specs").getByText("2").waitFor();
  });
});

describe("Convert to files", () => {
  const legacy = JSON.stringify({ version: 1, folders: [{ id: "f1", name: "Réunions", templates: [{ id: "t1", name: "Standard", content: "# Agenda\n" }] }] }, null, 2);

  test("offers the conversion once; writes the files, leaves the JSON byte-identical, and the banner goes", async () => {
    const project = await withProject({ "a.md": "# Alpha\n", ".document-templates.json": legacy });
    const { page } = project;
    await page.getByRole("button", { name: "Templates", exact: true }).click();
    await page.getByRole("button", { name: "Open library" }).click();
    await screen(page).waitFor();
    const banner = page.getByRole("region", { name: "Convert to files" });
    await banner.getByText(".document-templates.json").first().waitFor();
    await banner.getByText("left untouched").waitFor();

    await banner.getByRole("button", { name: "Convert to files" }).click();
    await page.getByText("1 template was converted to files.").waitFor();
    await reads(project, ".templates/Réunions/Standard.md", "# Agenda\n");
    assert.equal(onDisk(project, ".document-templates.json"), legacy);
    await banner.waitFor({ state: "detached" });
    await detail(page, "Réunions / Standard").waitFor();
  });

  test("a file that is not the original's format says so and writes nothing", async () => {
    const project = await withProject({ "a.md": "# Alpha\n", ".document-templates.json": "[1, 2]" });
    const { page } = project;
    await page.getByRole("button", { name: "Templates", exact: true }).click();
    await page.getByRole("button", { name: "Open library" }).click();
    await page.getByRole("region", { name: "Convert to files" }).getByRole("button", { name: "Convert to files" }).click();
    await page.getByText("is not a template library of Living Documentation").waitFor();
    assert.equal(onDisk(project, ".document-templates.json"), "[1, 2]");
  });
});

describe("in French", () => {
  test("the menu and the screen speak French", async () => {
    const project = await withProject(files, { locale: "fr" });
    const { page } = project;
    await page.getByRole("button", { name: "Modèles", exact: true }).click();
    const menu = page.getByRole("dialog", { name: "Modèles" });
    await menu.getByRole("searchbox", { name: "Rechercher des modèles" }).waitFor();
    assert.equal(await menu.getByRole("searchbox").getAttribute("placeholder"), "Nom ou contenu…");
    await menu.getByRole("button", { name: "Ouvrir la bibliothèque" }).click();

    await page.getByRole("heading", { level: 1, name: "Bibliothèque de modèles" }).waitFor();
    await page.getByText("Trouvez un modèle, prévisualisez-le et créez votre document.").waitFor();
    await page.getByRole("button", { name: "← Retour aux documents" }).waitFor();
    await page.getByRole("button", { name: "Nouveau modèle" }).waitFor();
    await page.getByRole("button", { name: "+ Dossier" }).waitFor();
    await page.getByText("Tous les modèles").waitFor();
    await page.getByText("3 modèles").waitFor();
    for (const name of ["Modifier", "Dupliquer", "Déplacer", "Renommer", "Supprimer"]) await page.getByRole("button", { name, exact: true }).waitFor();
    await page.getByRole("button", { name: "Aperçu mis en forme" }).waitFor();
    await page.getByRole("button", { name: "Source Markdown" }).waitFor();

    await page.getByRole("button", { name: "Supprimer le dossier" }).waitFor({ state: "detached", timeout: 500 }).catch(() => undefined);
    await page.getByRole("button", { name: "Nouveau modèle" }).click();
    await page.getByRole("dialog", { name: "Nouveau modèle" }).getByRole("combobox", { name: "Dossier" }).waitFor();
  });
});
