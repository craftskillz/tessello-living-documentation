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

  for (const template of ["article", "interview-sheet"]) {
    test(`${template}: a table's cells keep space on every side, as in the reading view`, async () => {
      const { page } = await project({ "t.md": `---\nhtml_template: ${template}\n---\n# T\n\n## Part\n\n<!-- table-color: info -->\n| Head | Other |\n| -- | -- |\n| a | b |\n` });
      await page.getByRole("button", { name: "View as HTML" }).click();
      const view = page.getByRole("region", { name: "HTML view of the document" });
      for (const cell of [view.locator("thead th").first(), view.locator("tbody td").first()]) {
        await cell.waitFor();
        const padding = await cell.evaluate((element) => {
          const style = getComputedStyle(element);
          return { top: parseFloat(style.paddingTop), left: parseFloat(style.paddingLeft) };
        });
        assert.ok(padding.left >= 8, `left padding ${padding.left}`);
        assert.ok(padding.top >= 6, `top padding ${padding.top}`);
      }
    });
  }

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

describe("links in the HTML view", () => {
  const T = "---\nhtml_template: article\n---\n";
  const filler = Array.from({ length: 80 }, (_, i) => `Line ${i}.\n`).join("\n");
  const region = (page: Opened["page"]) => page.getByRole("region", { name: "HTML view of the document" });

  test("a link to a Document with a template opens its HTML view, and Back returns to the HTML view", async () => {
    const { page } = await project({ "a.md": `${T}# Alpha\n\n## S\n\n[to bee](?doc=b)\n`, "b.md": `${T}# Bee\n\n## T\n\nBee text.\n` });
    await page.getByRole("link", { name: "a.md", exact: true }).click();
    await page.getByRole("button", { name: "View as HTML" }).click();
    await region(page).getByRole("link", { name: "to bee" }).click();
    await region(page).getByText("Bee text.").waitFor();
    assert.equal(await page.locator("article.document").count(), 0);

    await page.getByRole("group", { name: "Back to" }).getByRole("button", { name: "← Alpha" }).click();
    await region(page).getByRole("link", { name: "to bee" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "← Alpha" }).count(), 0);
  });

  test("a link to a Document without a template opens its reading view, and Back returns to the HTML view", async () => {
    const { page } = await project({ "a.md": `${T}# Alpha\n\n## S\n\n[to cee](?doc=c)\n`, "c.md": "# Cee\n\nPlain.\n" });
    await page.getByRole("link", { name: "a.md", exact: true }).click();
    await page.getByRole("button", { name: "View as HTML" }).click();
    await region(page).getByRole("link", { name: "to cee" }).click();
    await page.getByRole("heading", { level: 1, name: "Cee" }).waitFor();
    assert.equal(await region(page).count(), 0);

    await page.getByRole("button", { name: "← Alpha" }).click();
    await region(page).getByRole("link", { name: "to cee" }).waitFor();
  });

  test("from the reading view, a link to a templated Document opens its reading view, and Back returns to reading", async () => {
    const { page } = await project({ "a.md": "# Alpha\n\n[to bee](?doc=b)\n", "b.md": `${T}# Bee\n\n## T\n\nBee text.\n` });
    await page.getByRole("link", { name: "a.md", exact: true }).click();
    await page.getByRole("link", { name: "to bee" }).click();
    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();
    assert.equal(await region(page).count(), 0);

    await page.getByRole("button", { name: "← Alpha" }).click();
    await page.getByRole("heading", { level: 1, name: "Alpha" }).waitFor();
    assert.equal(await region(page).count(), 0);
  });

  test("a link to a missing Document leaves the HTML view in place with the message", async () => {
    const { page } = await project({ "a.md": `${T}# Alpha\n\n## S\n\n[gone](?doc=nope)\n` });
    await page.getByRole("link", { name: "a.md", exact: true }).click();
    await page.getByRole("button", { name: "View as HTML" }).click();
    await region(page).getByRole("link", { name: "gone" }).click();
    await page.getByText(/nope/).first().waitFor();
    await region(page).getByRole("link", { name: "gone" }).waitFor();
    assert.equal(await page.getByRole("group", { name: "Back to" }).count(), 0);
  });

  test("a link with an anchor scrolls to that section of the target's HTML view", async () => {
    const { page } = await project({
      "a.md": `${T}# Alpha\n\n## S\n\n[x](?doc=b#second-part)\n`,
      "b.md": `${T}# Bee\n\n## First part\n\n${filler}\n## Second part\n\nEnd.\n\n${filler}`,
    });
    await page.getByRole("link", { name: "a.md", exact: true }).click();
    await page.getByRole("button", { name: "View as HTML" }).click();
    await region(page).getByRole("link", { name: "x" }).click();
    await region(page).locator("section#second-part").waitFor();
    await until(async () => (await region(page).locator("section#second-part").boundingBox())!.y < 400, "scrolled to the section");
  });

  test("a link to the open Document only scrolls in its HTML view, without a trail entry", async () => {
    const { page } = await project({ "a.md": `${T}# Alpha\n\n## One\n\n[self](?doc=a#two)\n\n${filler}\n## Two\n\nEnd.\n\n${filler}` });
    await page.getByRole("link", { name: "a.md", exact: true }).click();
    await page.getByRole("button", { name: "View as HTML" }).click();
    await region(page).getByRole("link", { name: "self" }).click();
    await until(async () => (await region(page).locator("section#two").boundingBox())!.y < 400, "scrolled to the section");
    assert.equal(await page.getByRole("group", { name: "Back to" }).count(), 0);
  });
});

const FRONT = "---\nhtml_template: article\n---\n";
const doc = (body: string) => `${FRONT}# Title\n\n${body}`;
const SOFT_OFF = { ".living-doc.json": '{"markdownSoftBreaks":false}' };
const regionOf = (page: Opened["page"]) => page.getByRole("region", { name: "HTML view of the document" });

async function openHtml(files: Record<string, string>) {
  const opened = await project(files);
  await opened.page.getByRole("button", { name: "View as HTML" }).click();
  const view = regionOf(opened.page);
  await view.locator(".ld-html-page").waitFor();
  return { ...opened, view };
}

/** Double-clicks the first word of a block (it stays selected) and puts the caret right after it. */
async function editAfterFirstWord(page: Opened["page"], block: ReturnType<Opened["page"]["locator"]>) {
  await block.dblclick({ position: { x: 4, y: 6 } });
  await page.locator("[contenteditable]").waitFor();
  await page.keyboard.press("ArrowRight");
}

describe("editing in the HTML view", () => {
  const BODY = "Lead one.\n\n## First\n\nAlpha beta.\n\nOmega.\n\n### Sub\n\nIn sub.\n\n## Second\n\nTail.\n";

  test("a paragraph is edited in place; leaving it writes only its lines, and the page shows it", async () => {
    const { page, host, disk, view } = await openHtml({ "a.md": doc(BODY) });
    await editAfterFirstWord(page, view.locator("p", { hasText: "Alpha beta." }));
    await page.keyboard.type(" Added");
    await page.getByRole("button", { name: "Change the HTML template" }).focus();
    await until(() => host.folders.read(disk, "a.md") === doc(BODY.replace("Alpha beta.", "Alpha Added beta.")), "only that paragraph on disk");
    await view.getByText("Alpha Added beta.").waitFor();
    assert.equal(await view.locator("[contenteditable]").count(), 0);
  });

  test("the scroll position is kept after a save", async () => {
    const filler = Array.from({ length: 60 }, (_, i) => `Line ${i}.\n`).join("\n");
    const { page, host, disk, view } = await openHtml({ "a.md": doc(`## One\n\n${filler}\n## Two\n\nTarget here.\n\n${filler}`) });
    const target = view.locator("p", { hasText: "Target here." });
    await target.scrollIntoViewIfNeeded();
    await editAfterFirstWord(page, target);
    const before = await page.locator("main").first().evaluate((main) => main.scrollTop);
    assert.ok(before > 300);
    await page.keyboard.type(" more");
    await page.keyboard.press("Enter");
    await until(() => host.folders.read(disk, "a.md")?.includes("Target more here."), "saved");
    await view.getByText("Target more here.").waitFor();
    const after = await page.locator("main").first().evaluate((main) => main.scrollTop);
    assert.ok(Math.abs(after - before) < 5, `scroll ${before} -> ${after}`);
  });

  test("renaming a heading with Enter makes the table of contents follow", async () => {
    const { page, host, disk, view } = await openHtml({ "a.md": doc(BODY) });
    await view.locator("h2", { hasText: "Second" }).dblclick({ position: { x: 4, y: 6 } });
    await page.keyboard.type("Renamed");
    await page.keyboard.press("Enter");
    await until(() => host.folders.read(disk, "a.md") === doc(BODY.replace("## Second", "## Renamed")), "heading on disk");
    await view.locator('[data-anchor="renamed"]').first().waitFor();
  });

  test("Escape writes nothing, and an unchanged block writes nothing", async () => {
    const { page, host, disk, view } = await openHtml({ "a.md": doc(BODY) });
    const text = doc(BODY);
    await editAfterFirstWord(page, view.locator("p", { hasText: "Omega." }));
    await page.keyboard.type(" nope");
    await page.keyboard.press("Escape");
    await view.getByText("Omega.", { exact: true }).waitFor();
    assert.equal(await view.locator("[contenteditable]").count(), 0);
    await editAfterFirstWord(page, view.locator("p", { hasText: "Omega." }));
    await page.keyboard.press("Enter");
    await until(async () => (await view.locator("[contenteditable]").count()) === 0, "closed");
    assert.equal(host.folders.read(disk, "a.md"), text);
  });

  test("emptying a paragraph removes it", async () => {
    const { page, host, disk, view } = await openHtml({ "a.md": doc(BODY) });
    await view.locator("p", { hasText: "Omega." }).dblclick({ position: { x: 4, y: 6 } });
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await page.keyboard.press("Enter");
    await until(() => host.folders.read(disk, "a.md") === doc(BODY.replace("Omega.\n\n", "")), "paragraph removed");
  });

  test("Shift+Enter in a paragraph writes a hard break when soft breaks are off", async () => {
    const { page, host, disk, view } = await openHtml({ "a.md": doc(BODY), ...SOFT_OFF });
    await editAfterFirstWord(page, view.locator("p", { hasText: "Omega." }));
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("Next");
    await page.keyboard.press("Enter");
    await until(() => host.folders.read(disk, "a.md") === doc(BODY.replace("Omega.", "Omega  \nNext.")), "hard break on disk");
  });

  test("Shift+Enter in a paragraph writes a bare line ending when soft breaks are on", async () => {
    const { page, host, disk, view } = await openHtml({ "a.md": doc(BODY) });
    await editAfterFirstWord(page, view.locator("p", { hasText: "Omega." }));
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("Next");
    await page.keyboard.press("Enter");
    await until(() => host.folders.read(disk, "a.md") === doc(BODY.replace("Omega.", "Omega\nNext.")), "line ending on disk");
  });

  test("escaped text opens the section editor instead, and writes nothing", async () => {
    const text = doc("## S\n\nPrix \\*barré\\* ici.\n");
    const { page, host, disk, view } = await openHtml({ "a.md": text });
    await view.locator("p", { hasText: "Prix" }).dblclick();
    await page.getByRole("dialog", { name: "Edit section" }).waitFor();
    assert.equal(host.folders.read(disk, "a.md"), text);
    assert.equal(await view.locator("[contenteditable]").count(), 0);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Edit section" }).waitFor({ state: "detached" });
    await view.locator("p", { hasText: "Prix" }).waitFor();
  });

  test("an h5 does nothing on double-click", async () => {
    const text = doc("## S\n\n##### Tiny\n\nBody.\n");
    const { page, host, disk, view } = await openHtml({ "a.md": text });
    await view.locator("h5").dblclick();
    assert.equal(await view.locator("[contenteditable], textarea").count(), 0);
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(host.folders.read(disk, "a.md"), text);
  });

  test("a list is edited as Markdown in a field: Tab, Shift+Enter, Enter", async () => {
    const text = doc("## S\n\n- a\n- b\n\nAfter.\n");
    const { page, host, disk, view } = await openHtml({ "a.md": text });
    await view.locator("ul").dblclick();
    const field = view.getByRole("textbox", { name: "Markdown of this block" });
    assert.equal(await field.inputValue(), "- a\n- b");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("End");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.type("- c");
    await page.keyboard.press("Enter");
    await until(() => host.folders.read(disk, "a.md") === doc("## S\n\n- a\n- b\n  - c\n\nAfter.\n"), "list on disk");
    await view.locator("li", { hasText: "c" }).last().waitFor();
  });

  test("emptying a code block removes it", async () => {
    const { page, host, disk, view } = await openHtml({ "a.md": doc("## S\n\n```\ncode\n```\n\nAfter.\n") });
    await view.locator("pre").dblclick();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await page.keyboard.press("ControlOrMeta+Enter");
    await until(() => host.folders.read(disk, "a.md") === doc("## S\n\nAfter.\n"), "code removed");
  });

  test("a conflict writes nothing, keeps the edit open and says so", async () => {
    const { page, host, disk, view } = await openHtml({ "a.md": doc(BODY) });
    await editAfterFirstWord(page, view.locator("p", { hasText: "Omega." }));
    await page.keyboard.type(" mine");
    const agent = doc(BODY.replace("Tail.", "Agent tail."));
    host.folders.write(disk, "a.md", agent);
    await page.keyboard.press("Enter");
    await page.getByText("The document changed after opening. Copy your edits and reopen the section to avoid overwriting those changes.").waitFor();
    assert.equal(host.folders.read(disk, "a.md"), agent);
    assert.equal(await view.locator("[contenteditable]").count(), 1);
    assert.match(await view.locator("[contenteditable]").innerText(), /Omega\s+mine\./);
  });

  test("an agent edit during an edit does not redraw the page until the edit closes", async () => {
    const { page, host, disk, view } = await openHtml({ "a.md": doc(BODY) });
    await editAfterFirstWord(page, view.locator("p", { hasText: "Omega." }));
    host.folders.write(disk, "a.md", doc(BODY.replace("Tail.", "Agent tail.")));
    await new Promise((resolve) => setTimeout(resolve, 3000));
    assert.equal(await view.locator("[contenteditable]").count(), 1);
    await page.keyboard.press("Escape");
    await view.getByText("Agent tail.").waitFor();
  });

  test("a link click does nothing and the browser menu stays during an edit", async () => {
    const { page, view } = await openHtml({ "a.md": doc("## S\n\nSee [bee](b.md) now.\n"), "b.md": "# Bee\n" });
    await editAfterFirstWord(page, view.locator("p", { hasText: "See" }));
    await view.getByRole("link", { name: "bee" }).click();
    await view.locator("p", { hasText: "See" }).click({ button: "right" });
    assert.equal(await page.getByRole("dialog", { name: "Edit section" }).count(), 0);
    assert.equal(await page.getByRole("heading", { level: 1, name: "Bee" }).count(), 0);
    assert.equal(await view.locator("[contenteditable]").count(), 1);
  });
});

describe("right-click in the HTML view", () => {
  const BODY = "Lead one.\n\n## First\n\nAlpha.\n\n### Sub\n\nIn sub.\n\n## Second\n\nTail.\n";
  const sectionEditor = (page: Opened["page"]) => page.getByRole("dialog", { name: "Edit section" });

  test("on a paragraph under a ### opens the editor on that section only, the HTML view stays under, closing returns to it", async () => {
    const { page, view } = await openHtml({ "a.md": doc(BODY) });
    await view.getByText("In sub.").click({ button: "right" });
    const dialog = sectionEditor(page);
    await dialog.waitFor();
    const content = await dialog.getByRole("textbox", { name: "Markdown" }).innerText();
    assert.ok(content.includes("### Sub") && content.includes("In sub.") && !content.includes("Alpha.") && !content.includes("Tail."));
    assert.equal(await view.locator(".ld-html-page").count(), 1);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await view.locator(".ld-html-page").waitFor();
  });

  test("in the lead opens only the lead", async () => {
    const { page, view } = await openHtml({ "a.md": doc(BODY) });
    await view.getByText("Lead one.").click({ button: "right" });
    const dialog = sectionEditor(page);
    await dialog.waitFor();
    const content = await dialog.getByRole("textbox", { name: "Markdown" }).innerText();
    assert.ok(content.includes("Lead one.") && !content.includes("## First"));
  });

  test("with text selected, or on the title, no section editor opens", async () => {
    const { page, view } = await openHtml({ "a.md": doc(BODY) });
    await view.getByText("Tail.").dblclick();
    await view.getByText("Tail.").click({ button: "right" });
    await page.keyboard.press("Escape");
    assert.equal(await sectionEditor(page).count(), 0);
    await view.locator("h1").click({ button: "right" });
    await page.keyboard.press("Escape");
    assert.equal(await sectionEditor(page).count(), 0);
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
