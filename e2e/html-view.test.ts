import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { useBrowser, withProject, type Opened } from "./living-documentation.ts";

useBrowser();

/** The open View and its address: after every journey, the address must not have changed (an about:srcdoc page in the Host). */
let watched: { page: Opened["page"]; address: string } | null = null;

async function project(...args: Parameters<typeof withProject>) {
  const opened = await withProject(...args);
  watched = { page: opened.page, address: opened.page.url() };
  return opened;
}

afterEach(() => {
  if (watched) assert.equal(watched.page.url(), watched.address);
  watched = null;
});

/** A 1x1 PNG. */
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64"));

const GUIDE = [
  "---",
  "title: Guide",
  "html_template: article",
  "---",
  "# Guide to things",
  "",
  "The lead paragraph.",
  "",
  "## First part",
  "",
  "<!-- quote-type: info -->",
  "> Careful",
  "",
  "A <todo> marker.",
  "",
  "![pic](pic.png)",
  "",
  "## Second part",
  "",
  "Last words.",
  "",
].join("\n");

const choose = async (page: Opened["page"], name: string) => page.getByRole("dialog", { name: "Choose an HTML template" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();

describe("the template dialog", () => {
  test("Generate as HTML on a Document without frontmatter writes only the frontmatter on top", async () => {
    const { page, host, disk } = await project({ "a.md": "# A\n\nBody.\n" });
    await page.getByRole("button", { name: "Generate as HTML" }).click();
    const dialog = page.getByRole("dialog", { name: "Choose an HTML template" });
    await dialog.getByText("A template only changes the presentation: the content remains that of this document.").waitFor();
    assert.deepEqual(await dialog.getByRole("group").evaluateAll((each) => each.map((one) => one.querySelector("legend")?.textContent)), ["Interviews", "Articles"]);

    await choose(page, "Interview sheet");

    await page.getByRole("button", { name: "View as HTML" }).waitFor();
    assert.equal(await dialog.count(), 0);
    assert.equal(host.folders.read(disk, "a.md"), "---\nhtml_template: interview-sheet\n---\n# A\n\nBody.\n");
  });

  test("changing the template changes only that line; the current one chosen again writes nothing", async () => {
    const { page, host, disk } = await project({ "a.md": "---\ntitle: A\nhtml_template: interview-sheet\ncolor: blue\n---\n\n# A\n" });
    await page.getByRole("button", { name: "Change the HTML template" }).click();
    const dialog = page.getByRole("dialog", { name: "Choose an HTML template" });
    await dialog.getByText("Current template").waitFor();

    await choose(page, "Interview sheet");
    await until(async () => (await dialog.count()) === 0, "the dialog closed");
    assert.equal(host.folders.read(disk, "a.md"), "---\ntitle: A\nhtml_template: interview-sheet\ncolor: blue\n---\n\n# A\n");

    await page.getByRole("button", { name: "Change the HTML template" }).click();
    await choose(page, "Article");
    await until(async () => (await dialog.count()) === 0, "the dialog closed");
    assert.equal(host.folders.read(disk, "a.md"), "---\ntitle: A\nhtml_template: article\ncolor: blue\n---\n\n# A\n");
  });

  test("Escape and Close leave the file alone", async () => {
    const { page, host, disk } = await project({ "a.md": "# A\n" });
    await page.getByRole("button", { name: "Generate as HTML" }).click();
    const dialog = page.getByRole("dialog", { name: "Choose an HTML template" });
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await until(async () => (await dialog.count()) === 0, "closed by Escape");
    await page.getByRole("button", { name: "Generate as HTML" }).click();
    await dialog.getByRole("button", { name: "Close" }).click();
    await until(async () => (await dialog.count()) === 0, "closed by Close");
    assert.equal(host.folders.read(disk, "a.md"), "# A\n");
  });

  test("invalid frontmatter: Fix the frontmatter first, the editor opens, the file is untouched", async () => {
    const text = "---\ntitle: [oops\n---\n# A\n";
    const { page, host, disk } = await project({ "a.md": text });
    await page.getByRole("button", { name: "Generate as HTML" }).click();
    await choose(page, "Article");
    await page.getByRole("status").getByText("Fix the frontmatter first").waitFor();
    await page.getByRole("textbox", { name: "Markdown" }).waitFor();
    assert.equal(host.folders.read(disk, "a.md"), text);
  });

  test("a conflict overwrites nothing and tells the User to try again", async () => {
    const { page, host, disk } = await project({ "a.md": "# A\n\nMine.\n" });
    await page.getByRole("button", { name: "Generate as HTML" }).click();
    await page.getByRole("dialog", { name: "Choose an HTML template" }).waitFor();
    host.folders.write(disk, "a.md", "# A\n\nAgent.\n");

    await choose(page, "Article");

    await page.getByRole("dialog").getByText("This document changed on disk. Try again.").waitFor();
    assert.equal(host.folders.read(disk, "a.md"), "# A\n\nAgent.\n");
    await page.getByText("Agent.").waitFor();
    await choose(page, "Article");
    await page.getByRole("button", { name: "View as HTML" }).waitFor();
    assert.equal(host.folders.read(disk, "a.md"), "---\nhtml_template: article\n---\n# A\n\nAgent.\n");
  });

  test("an unknown template shows Generate as HTML and a note in the dialog", async () => {
    const { page } = await project({ "a.md": "---\nhtml_template: fancy\n---\n# A\n" });
    assert.equal(await page.getByRole("button", { name: "View as HTML" }).count(), 0);
    await page.getByRole("button", { name: "Generate as HTML" }).click();
    await page.getByRole("dialog").getByText("Unknown template “fancy” in this document.").waitFor();
  });

  test("the Folder manifest has no HTML action", async () => {
    const { page } = await project({ "guide/liv-doc-main.md": "---\ntitle: Guide\n---\n\nAbout.\n", "guide/g.md": "# G\n" });
    await page.getByRole("button", { name: "Show hidden items" }).click();
    await page.getByRole("link", { name: "liv-doc-main.md" }).click();
    await page.getByText("Read-only").waitFor();
    assert.equal(await page.getByRole("button", { name: "Generate as HTML" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "View as HTML" }).count(), 0);
  });
});

describe("the HTML view", () => {
  const files = { "guide.md": GUIDE, "pic.png": PNG };

  test("shows the page in place of the reading view and returns with ← Document", async () => {
    const { page } = await project(files);
    await page.getByRole("button", { name: "View as HTML" }).click();
    const view = page.getByRole("region", { name: "HTML view of the document" });
    await view.getByRole("heading", { level: 1, name: "Guide to things" }).waitFor();
    await view.getByText("The lead paragraph.").waitFor();
    await view.getByRole("heading", { name: "First part" }).waitFor();
    await view.getByText("Careful").waitFor();
    await view.locator("mark.ld-tag-marker").waitFor();
    await view.locator('[data-anchor="first-part"]').first().waitFor();
    await view.locator("section#first-part").waitFor();
    await view.locator("img").waitFor();
    await until(async () => (await view.locator("img").getAttribute("src"))?.startsWith("blob:") ?? false, "the image loaded");
    assert.equal(await page.locator("article.document").count(), 0);

    await page.getByRole("button", { name: "← Document" }).click();
    await page.locator("article.document").waitFor();
    assert.equal(await page.getByRole("region", { name: "HTML view of the document" }).count(), 0);
  });

  test("a table of contents link scrolls inside the page", async () => {
    const filler = Array.from({ length: 80 }, (_, i) => `Line ${i}.\n`).join("\n");
    const { page } = await project({ "g.md": `---\nhtml_template: article\n---\n# T\n\n## One\n\n${filler}\n## Two\n\n${filler}\n` });
    await page.getByRole("button", { name: "View as HTML" }).click();
    const view = page.getByRole("region", { name: "HTML view of the document" });
    await view.locator('[data-anchor="two"]').first().click();
    await until(async () => (await view.locator("section#two").boundingBox())!.y < 400, "scrolled to the section");
  });

  test("an agent writing an unknown template shows the message and Choose a template; the file keeps its value", async () => {
    const { page, host, disk } = await project({ "a.md": "---\nhtml_template: article\n---\n# A\n\n## S\n\nText.\n" });
    await page.getByRole("button", { name: "View as HTML" }).click();
    await page.getByRole("region", { name: "HTML view of the document" }).getByText("Text.").waitFor();
    const agent = "---\nhtml_template: fancy\n---\n# A\n\n## S\n\nText.\n";

    host.folders.write(disk, "a.md", agent);

    await page.getByText("This document asks for the HTML template “fancy”, which does not exist.").waitFor();
    await page.getByRole("button", { name: "Choose a template" }).click();
    await page.getByRole("dialog", { name: "Choose an HTML template" }).waitFor();
    assert.equal(host.folders.read(disk, "a.md"), agent);
  });

  test("an agent removing the template shows that the document has none", async () => {
    const { page, host, disk } = await project({ "a.md": "---\nhtml_template: article\n---\n# A\n" });
    await page.getByRole("button", { name: "View as HTML" }).click();
    await page.getByRole("region", { name: "HTML view of the document" }).waitFor();
    host.folders.write(disk, "a.md", "# A\n");
    await page.getByText("This document has no HTML template.").waitFor();
  });

  test("Change the HTML template from the HTML view re-renders the page", async () => {
    const { page } = await project({ "a.md": "---\nhtml_template: article\n---\n# A\n\n## S\n\nText.\n" });
    await page.getByRole("button", { name: "View as HTML" }).click();
    const view = page.getByRole("region", { name: "HTML view of the document" });
    await view.locator(".article-header").waitFor();
    await page.getByRole("button", { name: "Change the HTML template" }).click();
    await choose(page, "Interview sheet");
    await view.locator(".sheet-header").waitFor();
  });

  test("opening another Document from the Tree shows its reading view", async () => {
    const { page } = await project({ "a.md": "---\nhtml_template: article\n---\n# A\n", "b.md": "# Bee\n" });
    await page.getByRole("button", { name: "View as HTML" }).click();
    await page.getByRole("region", { name: "HTML view of the document" }).waitFor();
    await page.getByRole("navigation", { name: "Documents" }).getByRole("link", { name: "b.md" }).click();
    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();
    assert.equal(await page.getByRole("region", { name: "HTML view of the document" }).count(), 0);
  });

  test("a link to another Document leaves the HTML view and follows the link", async () => {
    const { page } = await project({ "a.md": "---\nhtml_template: article\n---\n# A\n\n## S\n\nSee [bee](b.md).\n", "b.md": "# Bee\n" });
    await page.getByRole("button", { name: "View as HTML" }).click();
    await page.getByRole("region", { name: "HTML view of the document" }).getByRole("link", { name: "bee" }).click();
    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();
    assert.equal(await page.getByRole("region", { name: "HTML view of the document" }).count(), 0);
  });
});

describe("Download HTML", () => {
  test("hands over one standalone file with the style, the image and no script", async () => {
    const { page } = await project({ "guide.md": GUIDE, "pic.png": PNG });
    await page.getByRole("button", { name: "View as HTML" }).click();
    await page.getByRole("region", { name: "HTML view of the document" }).getByText("The lead paragraph.").waitFor();

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download HTML" }).click()]);

    assert.equal(download.suggestedFilename(), "guide.html");
    const text = await readFile((await download.path())!, "utf8");
    assert.ok(text.startsWith("<!DOCTYPE html>"));
    assert.equal(text.match(/<style/g)?.length, 1);
    assert.ok(!text.includes("<script"));
    assert.ok(text.includes("data:image/png;base64,"));
    assert.ok(text.includes("Guide to things"));
  });

  test("an image that cannot be read is left out, not a failure", async () => {
    const { page } = await project({ "a.md": "---\nhtml_template: article\n---\n# A\n\n## S\n\n![gone](nope.png)\n" });
    await page.getByRole("button", { name: "View as HTML" }).click();
    await page.getByRole("region", { name: "HTML view of the document" }).getByText("gone").waitFor();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download HTML" }).click()]);
    const text = await readFile((await download.path())!, "utf8");
    assert.ok(text.startsWith("<!DOCTYPE html>"));
    assert.ok(!text.includes("data:image"));
  });

  test("embeds a drawn diagram", async () => {
    const { page } = await project({ "a.md": "---\nhtml_template: article\n---\n# A\n\n## S\n\n```mermaid\ngraph TD\n  A[Start] --> B[End]\n```\n" });
    await page.getByRole("button", { name: "View as HTML" }).click();
    await page.getByRole("region", { name: "HTML view of the document" }).locator("svg").waitFor();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download HTML" }).click()]);
    const text = await readFile((await download.path())!, "utf8");
    assert.ok(text.includes("<svg"));
    assert.ok(text.includes("Start"));
  });
});

describe("in French", () => {
  test("every label of the feature is French in a French Host", async () => {
    const { page } = await project({ "a.md": "# A\n\n## S\n\nText.\n" }, { locale: "fr" });
    await page.getByRole("button", { name: "Générer en HTML" }).click();
    const dialog = page.getByRole("dialog", { name: "Choisir un modèle HTML" });
    await dialog.getByRole("button", { name: "Fermer" }).waitFor();
    await choose2(page, "Article");
    await page.getByRole("button", { name: "Voir en HTML" }).click();
    await page.getByRole("region", { name: "Vue HTML du document" }).waitFor();
    for (const name of ["← Document", "Changer le modèle HTML", "Télécharger le HTML"]) await page.getByRole("button", { name }).waitFor();
  });
});

const choose2 = (page: Opened["page"], name: string) => page.getByRole("dialog", { name: "Choisir un modèle HTML" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
