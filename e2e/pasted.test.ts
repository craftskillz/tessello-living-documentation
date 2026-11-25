import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Page } from "playwright";
import { until } from "@tessello/sdk/testing";
import { useBrowser, withProject } from "./living-documentation.ts";

useBrowser();

// The first bytes of a PNG; the Test Host's disk reads back as text, where 0x89 and 0x1a show as U+FFFD and U+001A.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_ON_DISK = "�PNG\r\n\u001a\n";

type Pretend = { name: string; type: string; bytes: number[] };
const png = (name = "screenshot.png"): Pretend => ({ name, type: "image/png", bytes: PNG });
const text = (name: string, content: string): Pretend => ({ name, type: "text/plain", bytes: [...Buffer.from(content)] });

/** The User pastes (or drops) these files in the open editor, as the browser would deliver them. */
async function bring(page: Page, how: "paste" | "drop", files: Pretend[]) {
  await page.locator(".cm-content").evaluate(
    (content, { how, files }) => {
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
      // A drop lands at the end of the last line.
      const line = [...content.querySelectorAll(".cm-line")].at(-1)!.getBoundingClientRect();
      const event =
        how === "paste"
          ? new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true })
          : new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: line.right - 1, clientY: line.top + line.height / 2 });
      content.dispatchEvent(event);
    },
    { how, files },
  );
}

async function typeAtEnd(page: Page, typed: string) {
  await page.getByRole("textbox", { name: "Markdown" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(typed);
}

describe("an image pasted in the editor", () => {
  test("asks for a name proposed from the time, saves it in images/ and links it at the caret", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n" });
    const address = page.url();
    await page.getByRole("button", { name: "Edit" }).click();
    await typeAtEnd(page, "See: ");

    await bring(page, "paste", [png()]);

    const dialog = page.getByRole("dialog", { name: "Save the pasted image" });
    const name = dialog.getByRole("textbox", { name: "Name" });
    assert.match(await name.inputValue(), /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    await dialog.getByText(".png").waitFor();
    await dialog.getByText("Saved in images/").waitFor();
    await name.fill("shot");
    await dialog.getByRole("button", { name: "Save" }).click();

    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.getByText("See: ![shot](images/shot.png)").waitFor();
    assert.equal(host.folders.read(disk, "images/shot.png"), PNG_ON_DISK);
    await until(() => host.folders.read(disk, "a.md")?.includes("See: ![shot](images/shot.png)"), "the autosave");
    assert.equal(page.url(), address);
  });

  test("a name already taken keeps the dialog open, proposes the -2 name and leaves the existing image alone", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n", "images/shot.png": "OLD" });
    const address = page.url();
    await page.getByRole("button", { name: "Edit" }).click();
    await typeAtEnd(page, "x");

    await bring(page, "paste", [png()]);
    const dialog = page.getByRole("dialog", { name: "Save the pasted image" });
    const name = dialog.getByRole("textbox", { name: "Name" });
    await name.fill("shot");
    await dialog.getByRole("button", { name: "Save" }).click();

    await dialog.getByText("shot.png already exists in images/: shot-2 is proposed.").waitFor();
    assert.equal(await name.inputValue(), "shot-2");
    assert.equal(host.folders.read(disk, "images/shot.png"), "OLD");
    await dialog.getByRole("button", { name: "Save" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(host.folders.read(disk, "images/shot-2.png"), PNG_ON_DISK);
    assert.equal(host.folders.read(disk, "images/shot.png"), "OLD");
    assert.equal(page.url(), address);
  });

  test("a refused character shows the Tree's message and disables Save", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n" });
    const address = page.url();
    await page.getByRole("button", { name: "Edit" }).click();
    await typeAtEnd(page, "x");

    await bring(page, "paste", [png()]);
    const dialog = page.getByRole("dialog", { name: "Save the pasted image" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("a/b");

    await dialog.getByRole("alert").getByText("A name cannot contain / \\ : * ? \" < > |.").waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Save" }).isDisabled(), true);
    assert.equal(host.folders.read(disk, "images/a/b.png"), null);
    assert.equal(page.url(), address);
  });

  test("Cancel inserts nothing and writes nothing", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n" });
    const address = page.url();
    await page.getByRole("button", { name: "Edit" }).click();
    await typeAtEnd(page, "x");

    await bring(page, "paste", [png()]);
    const dialog = page.getByRole("dialog", { name: "Save the pasted image" });
    const proposed = await dialog.getByRole("textbox", { name: "Name" }).inputValue();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(await page.locator(".cm-content").innerText(), "# A\nx");
    assert.equal(host.folders.read(disk, `images/${proposed}.png`), null);
    assert.equal(page.url(), address);
  });

  test("in the section editor, the link is inserted in the section and saved", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# One\n\nFirst.\n\n## Two\n\nSecond.\n" });
    const address = page.url();
    await page.getByText("Second.").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit section" }).click();
    const section = page.getByRole("dialog", { name: "Edit section" });
    await section.getByRole("textbox", { name: "Markdown" }).click();
    await page.keyboard.press("ControlOrMeta+End");

    await bring(page, "paste", [png()]);
    const dialog = page.getByRole("dialog", { name: "Save the pasted image" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("two");
    await dialog.getByRole("button", { name: "Save" }).click();

    await until(() => host.folders.read(disk, "a.md")?.includes("Second.\n![two](images/two.png)"), "the section on disk");
    assert.equal(host.folders.read(disk, "images/two.png"), PNG_ON_DISK);
    assert.equal(page.url(), address);
  });

  test("in French, the dialog speaks French", async () => {
    const { page } = await withProject({ "a.md": "# A\n" }, { locale: "fr" });
    const address = page.url();
    await page.getByRole("button", { name: "Modifier" }).click();
    await typeAtEnd(page, "x");

    await bring(page, "paste", [png()]);

    const dialog = page.getByRole("dialog", { name: "Enregistrer l'image collée" });
    await dialog.getByText("Enregistrée dans images/").waitFor();
    await dialog.getByRole("textbox", { name: "Nom" }).fill("a/b");
    await dialog.getByRole("alert").getByText("Un nom ne peut pas contenir").waitFor();
    assert.equal(page.url(), address);
  });
});

describe("another file dropped in the editor", () => {
  test("goes to files/ without a question, linked relative to its Document, and never overwrites", async () => {
    const { page, host, disk } = await withProject({ "guide/intro.md": "# Intro\n" });
    const address = page.url();
    await page.getByRole("link", { name: "intro.md" }).click();
    await page.getByRole("button", { name: "Edit" }).click();
    await typeAtEnd(page, "Notes: ");

    await bring(page, "drop", [text("notes.txt", "hello")]);
    await page.getByText("Notes: [📎 notes.txt](../files/notes.txt)").waitFor();
    assert.equal(host.folders.read(disk, "files/notes.txt"), "hello");

    await page.keyboard.type(" ");
    await bring(page, "drop", [text("notes.txt", "again")]);
    await page.getByText("[📎 notes-2.txt](../files/notes-2.txt)").waitFor();
    assert.equal(host.folders.read(disk, "files/notes.txt"), "hello");
    assert.equal(host.folders.read(disk, "files/notes-2.txt"), "again");
    await until(() => host.folders.read(disk, "guide/intro.md")?.includes("[📎 notes-2.txt](../files/notes-2.txt)"), "the autosave");
    assert.equal(page.url(), address);
  });
});
