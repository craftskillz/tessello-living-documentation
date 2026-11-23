import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { useBrowser, withProject } from "./living-documentation.ts";

useBrowser();

const filler = "\n\nFiller paragraph.".repeat(80);

describe("links between Documents", () => {
  test("a relative link opens its Document at the anchor; Back returns", async () => {
    const { page } = await withProject({
      "a.md": "# Alpha\n\nSee [the details](guide/b.md#deep-part).\n",
      "guide/b.md": `# Bee\n${filler}\n\n## Deep part\n\nHere.\n`,
    });
    const address = page.url();
    await page.getByRole("link", { name: "a.md", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "Alpha" }).waitFor();

    await page.getByRole("link", { name: "the details" }).click();

    const heading = page.getByRole("heading", { name: "Deep part" });
    await heading.waitFor();
    await page.waitForFunction(() => {
      const box = document.getElementById("deep-part")!.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    });
    assert.equal(page.url(), address);

    await page.getByRole("button", { name: "← Alpha" }).click();
    await page.getByRole("heading", { level: 1, name: "Alpha" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "← Alpha" }).count(), 0);
    assert.equal(page.url(), address);
  });

  test("a ?doc= link opens its Document, and a trail of two goes back step by step", async () => {
    const { page } = await withProject({
      "a.md": "# Alpha\n\n[to bee](?doc=b)\n",
      "b.md": "# Bee\n\n[to cee](?doc=c)\n",
      "c.md": "# Cee\n",
    });
    const address = page.url();
    await page.getByRole("link", { name: "a.md", exact: true }).click();
    await page.getByRole("link", { name: "to bee" }).click();
    await page.getByRole("link", { name: "to cee" }).click();
    await page.getByRole("heading", { level: 1, name: "Cee" }).waitFor();

    await page.getByRole("button", { name: "← Alpha" }).click();
    await page.getByRole("heading", { level: 1, name: "Alpha" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "← Bee" }).count(), 0);
    assert.equal(page.url(), address);
  });

  test("opening a Document from the Tree clears the trail", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n[to bee](b.md)\n", "b.md": "# Bee\n" });
    const address = page.url();
    await page.getByRole("link", { name: "a.md", exact: true }).click();
    await page.getByRole("link", { name: "to bee" }).click();
    await page.getByRole("button", { name: "← Alpha" }).waitFor();

    await page.getByRole("navigation", { name: "Documents" }).getByRole("link", { name: "b.md" }).click();

    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();
    assert.equal(await page.getByRole("button", { name: /^←/ }).count(), 0);
    assert.equal(page.url(), address);
  });

  test("a link to the open Document moves within it, without a trail entry", async () => {
    const { page } = await withProject({ "a.md": `# Alpha\n\n[self](a.md#the-end)\n${filler}\n\n## The end\n` });
    const address = page.url();
    await page.getByRole("link", { name: "self" }).click();
    await page.waitForFunction(() => document.getElementById("the-end")!.getBoundingClientRect().bottom <= window.innerHeight);
    assert.equal(await page.getByRole("button", { name: /^←/ }).count(), 0);
    assert.equal(page.url(), address);
  });

  test("a link to a missing Document shows a message and keeps the Document", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n[lost](nowhere.md)\n" });
    const address = page.url();
    await page.getByRole("link", { name: "lost" }).click();
    await page.getByText("The linked document “nowhere.md” does not exist. Fix the link in this document.").waitFor();
    await page.getByRole("heading", { level: 1, name: "Alpha" }).waitFor();
    assert.equal(page.url(), address);
  });

  test("a failure followed from far down the Document shows in view, until closed", async () => {
    const { page } = await withProject({ "a.md": `# Alpha\n${filler}\n\n[lost](nowhere.md)\n` });
    const link = page.getByRole("link", { name: "lost" });
    await link.scrollIntoViewIfNeeded();
    await link.click();
    const message = page.getByRole("status").filter({ hasText: "“nowhere.md” does not exist" });
    await message.waitFor();
    const box = (await message.boundingBox())!;
    const viewport = page.viewportSize()!;
    assert.ok(box.y >= 0 && box.y + box.height <= viewport.height, "the message is inside the viewport");
    await message.getByRole("button", { name: "Close" }).click();
    await message.waitFor({ state: "detached" });
  });

  test("a same-Document anchor scrolls to its heading", async () => {
    const { page } = await withProject({ "a.md": `# Alpha\n\n[down](#the-end)\n${filler}\n\n## The end\n` });
    const address = page.url();
    await page.getByRole("link", { name: "down" }).click();
    await page.waitForFunction(() => document.getElementById("the-end")!.getBoundingClientRect().bottom <= window.innerHeight);
    assert.equal(page.url(), address);
  });

  test("a link to another file says it is not available yet", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n[data](data.csv)\n", "data.csv": "x" });
    const address = page.url();
    await page.getByRole("link", { name: "data", exact: true }).click();
    await page.getByText("Opening other files (“data.csv”) is not available yet. Open it from your file manager.").waitFor();
    assert.equal(page.url(), address);
  });

  test("an external link opens a new tab and the View does not navigate", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n[out](https://example.com/)\n" });
    const address = page.url();
    const popup = page.waitForEvent("popup");
    await page.getByRole("link", { name: "out" }).click();
    await popup;
    assert.equal(page.url(), address);
  });

  test("in French, texts and failures are translated", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n[perdu](rien.md)\n" }, { locale: "fr" });
    const address = page.url();
    await page.getByRole("link", { name: "perdu" }).click();
    await page.getByText("Le document lié « rien.md » n'existe pas. Corrigez le lien dans ce document.").waitFor();
    assert.equal(page.url(), address);
  });

  test("in French, the back trail and the other-file message are translated", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n[b](b.md) [f](f.csv)\n", "b.md": "# Bee\n", "f.csv": "x" }, { locale: "fr" });
    const address = page.url();
    await page.getByRole("link", { name: "f", exact: true }).click();
    await page.getByText("L'ouverture des autres fichiers (« f.csv »)").waitFor();
    await page.getByRole("link", { name: "b", exact: true }).click();
    await page.getByRole("group", { name: "Retour vers" }).getByRole("button", { name: "← Alpha" }).waitFor();
    assert.equal(page.url(), address);
  });
});

// A 1x1 PNG.
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64"));

describe("images", () => {
  test("an image of the Project shows from an object URL", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n![a dot](images/dot.png)\n", "images/dot.png": PNG });
    const address = page.url();
    await page.getByRole("link", { name: "a.md", exact: true }).click();
    const image = page.getByRole("img", { name: "a dot" });
    await page.waitForFunction(() => {
      const img = document.querySelector<HTMLImageElement>("img[data-image]");
      return !!img && img.src.startsWith("blob:") && img.complete && img.naturalWidth > 0;
    });
    assert.equal(await image.count(), 1);
    assert.equal(page.url(), address);
  });

  test("a missing image shows its alt text and a missing mark", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n![the lost one](images/x.png)\n" });
    const address = page.url();
    await page.getByRole("link", { name: "a.md", exact: true }).click();
    const mark = page.locator(".image-missing");
    await mark.waitFor();
    assert.equal(await mark.innerText(), "the lost one");
    assert.equal(await mark.getAttribute("title"), "Image not found: images/x.png. Fix the link or add the image to the folder.");
    assert.equal(page.url(), address);
  });

  test("the object URL is released when the Document changes", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n\n![a dot](dot.png)\n", "b.md": "# Bee\n", "dot.png": PNG });
    const address = page.url();
    await page.getByRole("link", { name: "a.md", exact: true }).click();
    const handle = await page.waitForFunction(() => {
      const img = document.querySelector<HTMLImageElement>("img[data-image]");
      return img?.src.startsWith("blob:") && img.complete && img.src;
    });
    const url = (await handle.jsonValue()) as string;

    await page.getByRole("link", { name: "b.md", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();

    const loads = await page.evaluate((u) => fetch(u).then(() => true, () => false), url);
    assert.equal(loads, false);
    assert.equal(page.url(), address);
  });
});

describe("the stylesheet", () => {
  test("follows the Host theme, light and dark", async () => {
    const { page, host } = await withProject({ "a.md": "# Alpha\n\nText.\n" });
    const address = page.url();
    await page.getByRole("heading", { level: 1, name: "Alpha" }).waitFor();
    const color = () => page.evaluate(() => getComputedStyle(document.querySelector("article.document h1")!).color);
    assert.equal(await color(), "rgb(17, 24, 39)");

    host.setTheme("dark");

    await page.waitForFunction(() => getComputedStyle(document.querySelector("article.document h1")!).color === "rgb(255, 255, 255)");
    assert.equal(page.url(), address);
  });
});
