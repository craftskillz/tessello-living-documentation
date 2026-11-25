// Search over the Tree: titles at once, full text after a pause, the count above the Tree. Like every journey in the
// View, none may change the page address (the View is an about:srcdoc page in the Host).

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import type { Page } from "playwright";
import { useBrowser, withProject as connected } from "./living-documentation.ts";

useBrowser();

// In the Host, the View is an about:srcdoc page: no journey may change its address.
let opened: { page: Page; address: string } | null = null;
const withProject: typeof connected = async (...args) => {
  const project = await connected(...args);
  opened = { page: project.page, address: project.page.url() };
  await links(project.page).first().waitFor();
  return project;
};
afterEach(() => {
  if (opened) assert.equal(opened.page.url(), opened.address, "the page address changed");
  opened = null;
});

const links = (page: Page) => page.getByRole("navigation", { name: "Documents" }).getByRole("link");
const box = (page: Page, locale: "en" | "fr" = "en") =>
  page.getByRole("searchbox", { name: locale === "en" ? "Search documents…" : "Rechercher dans les documents…" });
const count = (page: Page) => page.locator("nav p.count");
const excerpt = (page: Page, path: string) => page.locator(`[data-entry="${path}"] .excerpt`);

const FILES = {
  "elephant.md": "# Éléphant\n\nGrey.\n",
  "notes.md": "# Notes\n\nThe quick marmalade jumped over a fence, said the title: nothing.\n",
  "tagged.md": "---\ntags: [zebrafish]\n---\n# Tagged\n",
  "described.md": "---\ndescription: About wombats\n---\n# Described\n",
  "typed.md": "---\ntype: runbook\n---\n# Typed\n",
  "deep/inner/leaf.md": "# Leaf\n\nContains marmalade too.\n",
  "other.md": "# Other\n",
};

describe("search", () => {
  test("a title matches at once, ignoring case and accents", async () => {
    const { page } = await withProject(FILES);
    await box(page).fill("ELEPHANT");
    assert.deepEqual(await links(page).allInnerTexts(), ["elephant.md"]);
    assert.equal(await count(page).innerText(), "1 document");
  });

  test("a body match shows after the pause with its excerpt, Folders leading to it open", async () => {
    const { page } = await withProject(FILES);
    await page.getByText("deep", { exact: true }).click(); // the User closes a Folder
    await box(page).fill("marmalade");
    await excerpt(page, "notes.md").waitFor();
    assert.match(await excerpt(page, "notes.md").innerText(), /quick marmalade jumped/);
    assert.deepEqual(await links(page).allInnerTexts(), ["leaf.md", "notes.md"]);
    assert.equal(await count(page).innerText(), "2 documents");
    assert.equal(await page.locator('[data-entry="deep/inner"]').count(), 1);
    assert.equal(await excerpt(page, "deep/inner/leaf.md").count(), 1);
  });

  test("Tags, description and Type match without an excerpt", async () => {
    const { page } = await withProject(FILES);
    for (const [word, name] of [["ZEBRAFISH", "tagged.md"], ["wombat", "described.md"], ["Runbook", "typed.md"]] as const) {
      await box(page).fill(word);
      await page.getByRole("link", { name }).waitFor();
      assert.deepEqual(await links(page).allInnerTexts(), [name]);
      assert.equal(await page.locator(".excerpt").count(), 0);
    }
  });

  test("field names and raw frontmatter never match", async () => {
    const { page } = await withProject({
      "field.md": "---\nowner: alice\n---\n# Field\n",
      "body.md": "# Body\n\nThe owner signs off.\n",
    });
    await box(page).fill("owner");
    // The body match shows the full-text answer is in: the field name alone found nothing.
    await excerpt(page, "body.md").waitFor();
    assert.deepEqual(await links(page).allInnerTexts(), ["body.md"]);
  });

  test("a Document an agent adds during a search is found when the Tree reloads", async () => {
    const { page, host, disk } = await withProject(FILES);
    await box(page).fill("marmalade");
    await excerpt(page, "notes.md").waitFor();
    host.folders.write(disk, "jam.md", "# Jam\n\nOrange marmalade.\n");
    await excerpt(page, "jam.md").waitFor();
    assert.equal(await count(page).innerText(), "3 documents");
  });

  test("nothing found: count 0 and a message; clearing restores the whole Tree", async () => {
    const { page } = await withProject(FILES);
    const all = await links(page).allInnerTexts();
    assert.equal(await count(page).innerText(), "7 documents");
    await box(page).fill("qqqqq");
    await page.getByText("No documents found.").waitFor();
    assert.equal(await count(page).innerText(), "0 documents");
    await box(page).fill("");
    await page.getByText("No documents found.").waitFor({ state: "detached" });
    assert.deepEqual(await links(page).allInnerTexts(), all);
    assert.equal(await count(page).innerText(), "7 documents");
  });

  test("rows cannot be dragged while searching", async () => {
    const { page } = await withProject(FILES);
    await box(page).fill("elephant");
    assert.equal(await page.locator('[data-entry="elephant.md"]').getAttribute("draggable"), "false");
    await box(page).fill("");
    assert.equal(await page.locator('[data-entry="elephant.md"]').getAttribute("draggable"), "true");
  });

  test("a hidden Document is found only with Show hidden items on", async () => {
    const { page } = await withProject({ "a.md": "# A\n", "secret.md": "# Secret plan\n", "liv-doc-main.md": "---\nhidden: [secret.md]\n---\n" });
    await box(page).fill("secret");
    await page.getByText("No documents found.").waitFor();
    await page.getByRole("button", { name: "Show hidden items" }).click();
    await page.getByRole("link", { name: "secret.md" }).waitFor();
    assert.equal(await count(page).innerText(), "1 document");
  });

  test("French texts", async () => {
    const { page } = await withProject(FILES, { locale: "fr" });
    await box(page, "fr").fill("qqqqq");
    await page.getByText("Aucun document trouvé.").waitFor();
    assert.equal(await count(page).innerText(), "0 document");
    await box(page, "fr").fill("elephant");
    assert.equal(await count(page).innerText(), "1 document");
  });
});
