import assert from "node:assert/strict";
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

describe("the reading header", () => {
  test("Copy path copies the Document's path in the Project and confirms", async () => {
    const { page } = await project({ "guide/intro.md": "# Intro\n\nHello.\n" });
    const address = page.url();
    await page.getByRole("heading", { level: 1, name: "Intro" }).waitFor();

    await page.getByRole("button", { name: "Copy path" }).click();

    await page.getByRole("status").getByText("Path copied").waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "guide/intro.md");
    assert.equal(page.url(), address);
  });

  test("Delete is enabled; Edit still edits", async () => {
    const { page } = await project({ "a.md": "# A\n" });
    const remove = page.getByRole("button", { name: "Delete" });
    await remove.waitFor();
    assert.equal(await remove.isDisabled(), false);
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("textbox", { name: "Markdown" }).waitFor();
  });

  test("the labels of the header are in French in a French Host", async () => {
    const { page } = await project({ "a.md": "# A\n\n## Sous-titre\n" }, { locale: "fr" });
    for (const name of ["Copier le chemin", "Lignes", "Fond blanc", "Table des matières", "Modifier", "Supprimer"]) {
      await page.getByRole("button", { name }).waitFor();
    }
    await page.getByRole("button", { name: "Table des matières" }).click();
    await page.getByRole("complementary", { name: "Sur cette page" }).waitFor();
    await page.getByRole("button", { name: "Copier le chemin" }).click();
    await page.getByRole("status").getByText("Chemin copié").waitFor();
  });
});

/** The labels now, one `tag:label` per labelled top-level block. */
const labels = (page: Opened["page"]) =>
  page.evaluate(() => [...document.querySelectorAll("article > [data-line-label]")].map((each) => `${each.tagName.toLowerCase()}:${each.getAttribute("data-line-label")}`));

/** Waits until the labelled blocks are exactly `expected` (the labels follow a render and a setting change). */
async function labelsAre(page: Opened["page"], expected: string[]) {
  const wanted = JSON.stringify(expected);
  await page.waitForFunction(
    (json) => JSON.stringify([...document.querySelectorAll("article > [data-line-label]")].map((each) => `${each.tagName.toLowerCase()}:${each.getAttribute("data-line-label")}`)) === json,
    wanted,
  );
}

describe("Lines", () => {
  test("each block names its file lines, and it is remembered across a reload", async () => {
    const { page } = await project({ "a.md": "# Top\n\nIntro.\n\n## Two\n\nfirst line\nsecond line\n\n- one\n- two\n" });
    const address = page.url();
    await page.getByRole("heading", { level: 1, name: "Top" }).waitFor();
    assert.deepEqual(await labels(page), []);

    await page.getByRole("button", { name: "Lines" }).click();

    await labelsAre(page, ["h1:1", "p:3", "h2:5", "p:7-8", "ul:10-11"]);
    assert.equal(await page.getByRole("button", { name: "Lines" }).getAttribute("aria-pressed"), "true");

    await page.reload();
    await page.getByRole("heading", { level: 1, name: "Top" }).waitFor();
    await page.waitForFunction(() => document.querySelector("article > h1")?.getAttribute("data-line-label") === "1");
    assert.equal(page.url(), address);
  });

  test("the labels follow the Document when it changes, and leave when Lines is off", async () => {
    const { page, host, disk } = await project({ "a.md": "# Top\n\nOld.\n" });
    await page.getByRole("button", { name: "Lines" }).click();
    await page.waitForFunction(() => document.querySelector("article > p")?.getAttribute("data-line-label") === "3");

    host.folders.write(disk, "a.md", "# Top\n\nNew.\n\nMore.\n");

    await page.getByText("More.").waitFor();
    await labelsAre(page, ["h1:1", "p:3", "p:5"]);
    await page.getByRole("button", { name: "Lines" }).click();
    await labelsAre(page, []);
  });

  test("the labels never enter the text read from the article", async () => {
    const { page } = await project({ "a.md": "# Top\n\nBody.\n" });
    await page.getByRole("button", { name: "Lines" }).click();
    await page.waitForFunction(() => document.querySelector("article > p")?.hasAttribute("data-line-label"));
    assert.equal(await page.locator("article").innerText(), "Top\n\nBody.");
  });
});

describe("White background", () => {
  test("the reading area is pure white, also in a dark Host, and it is remembered", async () => {
    const { page, host } = await project({ "a.md": "# Top\n\nBody.\n" });
    host.setTheme("dark");
    await page.waitForFunction(() => document.documentElement.dataset.mode === "dark");
    const background = (selector: string) => page.locator(selector).evaluate((each) => getComputedStyle(each).backgroundColor);
    assert.notEqual(await background("main"), "rgb(255, 255, 255)");

    await page.getByRole("button", { name: "White background" }).click();

    await page.waitForFunction(() => getComputedStyle(document.querySelector("main")!).backgroundColor === "rgb(255, 255, 255)");
    assert.equal(await page.locator("article").evaluate((each) => getComputedStyle(each).color), "rgb(55, 65, 81)");

    await page.reload();
    await page.getByRole("heading", { level: 1, name: "Top" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "White background" }).getAttribute("aria-pressed"), "true");
    assert.equal(await background("main"), "rgb(255, 255, 255)");
  });
});

describe("the table of contents", () => {
  const guide = "# Guide\n\n## Setup\n\nText.\n\n### Install\n\nMore.\n\n## Usage\n" + "\n\nFiller paragraph.".repeat(80) + "\n\n## The end\n\nLast.\n";

  test("lists the headings by level; a click scrolls to one, opening folded sections", async () => {
    const { page } = await project({ "a.md": guide });
    const address = page.url();
    await page.getByRole("heading", { level: 1, name: "Guide" }).waitFor();
    assert.equal(await page.getByRole("complementary").count(), 0);

    await page.getByRole("button", { name: "Table of contents" }).click();

    const toc = page.getByRole("complementary", { name: "On this page" });
    await toc.getByText("On this page", { exact: true }).waitFor();
    assert.deepEqual(await toc.getByRole("button").allInnerTexts(), ["Guide", "Setup", "Install", "Usage", "The end"]);
    await toc.getByRole("button", { name: "The end" }).click();
    await page.waitForFunction(() => document.getElementById("the-end")!.getBoundingClientRect().bottom <= window.innerHeight);
    assert.equal(page.url(), address);
  });

  test("a heading inside a closed section opens it", async () => {
    const { page } = await project({ "a.md": "# Guide\n\n<details>\n<summary>More</summary>\n\n## Hidden part\n\nInside.\n\n</details>\n" });
    await page.getByRole("heading", { level: 1, name: "Guide" }).waitFor();
    await page.getByRole("button", { name: "Table of contents" }).click();
    await page.getByRole("complementary", { name: "On this page" }).getByRole("button", { name: "Hidden part" }).click();
    await page.getByRole("heading", { name: "Hidden part" }).waitFor({ state: "visible" });
  });

  test("it follows the Document when it changes, and is absent without a heading", async () => {
    const { page, host, disk } = await project({ "a.md": guide });
    await page.getByRole("button", { name: "Table of contents" }).click();
    const toc = page.getByRole("complementary", { name: "On this page" });
    await toc.getByRole("button", { name: "Usage" }).waitFor();

    host.folders.write(disk, "a.md", "# Guide\n\n## Changed\n");
    await toc.getByRole("button", { name: "Changed" }).waitFor();
    assert.equal(await toc.getByRole("button", { name: "Usage" }).count(), 0);

    host.folders.write(disk, "a.md", "Just text.\n");
    await page.getByText("Just text.").waitFor();
    assert.equal(await page.getByRole("complementary").count(), 0);
  });

  test("it stays open across a reload; dragging its edge resizes it within 160-400 px and keeps the width", async () => {
    const { page } = await project({ "a.md": guide });
    await page.getByRole("button", { name: "Table of contents" }).click();
    const toc = page.getByRole("complementary", { name: "On this page" });
    await toc.waitFor();
    const width = async () => Math.round((await toc.boundingBox())!.width);
    const initial = await width();

    const handle = (await toc.getByRole("separator").boundingBox())!;
    const [x, y] = [handle.x + handle.width / 2, handle.y + 20];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 60, y, { steps: 5 });
    await page.mouse.up();
    assert.equal(await width(), initial + 60);

    const edge = (await toc.getByRole("separator").boundingBox())!;
    await page.mouse.move(edge.x + 2, y);
    await page.mouse.down();
    await page.mouse.move(0, y, { steps: 5 });
    await page.mouse.up();
    assert.equal(await width(), 400);

    await page.reload();
    await page.getByRole("complementary", { name: "On this page" }).waitFor();
    assert.equal(await width(), 400);
  });
});

describe("images and tables", () => {
  const png = Uint8Array.from(
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAr7ZKX0AAAAASUVORK5CYII=", "base64"),
  );
  const files = {
    "a.md": "# Pics\n\n![A red square](pic.png)\n\nOutside text.\n\n| Name | Link |\n|:-----|------|\n| **Bold**[^1] | [site](https://example.com) |\n| [Other](b.md) | x y |\n\n[^1]: Note\n",
    "b.md": "# Bee\n",
    "pic.png": png,
  };

  test("Shift + click enlarges an image in a dialog named by its alt; Escape closes it", async () => {
    const { page } = await project(files);
    const address = page.url();
    const image = page.getByRole("img", { name: "A red square" });
    await image.waitFor();
    await page.waitForFunction(() => document.querySelector<HTMLImageElement>("article img")?.complete && document.querySelector<HTMLImageElement>("article img")!.naturalWidth > 0);

    await image.click({ modifiers: ["Shift"] });

    const dialog = page.getByRole("dialog", { name: "A red square" });
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });

    await image.click({ modifiers: ["Shift"] });
    await dialog.waitFor();
    await dialog.click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(page.url(), address);
  });

  test("a plain click on an image does not enlarge it", async () => {
    const { page } = await project(files);
    await page.getByRole("img", { name: "A red square" }).click();
    assert.equal(await page.getByRole("dialog").count(), 0);
  });

  test("right-click on an image offers Copy image, which puts a PNG on the clipboard", async () => {
    const { page } = await project(files);
    const address = page.url();
    const image = page.getByRole("img", { name: "A red square" });
    await page.waitForFunction(() => document.querySelector<HTMLImageElement>("article img")?.naturalWidth! > 0);

    await image.click({ button: "right" });
    await page.getByRole("menu").getByRole("menuitem", { name: "Copy image" }).click();

    await page.getByRole("status").getByText("Image copied to clipboard").waitFor();
    assert.deepEqual(await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((item) => item.types)), ["image/png"]);
    assert.equal(page.url(), address);
  });

  test("right-click on a table offers Copy table: clean HTML and tab-separated text, no links of the Project", async () => {
    const { page } = await project(files);
    await page.getByRole("table").waitFor();

    await page.getByRole("table").getByText("Name").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy table" }).click();

    await page.getByRole("status").getByText("Table copied to clipboard").waitFor();
    const copied = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      return { types: item!.types, html: await (await item!.getType("text/html")).text(), text: await (await item!.getType("text/plain")).text() };
    });
    assert.deepEqual([...copied.types].sort(), ["text/html", "text/plain"]);
    assert.equal(copied.text, "Name\tLink\nBold\tsite\nOther\tx y");
    assert.match(copied.html, /<th style="[^"]*font-weight: bold[^"]*text-align: left[^"]*">Name<\/th>/);
    assert.match(copied.html, /<a href="https:\/\/example.com\/">site<\/a>/);
    assert.doesNotMatch(copied.html, /data-|b\.md|<sup|role=/);
  });

  test("the menu closes with Escape or a click elsewhere; a right-click elsewhere shows no menu of ours", async () => {
    const { page } = await project(files);
    await page.getByRole("table").waitFor();
    await page.getByRole("table").getByText("Name").click({ button: "right" });
    await page.getByRole("menu").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "hidden" });

    await page.getByRole("table").getByText("Name").click({ button: "right" });
    await page.getByRole("menu").waitFor();
    await page.getByText("Outside text.").click();
    await page.getByRole("menu").waitFor({ state: "hidden" });

    // Elsewhere the menu offers Edit section, but no copy.
    await page.getByText("Outside text.").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit section" }).waitFor();
    assert.equal(await page.getByRole("menuitem", { name: /^Copy / }).count(), 0);
  });

  test("a copy that the browser refuses is told as a failure", async () => {
    const { page } = await project(files);
    await page.getByRole("table").waitFor();
    await page.evaluate(() => {
      navigator.clipboard.write = () => Promise.reject(new Error("denied"));
    });
    await page.getByRole("table").getByText("Name").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy table" }).click();
    await page.getByRole("status").getByText("The table could not be copied.").waitFor();
  });
});

describe("a Folder manifest", () => {
  test("opens read-only from its params: its YAML first, Lines from line 1, no Edit or Delete", async () => {
    const { page, host } = await project({
      "guide/intro.md": "# Intro\n",
      "guide/liv-doc-main.md": "---\ntitle: Guide\ncolor: blue\n---\n\nAbout the guide.\n",
    });
    const address = page.url();
    await page.getByRole("heading", { level: 1, name: "Intro" }).waitFor();
    const projectId = ((await host.storage.get("projects")) as { active: string }).active;
    assert.equal(await page.getByRole("link", { name: "liv-doc-main.md" }).count(), 0);

    host.openView({ project: projectId, doc: "guide/liv-doc-main.md" });

    await page.getByText("About the guide.").waitFor();
    await page.getByText("Read-only", { exact: true }).waitFor();
    await page.locator("article pre").getByText("color: blue").waitFor();
    assert.equal(await page.getByRole("button", { name: "Edit" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Delete" }).count(), 0);
    await page.getByRole("button", { name: "Copy path" }).waitFor();
    await page.getByRole("button", { name: "Table of contents" }).waitFor();

    await page.getByRole("button", { name: "Lines" }).click();
    await labelsAre(page, ["pre:1-4", "p:6"]);

    await page.getByRole("button", { name: "Copy path" }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "guide/liv-doc-main.md");
    assert.equal(page.url(), address);
  });
});

describe("the header stays on top", () => {
  const long = "# Long\n" + "\n\nFiller paragraph.".repeat(120) + "\n\n## End\n\nLast.\n";
  const onScreen = (page: Opened["page"], name: string) =>
    page.waitForFunction((label) => {
      const button = [...document.querySelectorAll("button")].find((each) => each.textContent?.trim() === label)!;
      const box = button.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight && document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === button;
    }, name);

  test("while reading, the actions stay visible at the end of a long Document", async () => {
    const { page } = await project({ "a.md": long });
    await page.getByRole("heading", { level: 1, name: "Long" }).waitFor();

    await page.getByText("Last.").scrollIntoViewIfNeeded();

    await onScreen(page, "Copy path");
    await onScreen(page, "Delete");
  });

  test("while editing, Done stays visible; Saving… shows only during a save, and nothing says Saved", async () => {
    const { page, host, disk } = await project({ "a.md": long });
    await page.getByRole("button", { name: "Edit" }).click();
    const editor = page.getByRole("textbox", { name: "Markdown" });
    await editor.waitFor();
    assert.equal(await page.getByText(/^(Saved|Saving…)$/).count(), 0);

    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("Added.\n");

    await onScreen(page, "Done");
    await until(() => host.folders.read(disk, "a.md")?.includes("Added."), "the change on disk");
    await page.getByText("Saving…").waitFor({ state: "detached" });
    assert.equal(await page.getByText("Saved", { exact: true }).count(), 0);
  });
});
