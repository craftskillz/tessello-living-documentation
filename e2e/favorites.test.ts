import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import type { Page } from "playwright";
import { openWidget, openView, useBrowser, withProject as connected, type Opened } from "./living-documentation.ts";

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

const star = (page: Page) => page.getByRole("button", { name: "Favorite", exact: true });
const menuButton = (page: Page) => page.getByRole("button", { name: "Favorites", exact: true });
const menu = (page: Page) => page.getByRole("dialog", { name: "Favorites" });
const titles = (page: Page) => menu(page).getByRole("listitem").locator("[data-title]").allInnerTexts();
/** Waits for the menu to list exactly `expected`: the list is read again each time the menu opens. */
const lists = (page: Page, ...expected: string[]) => until(async () => (await titles(page)).join("|") === expected.join("|") || (expected.length === 0 && (await titles(page)).length === 0), `the menu lists ${expected}`);
const open = async (page: Page) => {
  await menuButton(page).click();
  await menu(page).waitFor();
};

describe("starring a Document", () => {
  test("the header's star adds it to the Favorites menu with its title, and it survives a reload", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n", "b.md": "# Bee\n" });
    await page.getByRole("link", { name: "b.md" }).click();
    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();
    assert.equal(await star(page).getAttribute("aria-pressed"), "false");
    assert.equal(await star(page).getAttribute("title"), "Add to favorites");

    await star(page).click();
    assert.equal(await star(page).getAttribute("aria-pressed"), "true");
    assert.equal(await star(page).getAttribute("title"), "Remove from favorites");
    await open(page);
    await lists(page, "Bee");

    await page.reload();
    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();
    assert.equal(await star(page).getAttribute("aria-pressed"), "true");
    await open(page);
    await lists(page, "Bee");
  });
});

const files = { "a.md": "# Alpha\n", "b.md": "# Bee\n", "c.md": "# Sea\n" };
/** The paths the Module's storage keeps as favorites: what a reload would show. */
async function kept({ host }: Pick<Opened, "host">): Promise<string[]> {
  const all = (await host.storage.get("favorites")) as Record<string, { path: string }[]> | null;
  return Object.values(all ?? {}).flatMap((entries) => entries.map((entry) => entry.path));
}
/** Waits until storage keeps exactly `paths`, so that a test never reloads in the middle of a save. */
const keeps = (opened: Pick<Opened, "host">, ...paths: string[]) => until(async () => (await kept(opened)).join() === paths.join() || (paths.length === 0 ? (await kept(opened)).length === 0 : false), `favorites ${paths}`);

/** Opens a Document from the Tree, and stars it. */
async function starred({ page, host }: Opened, ...names: [string, string][]) {
  for (const [file, heading] of names) {
    await page.getByRole("link", { name: file }).click();
    await page.getByRole("heading", { level: 1, name: heading }).waitFor();
    await star(page).click();
  }
  await until(async () => (await kept({ host })).length === names.length, "the favorites kept");
}
const row = (page: Page, title: string) => menu(page).getByRole("listitem").filter({ hasText: title });

describe("unstarring", () => {
  test("the header's star again removes the favorite", async () => {
    const opened = await withProject(files);
    const { page } = opened;
    await starred(opened, ["a.md", "Alpha"]);

    await star(page).click();

    assert.equal(await star(page).getAttribute("aria-pressed"), "false");
    await open(page);
    await menu(page).getByText("No favorites yet. Star a document to pin it here.").waitFor();
  });

  test("the star is not on a read-only Folder manifest, nor while editing", async () => {
    const { page } = await withProject({ "a.md": "# Alpha\n", "guide/liv-doc-main.md": "---\ntitle: Guide\n---\n", "guide/g.md": "# G\n" });
    await star(page).waitFor();
    await page.getByRole("button", { name: "Edit" }).click();
    assert.equal(await star(page).count(), 0);
    await page.getByRole("button", { name: "Done" }).click();

    await page.getByRole("button", { name: "Show hidden items" }).click();
    await page.getByRole("link", { name: "liv-doc-main.md" }).click();
    await page.getByText("Read-only").waitFor();
    assert.equal(await star(page).count(), 0);
  });
});

describe("the Favorites menu", () => {
  test("a favorite opens its Document and closes the menu", async () => {
    const opened = await withProject(files);
    const { page } = opened;
    await starred(opened, ["b.md", "Bee"]);
    await page.getByRole("link", { name: "a.md" }).click();
    await page.getByRole("heading", { level: 1, name: "Alpha" }).waitFor();

    await open(page);
    await menu(page).getByRole("button", { name: "Bee" }).click();

    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();
    await menu(page).waitFor({ state: "detached" });
  });

  test("it closes on Escape, on a click outside and on its own button", async () => {
    const { page } = await withProject(files);
    await open(page);
    await menu(page).getByText("No favorites yet. Star a document to pin it here.").waitFor();

    await page.keyboard.press("Escape");
    await menu(page).waitFor({ state: "detached" });

    await open(page);
    await page.getByRole("heading", { level: 1, name: "Alpha" }).click();
    await menu(page).waitFor({ state: "detached" });

    await open(page);
    await menuButton(page).click();
    await menu(page).waitFor({ state: "detached" });
  });

  test("a favorite whose file an agent deleted stays, greyed as Missing, until Remove", async () => {
    const opened = await withProject(files);
    const { page, host, disk } = opened;
    await starred(opened, ["b.md", "Bee"], ["c.md", "Sea"]);

    host.folders.remove(disk, "b.md");
    await open(page);
    await row(page, "Bee").getByText("Missing").waitFor();
    // The kept title shows, and it cannot be opened.
    await row(page, "Bee").getByRole("button", { name: "Bee" }).click({ force: true });
    await page.getByRole("heading", { level: 1, name: "Sea" }).waitFor();
    assert.equal(await menu(page).isVisible(), true);

    await row(page, "Bee").getByRole("button", { name: "Remove from favorites" }).click();
    await lists(page, "Sea");
    await keeps(opened, "c.md");
    await page.reload();
    await open(page);
    await lists(page, "Sea");
  });

  test("Alt + ArrowDown moves the focused row down and keeps the focus; it is saved", async () => {
    const opened = await withProject(files);
    const { page } = opened;
    await starred(opened, ["a.md", "Alpha"], ["b.md", "Bee"], ["c.md", "Sea"]);
    await open(page);

    await menu(page).getByRole("button", { name: "Alpha" }).focus();
    await page.keyboard.press("Alt+ArrowDown");
    await lists(page, "Bee", "Alpha", "Sea");
    assert.equal(await page.evaluate("document.activeElement?.textContent"), "Alpha");
    await page.keyboard.press("Alt+ArrowUp");
    await page.keyboard.press("Alt+ArrowUp");
    await lists(page, "Alpha", "Bee", "Sea");
    await menu(page).getByRole("button", { name: "Sea" }).focus();
    await page.keyboard.press("Alt+ArrowUp");
    await lists(page, "Alpha", "Sea", "Bee");
    await keeps(opened, "a.md", "c.md", "b.md");

    await page.reload();
    await open(page);
    await lists(page, "Alpha", "Sea", "Bee");
  });

  test("dragging a row onto another puts it at that position; onto itself changes nothing", async () => {
    const opened = await withProject(files);
    const { page } = opened;
    await starred(opened, ["a.md", "Alpha"], ["b.md", "Bee"], ["c.md", "Sea"]);
    await open(page);

    await row(page, "Sea").dragTo(row(page, "Alpha"));
    await lists(page, "Sea", "Alpha", "Bee");
    await row(page, "Bee").dragTo(row(page, "Bee"), { sourcePosition: { x: 8, y: 8 }, targetPosition: { x: 60, y: 12 } });
    await lists(page, "Sea", "Alpha", "Bee");
    await keeps(opened, "c.md", "a.md", "b.md");

    await page.reload();
    await open(page);
    await lists(page, "Sea", "Alpha", "Bee");
  });

  test("an agent's edit of a title shows when the menu opens again", async () => {
    const opened = await withProject(files);
    const { page, host, disk } = opened;
    await starred(opened, ["b.md", "Bee"]);

    host.folders.write(disk, "b.md", "# Bumblebee\n");

    await until(async () => {
      await menuButton(page).click();
      const shown = (await titles(page)).join();
      await page.keyboard.press("Escape");
      return shown === "Bumblebee";
    });
  });
});

describe("a failed save", () => {
  test("starring, unstarring, removing and reordering restore the list and say so", async () => {
    const opened = await withProject(files);
    const { page, host } = opened;
    await starred(opened, ["a.md", "Alpha"], ["b.md", "Bee"]);
    const toast = page.getByRole("status").getByText("The favorites could not be saved.");
    const stop = host.refuseWrites({ key: "favorites" });

    await page.getByRole("link", { name: "c.md" }).click();
    await page.getByRole("heading", { level: 1, name: "Sea" }).waitFor();
    await star(page).click();
    await toast.waitFor();
    assert.equal(await star(page).getAttribute("aria-pressed"), "false");
    await page.getByRole("button", { name: "Close" }).click();

    await open(page);
    await lists(page, "Alpha", "Bee");
    await menu(page).getByRole("button", { name: "Alpha" }).focus();
    await page.keyboard.press("Alt+ArrowDown");
    await toast.waitFor();
    await lists(page, "Alpha", "Bee");
    // The toast is outside the menu: closing it closes the menu too.
    await page.getByRole("button", { name: "Close" }).click();
    await open(page);

    await row(page, "Alpha").getByRole("button", { name: "Remove from favorites" }).click();
    await toast.waitFor();
    await lists(page, "Alpha", "Bee");
    await page.getByRole("button", { name: "Close" }).click();
    await open(page);

    stop();
    await row(page, "Alpha").getByRole("button", { name: "Remove from favorites" }).click();
    await lists(page, "Bee");
  });

  test("at most 200 favorites: a translated message, nothing changes", async () => {
    const { page, host } = await withProject(files);
    const projects = (await host.storage.get("projects")) as { projects: { id: string }[] };
    const many = Array.from({ length: 200 }, (_, index) => ({ path: `n${index}.md`, title: `N${index}` }));
    await host.storage.set("favorites", { [projects.projects[0].id]: many });
    await page.reload();
    await page.getByRole("heading", { level: 1, name: "Alpha" }).waitFor();

    await star(page).click();

    await page.getByRole("status").getByText("At most 200 favorites.").waitFor();
    assert.equal(await star(page).getAttribute("aria-pressed"), "false");
  });
});

describe("following the Tree", () => {
  test("a renamed starred Document keeps its star and shows its new path in the menu", async () => {
    const opened = await withProject(files);
    const { page } = opened;
    await starred(opened, ["b.md", "Bee"]);

    await page.getByRole("link", { name: "b.md" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename document" });
    await dialog.getByRole("textbox", { name: "New name" }).fill("hive");
    await dialog.getByRole("textbox", { name: "New name" }).press("Enter");
    await dialog.waitFor({ state: "detached" });

    await page.getByRole("link", { name: "hive.md" }).waitFor();
    assert.equal(await star(page).getAttribute("aria-pressed"), "true");
    await open(page);
    assert.equal(await row(page, "Bee").getAttribute("data-path"), "hive.md");
    await row(page, "Bee").getByRole("button", { name: "Bee" }).click();
    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();
  });

  test("a moved starred Document follows its new folder", async () => {
    const opened = await withProject({ ...files, "docs/x.md": "# Ex\n" });
    const { page } = opened;
    await starred(opened, ["b.md", "Bee"]);

    await page.getByRole("link", { name: "b.md" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to…" }).click();
    const dialog = page.getByRole("dialog", { name: "Move document" });
    await dialog.getByRole("combobox", { name: "Destination" }).selectOption("docs");
    await dialog.getByRole("button", { name: "Move" }).click();
    await dialog.waitFor({ state: "detached" });

    await open(page);
    await until(async () => (await row(page, "Bee").getAttribute("data-path")) === "docs/b.md");
  });

  test("a deleted starred Document leaves the menu", async () => {
    const opened = await withProject(files);
    const { page } = opened;
    await starred(opened, ["b.md", "Bee"], ["c.md", "Sea"]);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("dialog", { name: "Delete document" }).getByRole("button", { name: "Delete" }).click();

    await page.getByRole("dialog", { name: "Delete document" }).waitFor({ state: "detached" });
    await open(page);
    await lists(page, "Bee");
  });
});

describe("opening a Project", () => {
  test("with no last Document it opens on its top existing favorite (seeded from .living-doc.json)", async () => {
    const living = JSON.stringify({ favorites: [{ id: "gone", title: "Gone" }, { id: "c", title: "Sea" }, { id: "b", title: "Bee" }] });
    const { page } = await withProject({ ...files, ".living-doc.json": living });

    await page.getByRole("heading", { level: 1, name: "Sea" }).waitFor();
    assert.equal(await star(page).getAttribute("aria-pressed"), "true");
    await open(page);
    await lists(page, "Gone", "Sea", "Bee");
  });

  test("the View, already loaded, opens the Document the Widget asks for", async () => {
    const { page, host } = await withProject(files);
    const { projects } = (await host.storage.get("projects")) as { projects: { id: string }[] };
    // The View opens the first Document by itself: the Widget's request comes after it.
    await page.getByRole("heading", { level: 1, name: "Alpha" }).waitFor();

    host.openView({ project: projects[0].id, doc: "c.md" });

    await page.getByRole("heading", { level: 1, name: "Sea" }).waitFor();
  });
});

describe("in French", () => {
  test("the star, the menu and its rows are translated", async () => {
    const { page } = await withProject(files, { locale: "fr" });
    await page.getByRole("button", { name: "Favori", exact: true }).click();
    const frMenu = page.getByRole("dialog", { name: "Favoris" });

    await page.getByRole("button", { name: "Favoris", exact: true }).click();
    await frMenu.getByRole("button", { name: "Retirer des favoris" }).waitFor();
    await frMenu.getByTitle("Glisser pour réordonner").waitFor();
    assert.equal(await page.getByRole("button", { name: "Favori", exact: true }).getAttribute("title"), "Retirer des favoris");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Favori", exact: true }).click();
    await page.getByRole("button", { name: "Favoris", exact: true }).click();
    await frMenu.getByText("Aucun favori. Cliquez sur l'étoile d'un document pour l'épingler ici.").waitFor();
  });
});

describe("the Widget", () => {
  const projectId = async (host: Opened["host"]) => ((await host.storage.get("projects")) as { projects: { id: string }[] }).projects[0].id;

  test("lists the Active Project's favorites in order; a click opens the View on that Document", async () => {
    const opened = await withProject(files);
    await starred(opened, ["c.md", "Sea"], ["a.md", "Alpha"]);
    const { page, host } = await openWidget(opened.host);

    await page.getByText("Living Documentation").waitFor();
    await page.getByText("docs", { exact: true }).waitFor();
    assert.deepEqual(await page.getByRole("list").getByRole("button").allInnerTexts(), ["Sea", "Alpha"]);
    await page.getByRole("button", { name: "Alpha" }).click();
    await until(() => host.openedViews.length === 1);
    assert.deepEqual(host.openedViews, [{ project: await projectId(host), doc: "a.md" }]);

    await page.getByRole("button", { name: "docs" }).click();
    await until(() => host.openedViews.length === 2);
    assert.deepEqual(host.openedViews[1], {});
  });

  test("a Missing favorite is greyed and does not open anything; a new favorite shows when the Widget is shown again", async () => {
    const opened = await withProject(files);
    await starred(opened, ["b.md", "Bee"]);
    opened.host.folders.remove(opened.disk, "b.md");
    const { page, host, surface } = await openWidget(opened.host);

    const missing = page.getByRole("list").getByRole("button", { name: "Bee" });
    await missing.waitFor();
    assert.equal(await missing.isDisabled(), true);
    await page.getByText("Missing").waitFor();
    await missing.click({ force: true });
    assert.deepEqual(host.openedViews, []);

    await starred(opened, ["c.md", "Sea"]);
    await keeps(opened, "b.md", "c.md");
    surface.setVisible(false);
    surface.setVisible(true);
    await page.getByRole("list").getByRole("button", { name: "Sea" }).waitFor();
  });

  test("without favorites it shows a hint; without a Project, Connect a folder opens the View", async () => {
    const opened = await withProject(files);
    const { page } = await openWidget(opened.host);
    await page.getByText("No favorites yet. Open Living Documentation and star a document.").waitFor();

    const empty = await openView();
    const widget = await openWidget(empty.host);
    await widget.page.getByRole("button", { name: "Connect a folder" }).click();
    await until(() => widget.host.openedViews.length === 1);
    assert.deepEqual(widget.host.openedViews, [{}]);
  });

  test("an Unavailable Project shows its name and Reconnect, which brings the favorites back", async () => {
    const opened = await withProject(files);
    await starred(opened, ["b.md", "Bee"]);
    opened.host.folders.restart();
    const { page } = await openWidget(opened.host);

    await page.getByText("docs is unavailable").waitFor();
    await page.getByRole("button", { name: "Reconnect" }).click();

    await page.getByRole("list").getByRole("button", { name: "Bee" }).waitFor();
  });

  test("it speaks French", async () => {
    const opened = await withProject(files, { locale: "fr" });
    const { page } = await openWidget(opened.host);
    await page.getByText("Aucun favori. Ouvrez Living Documentation et cliquez sur l'étoile d'un document.").waitFor();
  });
});
