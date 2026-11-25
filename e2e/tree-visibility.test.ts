import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { type Opened, useBrowser, withProject } from "./living-documentation.ts";

useBrowser();

const FILE = ".living-doc.json";
const FILES = {
  "a.md": "# A\n",
  "images/a.png": "png",
  "doc.pdf": "pdf",
  "notes.txt": "hello",
  "data.csv": "x,y",
  "archive/old.md": "# Old\n",
  ".git/HEAD": "ref",
  ".git/info.txt": "info",
  "node_modules/x/README.md": "# X\n",
};

const names = async (page: Opened["page"]) => (await page.getByRole("navigation", { name: "Documents" }).getByRole("link").allInnerTexts()).sort();
const row = (page: Opened["page"], path: string) => page.locator(`[data-entry="${path}"]`);
const showHidden = (page: Opened["page"], locale: "en" | "fr" = "en") =>
  page.getByRole("button", { name: locale === "en" ? "Show hidden items" : "Afficher les éléments masqués" });

async function openSettings(page: Opened["page"], locale: "en" | "fr" = "en") {
  await page.locator(".switcher > button").click();
  const menu = page.getByRole("dialog", { name: locale === "en" ? /^Projects$/ : /^Projets$/ });
  await menu.getByRole("button", { name: locale === "en" ? "Project settings…" : /Réglages du projet/ }).click();
  return page.getByRole("dialog", { name: locale === "en" ? "Project settings" : "Réglages du projet" });
}

describe("the Tree's visibility settings", () => {
  test("by default images, PDF and text show; other files and excluded entries only with Show hidden items, the excluded ones greyed", async () => {
    const { page } = await withProject(FILES);
    const address = page.url();
    await page.getByRole("link", { name: "notes.txt" }).waitFor();
    assert.deepEqual(await names(page), ["a.md", "a.png", "doc.pdf", "notes.txt", "old.md"]);
    assert.equal(await row(page, "notes.txt").evaluate((each) => getComputedStyle(each).fontStyle), "normal");

    await showHidden(page).click();
    await page.getByRole("link", { name: "data.csv" }).waitFor();
    assert.deepEqual(await names(page), ["HEAD", "README.md", "a.md", "a.png", "data.csv", "doc.pdf", "info.txt", "notes.txt", "old.md"]);
    assert.equal(await row(page, ".git").evaluate((each) => getComputedStyle(each).fontStyle), "italic");
    assert.equal(await row(page, "node_modules").evaluate((each) => getComputedStyle(each).fontStyle), "italic");
    assert.equal(await row(page, "notes.txt").evaluate((each) => getComputedStyle(each).fontStyle), "normal");
    assert.equal(await row(page, "data.csv").evaluate((each) => getComputedStyle(each).fontStyle), "italic");
    assert.equal(page.url(), address);
  });

  test("changing Files shown to csv shows data.csv, hides a.png, and writes only that key", async () => {
    const { page, host, disk } = await withProject({ ...FILES, [FILE]: '{"tagSuggestions": ["todo"]}\n' });
    const address = page.url();
    await page.getByRole("link", { name: "a.png" }).waitFor();
    const settings = await openSettings(page);
    const field = settings.getByRole("textbox", { name: "Files shown in the Tree" });
    assert.equal(await field.inputValue(), "png, jpg, jpeg, gif, webp, svg, avif, bmp, ico, pdf, txt");
    await field.fill("csv");
    await field.press("Enter");
    await settings.getByRole("button", { name: "Close" }).click();
    await page.getByRole("link", { name: "data.csv" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "a.png" }).count(), 0);
    await until(async () => String(host.folders.read(disk, FILE)).includes("treeShownExtensions"), "the key written");
    assert.deepEqual(JSON.parse(String(host.folders.read(disk, FILE))), { tagSuggestions: ["todo"], treeShownExtensions: ["csv"] });
    assert.equal(page.url(), address);
  });

  test("an other file open in its panel closes when its extension is no longer shown", async () => {
    const { page } = await withProject(FILES);
    const address = page.url();
    await page.getByRole("link", { name: "notes.txt" }).click();
    await page.getByText("hello", { exact: true }).waitFor();
    const settings = await openSettings(page);
    await settings.getByRole("textbox", { name: "Files shown in the Tree" }).fill("csv");
    await settings.getByRole("textbox", { name: "Files shown in the Tree" }).press("Enter");
    await settings.getByRole("button", { name: "Close" }).click();
    await page.getByText("hello", { exact: true }).waitFor({ state: "detached" });
    assert.equal(page.url(), address);
  });

  test("adding archive to Excluded entries hides that folder; Restore defaults brings the default list back on disk and in the field", async () => {
    const { page, host, disk } = await withProject(FILES);
    const address = page.url();
    await page.getByRole("link", { name: "old.md" }).waitFor();
    const settings = await openSettings(page);
    const field = settings.getByRole("textbox", { name: "Excluded entries" });
    assert.equal(await field.inputValue(), ".git, node_modules, .DS_Store");
    await field.fill(".git, node_modules, .DS_Store, archive");
    await field.press("Enter");
    await page.getByRole("link", { name: "old.md" }).waitFor({ state: "detached" });
    await until(async () => String(host.folders.read(disk, FILE)).includes("archive"), "the list written");
    assert.deepEqual(JSON.parse(String(host.folders.read(disk, FILE))), { treeExcluded: [".git", "node_modules", ".DS_Store", "archive"] });

    await settings.getByRole("button", { name: "Restore defaults: Excluded entries" }).click();
    await page.getByRole("link", { name: "old.md" }).waitFor();
    assert.equal(await field.inputValue(), ".git, node_modules, .DS_Store");
    await until(async () => !String(host.folders.read(disk, FILE)).includes("archive"), "the default written");
    assert.deepEqual(JSON.parse(String(host.folders.read(disk, FILE))), { treeExcluded: [".git", "node_modules", ".DS_Store"] });
    assert.equal(page.url(), address);
  });

  test("a .living-doc.json written by an agent with treeExcluded: [] shows .git without Show hidden items", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n", ".git/info.txt": "info" });
    const address = page.url();
    await page.getByRole("link", { name: "a.md" }).waitFor();
    assert.deepEqual(await names(page), ["a.md"]);
    host.folders.write(disk, FILE, '{"treeExcluded": []}\n');
    await page.getByRole("link", { name: "info.txt" }).waitFor();
    assert.deepEqual(await names(page), ["a.md", "info.txt"]);
    assert.equal(page.url(), address);
  });

  test("a failed write puts the field back and says so", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n", "notes.txt": "x", [FILE]: "[1]\n" });
    const address = page.url();
    const settings = await openSettings(page);
    const field = settings.getByRole("textbox", { name: "Files shown in the Tree" });
    await field.fill("csv");
    await field.press("Enter");
    await until(async () => (await field.inputValue()) === "png, jpg, jpeg, gif, webp, svg, avif, bmp, ico, pdf, txt", "the field back");
    assert.equal(host.folders.read(disk, FILE), "[1]\n");
    await page.getByText("The Project's .living-doc.json is not valid JSON", { exact: false }).waitFor();
    await page.getByRole("link", { name: "notes.txt" }).waitFor();
    assert.equal(page.url(), address);
  });

  test("the fields are labelled in French", async () => {
    const { page } = await withProject({ "a.md": "# A\n" }, { locale: "fr" });
    const address = page.url();
    const settings = await openSettings(page, "fr");
    await settings.getByRole("textbox", { name: "Fichiers affichés dans l'arborescence" }).waitFor();
    await settings.getByRole("textbox", { name: "Entrées exclues" }).waitFor();
    await settings.getByRole("button", { name: "Rétablir les valeurs par défaut : Entrées exclues" }).waitFor();
    assert.equal(page.url(), address);
  });
});
