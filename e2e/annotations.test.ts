import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import type { Page } from "playwright";
import { openView, useBrowser, withProject as connected } from "./living-documentation.ts";

useBrowser();

// In the Host, the View is an about:srcdoc page: no journey may change its address.
let opened: { page: Page; address: string } | null = null;
const withProject: typeof connected = async (...args) => {
  const project = await connected(...args);
  watch(project.page);
  return project;
};
const watch = (page: Page) => {
  opened = { page, address: page.url() };
};
afterEach(() => {
  if (opened) assert.equal(opened.page.url(), opened.address, "the page address changed");
  opened = null;
});

const FILE = ".annotations.json";
const SENTENCE = "The quick brown fox jumps over the lazy dog.";
const doc = `# Intro\n\n${SENTENCE}\n`;
const note = (extra: Record<string, unknown> = {}) => ({
  id: "n1",
  selectedText: "brown fox",
  contextBefore: "The quick",
  contextAfter: "jumps over the lazy dog.",
  note: "Which fox?\nBe precise.",
  createdAt: "2026-03-05T12:00:00.000Z",
  ...extra,
});
const stored = (...entries: Record<string, unknown>[]) => JSON.stringify({ "a": entries });

const marker = (page: Page) => page.getByRole("button", { name: /^(Marker|Marqueur)$/ });
const marks = (page: Page) => page.locator("article.document mark.ld-annotation");
const column = (page: Page) => page.getByRole("group", { name: /^(Annotations|Annotations)$/ });
const columnButtons = (page: Page) => column(page).getByRole("button");
const state = (page: Page) => marker(page).getAttribute("data-state");

/** Selects `text` in the article as the User's drag would, and releases the mouse over it. */
async function select(page: Page, text: string) {
  await page.evaluate((wanted) => {
    const article = document.querySelector("article.document")!;
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const at = node.data.indexOf(wanted);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + wanted.length);
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      node.parentElement!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      return;
    }
    throw new Error(`"${wanted}" not found`);
  }, text);
}

const read = (host: { folders: { read(disk: never, path: string): string | null | undefined } }, disk: unknown) => {
  const text = host.folders.read(disk as never, FILE);
  return text ? JSON.parse(text) : null;
};

describe("creating an annotation", () => {
  test("with the Marker active, a selection opens the popup; Save stays off while the note is blank; Save writes the file and marks the passage", async () => {
    const { page, host, disk } = await withProject({ "a.md": doc });
    await page.getByRole("heading", { level: 1, name: "Intro" }).waitFor();
    assert.equal(await state(page), "normal");
    await marker(page).click();
    assert.equal(await state(page), "active");

    await select(page, "brown fox");

    const popup = page.getByRole("dialog", { name: "New annotation" });
    await popup.waitFor();
    await popup.getByText("brown fox").waitFor();
    const save = popup.getByRole("button", { name: "Save" });
    const text = popup.getByPlaceholder("Your comment or suggestion…");
    assert.equal(await text.evaluate((el) => el === document.activeElement), true);
    assert.equal(await save.isDisabled(), true);
    await text.fill("   ");
    assert.equal(await save.isDisabled(), true);
    await text.fill("Which fox?");
    assert.equal(await save.isDisabled(), false);
    await save.click();

    await popup.waitFor({ state: "detached" });
    await marks(page).first().waitFor();
    assert.equal(await marks(page).allInnerTexts().then((all) => all.join("")), "brown fox");
    await columnButtons(page).first().waitFor();
    const file = read(host, disk);
    assert.deepEqual(Object.keys(file), ["a"]);
    assert.equal(file.a.length, 1);
    const [saved] = file.a;
    assert.deepEqual(Object.keys(saved).sort(), ["contextAfter", "contextBefore", "createdAt", "id", "note", "selectedText"]);
    assert.equal(saved.selectedText, "brown fox");
    assert.equal(saved.note, "Which fox?");
    assert.ok(saved.contextBefore.endsWith("The quick"), saved.contextBefore);
    assert.ok(saved.contextAfter.startsWith("jumps over"), saved.contextAfter);
  });

  test("Cancel closes the popup and writes nothing", async () => {
    const { page, host, disk } = await withProject({ "a.md": doc });
    await page.getByRole("heading", { level: 1, name: "Intro" }).waitFor();
    await marker(page).click();
    await select(page, "lazy dog");
    const popup = page.getByRole("dialog", { name: "New annotation" });
    await popup.getByRole("button", { name: "Cancel" }).click();
    await popup.waitFor({ state: "detached" });
    assert.equal(read(host, disk), null);
    assert.equal(await marks(page).count(), 0);
  });

  test("outside the Active Marker a selection opens nothing", async () => {
    const { page } = await withProject({ "a.md": doc });
    await page.getByRole("heading", { level: 1, name: "Intro" }).waitFor();
    await select(page, "lazy dog");
    assert.equal(await page.getByRole("dialog", { name: "New annotation" }).count(), 0);
  });

  test("a malformed .annotations.json: Save shows a translated failure and the popup stays open", async () => {
    const { page, host, disk } = await withProject({ "a.md": doc, [FILE]: "{ not json" });
    await page.getByRole("heading", { level: 1, name: "Intro" }).waitFor();
    await marker(page).click();
    await select(page, "brown fox");
    const popup = page.getByRole("dialog", { name: "New annotation" });
    await popup.getByPlaceholder("Your comment or suggestion…").fill("Oops");
    await popup.getByRole("button", { name: "Save" }).click();

    await page.getByText("The file .annotations.json is not valid JSON. Fix it, then try again.").waitFor();
    assert.equal(await popup.count(), 1);
    assert.equal(host.folders.read(disk, FILE), "{ not json");
  });
});

describe("showing annotations", () => {
  test("an annotation of the original's file shows a mark and a yellow column button; hovering shows the note and the date", async () => {
    const { page } = await withProject({ "a.md": doc, [FILE]: stored(note()) });
    await marks(page).first().waitFor();
    assert.equal(await marks(page).allInnerTexts().then((all) => all.join("")), "brown fox");
    assert.equal(await marks(page).first().evaluate((el) => getComputedStyle(el).backgroundColor), "rgba(250, 204, 21, 0.5)");
    const button = columnButtons(page).first();
    await button.waitFor();
    assert.equal(await columnButtons(page).count(), 1);
    assert.equal(await button.getAttribute("data-state"), "placed");
    assert.equal((await button.getAttribute("aria-label"))?.startsWith("Which fox?"), true);

    await button.hover();
    const popup = page.getByRole("tooltip");
    await popup.getByText("Be precise.").waitFor();
    await popup.getByText("Mar 5, 2026").waitFor();
    await page.mouse.move(5, 5);
    await popup.waitFor({ state: "detached" });

    await marks(page).first().hover();
    await page.getByRole("tooltip").getByText("Which fox?").waitFor();
  });

  test("a passage whose surroundings changed shows orange with a note; a missing passage is a red orphan with a warning", async () => {
    const { page } = await withProject({
      "a.md": doc,
      [FILE]: stored(note({ contextBefore: "Something else entirely" }), note({ id: "n2", selectedText: "purple cat", contextBefore: "", contextAfter: "", note: "Gone" })),
    });
    await columnButtons(page).nth(1).waitFor();
    const [orange, red] = [columnButtons(page).nth(0), columnButtons(page).nth(1)];
    assert.equal(await orange.getAttribute("data-state"), "surroundingChanged");
    assert.equal(await red.getAttribute("data-state"), "orphan");
    assert.equal(await marks(page).count(), 1);

    await orange.hover();
    await page.getByRole("tooltip").getByText("The text around this passage changed since it was annotated.").waitFor();
    await red.hover();
    await page.getByRole("tooltip").getByText("⚠ Annotated text not found — the excerpt has been edited or removed.").waitFor();
    await page.getByRole("tooltip").getByText("Gone").waitFor();
    assert.ok((await red.getAttribute("aria-label"))?.startsWith("⚠ Annotated text not found"));
  });

  test("annotations follow their Document: switching clears them", async () => {
    const { page } = await withProject({ "a.md": doc, "b.md": `# Bee\n\n${SENTENCE}\n`, [FILE]: stored(note()) });
    await marks(page).first().waitFor();
    await page.getByRole("link", { name: "b.md" }).click();
    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();
    assert.equal(await marks(page).count(), 0);
    assert.equal(await column(page).count(), 0);
  });

  test("an annotation added to the file by an agent shows up without reopening", async () => {
    const { page, host, disk } = await withProject({ "a.md": doc });
    await page.getByRole("heading", { level: 1, name: "Intro" }).waitFor();
    host.folders.write(disk, FILE, stored(note()));
    await marks(page).first().waitFor();
  });
});

describe("the Marker", () => {
  test("Normal, Active, Hidden in turn; Hidden shows no mark and no column and is remembered; Active is not", async () => {
    const first = await withProject({ "a.md": doc, [FILE]: stored(note()) });
    const { page, host } = first;
    await marks(page).first().waitFor();
    assert.equal(await marker(page).getAttribute("title"), "Marker mode — highlight to annotate");

    await marker(page).click();
    assert.equal(await state(page), "active");
    assert.equal(await marks(page).count(), 1);
    await marker(page).click();
    assert.equal(await state(page), "hidden");
    assert.equal(await marks(page).count(), 0);
    assert.equal(await column(page).count(), 0);
    await until(async () => ((await host.storage.get("display")) as { markerHidden?: boolean } | null)?.markerHidden === true, "Hidden kept");

    const again = await openView({ host });
    watch(again.page);
    await again.page.getByRole("heading", { level: 1, name: "Intro" }).waitFor();
    assert.equal(await state(again.page), "hidden");
    assert.equal(await marks(again.page).count(), 0);

    await marker(again.page).click();
    assert.equal(await state(again.page), "normal");
    await marks(again.page).first().waitFor();
    await until(async () => ((await host.storage.get("display")) as { markerHidden?: boolean } | null)?.markerHidden === false, "Normal kept");
    await marker(again.page).click();
    assert.equal(await state(again.page), "active");

    const third = await openView({ host });
    watch(third.page);
    await third.page.getByRole("heading", { level: 1, name: "Intro" }).waitFor();
    assert.equal(await state(third.page), "normal");
  });

  test("it is not on a Folder manifest", async () => {
    const { page } = await withProject({ "a.md": doc, "guide/liv-doc-main.md": "---\ntitle: Guide\n---\n", "guide/g.md": "# G\n" });
    await marker(page).waitFor();
    await page.getByRole("button", { name: "Show hidden items" }).click();
    await page.getByRole("link", { name: "liv-doc-main.md" }).click();
    await page.getByText("Read-only").waitFor();
    assert.equal(await marker(page).count(), 0);
  });

  test("it is not while editing, and the section preview has no marks", async () => {
    const { page } = await withProject({ "a.md": `# Intro\n\n## Part\n\n${SENTENCE}\n`, [FILE]: stored(note()) });
    await marks(page).first().waitFor();
    await page.getByRole("button", { name: "Edit" }).click();
    assert.equal(await marker(page).count(), 0);
    await page.getByRole("button", { name: "Done" }).click();
    await marks(page).first().waitFor();

    await page.getByRole("heading", { name: "Part" }).click({ button: "right" });
    await page.getByRole("menuitem").first().click();
    const preview = page.getByRole("region", { name: "Preview" });
    await preview.getByText("quick").waitFor();
    assert.equal(await preview.locator("mark").count(), 0);
  });
});

describe("the column", () => {
  const long = `# Intro\n\n${"Filler paragraph.\n\n".repeat(90)}${SENTENCE}\n`;
  const inView = (page: Page) =>
    page.evaluate(() => {
      const box = document.querySelector("article.document mark.ld-annotation")!.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    });

  test("hovering a button scrolls nothing; clicking it brings the mark into view", async () => {
    const { page } = await withProject({ "a.md": long, [FILE]: stored(note()) });
    const button = columnButtons(page).first();
    await button.waitFor();
    assert.equal(await inView(page), false);

    await button.hover();
    await page.getByRole("tooltip").waitFor();
    await page.waitForTimeout(800);
    assert.equal(await inView(page), false);

    await button.click();
    await until(() => inView(page), "the mark in view");
  });

  test("clicking an orphan's button shows its popup", async () => {
    const { page } = await withProject({ "a.md": doc, [FILE]: stored(note({ selectedText: "purple cat" })) });
    const button = columnButtons(page).first();
    await button.waitFor();
    await page.mouse.move(5, 5);
    await button.click();
    await page.getByRole("tooltip").getByText("⚠ Annotated text not found — the excerpt has been edited or removed.").waitFor();
  });
});

describe("in French", () => {
  test("the Marker, the popup, the warning and the date are in French", async () => {
    const { page } = await withProject({ "a.md": doc, [FILE]: stored(note(), note({ id: "n2", selectedText: "purple cat", contextBefore: "", contextAfter: "" })) }, { locale: "fr" });
    await columnButtons(page).nth(1).waitFor();
    assert.equal(await marker(page).getAttribute("title"), "Mode Marqueur — surligner pour annoter");

    await columnButtons(page).nth(0).hover();
    await page.getByRole("tooltip").getByText("5 mars 2026").waitFor();
    await columnButtons(page).nth(1).hover();
    await page.getByRole("tooltip").getByText("⚠ Texte annoté introuvable — l'extrait a été modifié ou supprimé.").waitFor();

    await marker(page).click();
    await select(page, "lazy dog");
    const popup = page.getByRole("dialog", { name: "Nouvelle annotation" });
    await popup.getByPlaceholder("Votre remarque ou suggestion…").waitFor();
    await popup.getByRole("button", { name: "Annuler" }).waitFor();
    await popup.getByRole("button", { name: "Enregistrer" }).waitFor();
  });
});

describe("editing and deleting", () => {
  const popup = (page: Page) => page.getByRole("tooltip");
  const form = (page: Page, name = "Edit annotation") => page.getByRole("dialog", { name });
  const confirmation = (page: Page) => page.getByRole("dialog", { name: "Delete annotation" });
  const hoverMark = async (page: Page) => {
    await marks(page).first().waitFor();
    await marks(page).first().hover();
    await popup(page).waitFor();
  };

  test("edit a note: the file keeps createdAt and gains updated; the popup shows the new note and edited; Save is off when blank; Cancel changes nothing", async () => {
    const { page, host, disk } = await withProject({ "a.md": doc, [FILE]: stored(note()) });
    await hoverMark(page);
    await popup(page).getByRole("button", { name: /Delete/ }).waitFor();
    await popup(page).getByRole("button", { name: /Edit/ }).click();

    const edit = form(page);
    const text = edit.getByRole("textbox");
    await text.waitFor();
    assert.equal(await text.inputValue(), "Which fox?\nBe precise.");
    assert.equal(await text.evaluate((el) => el === document.activeElement), true);
    await text.fill("Changed, then cancelled");
    await edit.getByRole("button", { name: "Cancel" }).click();
    await edit.waitFor({ state: "detached" });
    assert.equal(read(host, disk).a[0].note, "Which fox?\nBe precise.");
    assert.equal(read(host, disk).a[0].updated, undefined);

    await hoverMark(page);
    await popup(page).getByRole("button", { name: /Edit/ }).click();
    await text.fill("   ");
    assert.equal(await edit.getByRole("button", { name: "Save" }).isDisabled(), true);
    await text.fill("Which fox?\nThe red one.");
    await edit.getByRole("button", { name: "Save" }).click();
    await edit.waitFor({ state: "detached" });

    const [saved] = read(host, disk).a;
    assert.equal(saved.note, "Which fox?\nThe red one.");
    assert.equal(saved.createdAt, "2026-03-05T12:00:00.000Z");
    assert.equal(typeof saved.updated, "string");

    await page.mouse.move(5, 5);
    await hoverMark(page);
    await popup(page).getByText("The red one.").waitFor();
    await popup(page).getByText(/Mar 5, 2026 · edited /).waitFor();
  });

  test("delete: the confirmation shows, Cancel keeps it, Delete removes it from the file, the mark and the column button", async () => {
    const { page, host, disk } = await withProject({ "a.md": doc, [FILE]: stored(note()) });
    await hoverMark(page);
    await popup(page).getByRole("button", { name: /Delete/ }).click();
    await confirmation(page).getByText("Delete this annotation?").waitFor();
    await confirmation(page).getByRole("button", { name: "Cancel" }).click();
    await confirmation(page).waitFor({ state: "detached" });
    assert.equal(read(host, disk).a.length, 1);
    assert.equal(await marks(page).count(), 1);

    await page.mouse.move(5, 5);
    await hoverMark(page);
    await popup(page).getByRole("button", { name: /Delete/ }).click();
    await confirmation(page).getByRole("button", { name: "Delete" }).click();
    await confirmation(page).waitFor({ state: "detached" });
    await until(async () => (await marks(page).count()) === 0, "mark gone");
    assert.equal(await column(page).count(), 0);
    assert.equal(read(host, disk).a, undefined);
  });

  test("an orphan is deleted from its column button", async () => {
    const { page, host, disk } = await withProject({ "a.md": doc, [FILE]: stored(note({ selectedText: "purple cat" })) });
    const button = columnButtons(page).first();
    await button.waitFor();
    await button.hover();
    await popup(page).getByRole("button", { name: /Delete/ }).click();
    await confirmation(page).getByRole("button", { name: "Delete" }).click();
    await column(page).waitFor({ state: "detached" });
    assert.equal(read(host, disk).a, undefined);
  });

  test("editing an annotation an agent deleted meanwhile shows a translated message and keeps the form open", async () => {
    const { page, host, disk } = await withProject({ "a.md": doc, [FILE]: stored(note()) });
    await hoverMark(page);
    await popup(page).getByRole("button", { name: /Edit/ }).click();
    const edit = form(page);
    await edit.getByRole("textbox").fill("Too late");
    host.folders.write(disk, FILE, "{}");
    await edit.getByRole("button", { name: "Save" }).click();
    await page.getByText("This annotation was deleted meanwhile.").waitFor();
    assert.equal(await edit.count(), 1);
  });

  test("the edit form and the confirmation stay open after 2 s off the popup, and Escape closes them", async () => {
    const { page } = await withProject({ "a.md": doc, [FILE]: stored(note(), note({ id: "n2", selectedText: "lazy dog", contextBefore: "jumps over the", contextAfter: "" })) });
    await hoverMark(page);
    await popup(page).getByRole("button", { name: /Edit/ }).click();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(2000);
    assert.equal(await form(page).count(), 1);
    await columnButtons(page).nth(1).hover();
    assert.equal(await form(page).getByRole("textbox").inputValue(), "Which fox?\nBe precise.");
    await page.keyboard.press("Escape");
    await form(page).waitFor({ state: "detached" });

    await page.mouse.move(5, 5);
    await hoverMark(page);
    await popup(page).getByRole("button", { name: /Delete/ }).click();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(2000);
    assert.equal(await confirmation(page).count(), 1);
    await page.keyboard.press("Escape");
    await confirmation(page).waitFor({ state: "detached" });
    assert.equal(await marks(page).count(), 2);
  });

  test("in French: Modifier, Supprimer and the confirmation", async () => {
    const { page } = await withProject({ "a.md": doc, [FILE]: stored(note()) }, { locale: "fr" });
    await hoverMark(page);
    await popup(page).getByRole("button", { name: /Modifier/ }).waitFor();
    await popup(page).getByRole("button", { name: /Supprimer/ }).click();
    const sure = page.getByRole("dialog", { name: "Supprimer l’annotation" });
    await sure.getByText("Supprimer cette annotation ?").waitFor();
    await sure.getByRole("button", { name: "Annuler" }).waitFor();
    await sure.getByRole("button", { name: "Supprimer" }).waitFor();
  });
});

describe("annotations follow the Tree", () => {
  test("renaming the open Document keeps its annotations shown; deleting it removes its key", async () => {
    const { page, host, disk } = await withProject({ "a.md": doc, "b.md": "# B\n", [FILE]: stored(note()) });
    await marks(page).first().waitFor();
    await page.getByRole("link", { name: "a.md" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename document" });
    const field = dialog.getByRole("textbox", { name: "New name" });
    await field.fill("z");
    await field.press("Enter");
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("link", { name: "z.md" }).waitFor();
    await marks(page).first().waitFor();
    await until(() => Object.keys(read(host, disk) ?? {}).join() === "z", "key renamed");

    await page.getByRole("button", { name: "Delete" }).click();
    const sure = page.getByRole("dialog", { name: "Delete document" });
    await sure.getByRole("button", { name: "Delete" }).click();
    await sure.waitFor({ state: "detached" });
    await until(() => Object.keys(read(host, disk) ?? {}).length === 0, "key removed");
  });
});
