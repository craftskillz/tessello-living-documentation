import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { useBrowser, withProject } from "./living-documentation.ts";

useBrowser();

describe("autosave", () => {
  test("opening another Document right after typing saves the text before it opens", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n", "b.md": "# Bee\n" });
    const address = page.url();
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("textbox", { name: "Markdown" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("Quick.\n");

    await page.getByRole("link", { name: "b.md" }).click();

    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();
    assert.ok(host.folders.read(disk, "a.md")?.includes("Quick."));
    assert.equal(page.url(), address);
  });
});

async function typeAtEnd(page: import("playwright").Page, text: string) {
  await page.getByRole("textbox", { name: "Markdown" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
}

describe("Revert", () => {
  test("after an autosave, Revert asks, then restores the file as at Edit and shows reading", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n" });
    const address = page.url();
    await page.getByRole("button", { name: "Edit" }).click();
    await typeAtEnd(page, "Extra.\n");
    await until(() => host.folders.read(disk, "a.md")?.includes("Extra."), "the autosave");

    await page.getByRole("button", { name: "Revert" }).click();
    const dialog = page.getByRole("dialog", { name: "Revert your changes?" });
    await dialog.getByText("The document goes back to how it was when you clicked Edit.").waitFor();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await page.getByRole("textbox", { name: "Markdown" }).waitFor();
    assert.ok(host.folders.read(disk, "a.md")?.includes("Extra."));

    await page.getByRole("button", { name: "Revert" }).click();
    await dialog.getByRole("button", { name: "Revert" }).click();

    await page.getByRole("button", { name: "Edit", exact: true }).waitFor();
    assert.equal(host.folders.read(disk, "a.md"), "# A\n\nFirst.\n");
    assert.equal(await page.getByText("Extra.").count(), 0);
    assert.equal(page.url(), address);
  });

  test("without changes, Revert closes without asking", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n" });
    const address = page.url();
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("textbox", { name: "Markdown" }).waitFor();

    await page.getByRole("button", { name: "Revert" }).click();

    await page.getByRole("button", { name: "Edit", exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(host.folders.read(disk, "a.md"), "# A\n\nFirst.\n");
    assert.equal(page.url(), address);
  });

  test("in French, the dialog speaks French", async () => {
    const { page } = await withProject({ "a.md": "# A\n\nFirst.\n" }, { locale: "fr" });
    const address = page.url();
    await page.getByRole("button", { name: "Modifier" }).click();
    await typeAtEnd(page, "Plus.\n");

    await page.getByRole("button", { name: "Annuler les modifications" }).click();

    const dialog = page.getByRole("dialog", { name: "Annuler vos modifications ?" });
    await dialog.getByText("Le document revient à son état au moment où vous avez cliqué sur Modifier.").waitFor();
    await dialog.getByRole("button", { name: "Continuer à modifier" }).waitFor();
    assert.equal(page.url(), address);
  });
});

describe("a conflict", () => {
  test("Compare lists my line next to the disk's; Take theirs copies mine and loads theirs; nothing is written meanwhile", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nMine.\n" });
    const address = page.url();
    await page.getByRole("button", { name: "Edit" }).click();
    host.folders.write(disk, "a.md", "# A\n\nTheirs.\n");
    await typeAtEnd(page, "More.\n");

    const banner = page.getByRole("alert");
    await banner.getByText("This document changed on disk since you started editing.").waitFor();
    await banner.getByRole("button", { name: "Compare" }).click();
    const row = page.getByRole("region", { name: "Compare" }).getByRole("row").filter({ hasText: "Theirs." });
    await row.getByText("Mine.").waitFor();
    await typeAtEnd(page, "Again.\n");
    await page.waitForTimeout(1500);
    assert.equal(host.folders.read(disk, "a.md"), "# A\n\nTheirs.\n");

    await banner.getByRole("button", { name: "Take theirs" }).click();

    await page.getByRole("textbox", { name: "Markdown" }).getByText("Theirs.").waitFor();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied.includes("Mine.") && copied.includes("Again."));
    assert.equal(host.folders.read(disk, "a.md"), "# A\n\nTheirs.\n");
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.equal(page.url(), address);
  });
});

describe("the section editor", () => {
  const file = "# One\r\n\r\nFirst.\r\n\r\n## Two\r\n\r\nSecond.\r\n\r\n### Two B\r\n\r\nDeep.\r\n\r\n## Three\r\n\r\nThird.\r\n";

  test("right-click on a paragraph edits its section only; the rest of the file stays byte-identical", async () => {
    const { page, host, disk } = await withProject({ "a.md": file });
    const address = page.url();
    await page.getByText("Second.").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit section" }).click();

    const dialog = page.getByRole("dialog", { name: "Edit section" });
    await dialog.getByText("Edit this section and its subsections.").waitFor();
    const editor = dialog.getByRole("textbox", { name: "Markdown" });
    const content = await editor.innerText();
    assert.ok(content.includes("Two") && content.includes("Deep.") && !content.includes("Third.") && !content.includes("First."));
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("Typed here.");

    await dialog.getByText("Typed here.").last().waitFor();
    await until(() => host.folders.read(disk, "a.md")?.includes("Typed here."), "the section on disk");
    const saved = host.folders.read(disk, "a.md")!;
    assert.ok(saved.startsWith("# One\r\n\r\nFirst.\r\n\r\n## Two"));
    assert.ok(saved.endsWith("Typed here.\r\n\r\n## Three\r\n\r\nThird.\r\n"));
    assert.ok(!/[^\r]\n/.test(saved));

    await page.keyboard.press("ControlOrMeta+Enter");
    await dialog.waitFor({ state: "detached" });
    await page.getByText("Typed here.").waitFor();
    assert.equal(page.url(), address);
  });

  test("a conflict shows the banner in the dialog; Keep mine overwrites", async () => {
    const { page, host, disk } = await withProject({ "a.md": file });
    const address = page.url();
    await page.getByText("Second.").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit section" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit section" });
    host.folders.write(disk, "a.md", "# One\n\nTheirs.\n");
    await dialog.getByRole("textbox", { name: "Markdown" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("Mine!");

    await dialog.getByRole("alert").getByText("This document changed on disk since you started editing.").waitFor();
    await dialog.getByRole("alert").getByRole("button", { name: "Keep mine" }).click();

    await until(() => host.folders.read(disk, "a.md")?.includes("Mine!"), "my section on disk");
    assert.equal(page.url(), address);
  });

  test("no Edit section while the whole Document is edited", async () => {
    const { page } = await withProject({ "a.md": file });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    assert.equal(await page.getByRole("menuitem").count(), 0);
  });
});

describe("a pending conflict", () => {
  test("opening another Document says to choose first, and stays", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nMine.\n", "b.md": "# Bee\n" });
    const address = page.url();
    await page.getByRole("button", { name: "Edit" }).click();
    host.folders.write(disk, "a.md", "# A\n\nTheirs.\n");
    await page.getByRole("alert").getByText("changed on disk").waitFor();

    await page.getByRole("link", { name: "b.md" }).click();

    await page.getByText("choose Keep mine or Take theirs before leaving it").waitFor();
    await page.getByRole("textbox", { name: "Markdown" }).waitFor();
    assert.equal(await page.getByRole("heading", { level: 1, name: "Bee" }).count(), 0);
    assert.equal(page.url(), address);
  });

  test("Revert restores the file as at Edit over the disk's change", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n" });
    const address = page.url();
    await page.getByRole("button", { name: "Edit" }).click();
    await typeAtEnd(page, "Extra.\n");
    await until(() => host.folders.read(disk, "a.md")?.includes("Extra."), "the autosave");
    host.folders.write(disk, "a.md", "# A\n\nTheirs.\n");
    await page.getByRole("alert").getByText("changed on disk").waitFor();

    await page.getByRole("button", { name: "Revert" }).click();
    await page.getByRole("dialog", { name: "Revert your changes?" }).getByRole("button", { name: "Revert" }).click();

    await page.getByRole("button", { name: "Edit", exact: true }).waitFor();
    assert.equal(host.folders.read(disk, "a.md"), "# A\n\nFirst.\n");
    assert.equal(page.url(), address);
  });
});

describe("the section editor's preview", () => {
  test("shows the section's Images, read from the Project like the reading", async () => {
    // A 1x1 PNG.
    const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64"));
    const { page } = await withProject({ "guide/deep/a.md": "# One\n\nSee below.\n\n![a dot](../../images/dot.png)\n", "images/dot.png": png });
    const address = page.url();
    await page.getByText("See below.").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit section" }).click();

    const preview = page.getByRole("dialog", { name: "Edit section" }).getByRole("region", { name: "Preview" });
    await until(
      () => preview.getByRole("img", { name: "a dot" }).evaluate((img: HTMLImageElement) => img.src.startsWith("blob:") && img.complete && img.naturalWidth > 0).catch(() => false),
      "the image in the preview",
    );
    assert.equal(page.url(), address);
  });
});
