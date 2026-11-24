import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { openView, type Opened, useBrowser } from "./living-documentation.ts";

useBrowser();

const ALPHA = { "a.md": "# Alpha document\n", "sub/s.md": "# Alpha document\n" };
const BETA = { "b.md": "# Beta document\n" };

/** The View with the Project "alpha" connected, then "beta" (the Active Project), as the User adds them. */
async function twoProjects(locale?: string) {
  const opened = await openView({ locale });
  const alpha = opened.host.folders.create("alpha", ALPHA);
  const beta = opened.host.folders.create("beta", BETA);
  opened.host.folders.choose(alpha);
  await opened.page.getByRole("button", { name: locale === "fr" ? "Connecter un dossier" : "Connect a folder" }).click();
  await opened.page.getByRole("heading", { level: 1, name: "Alpha document" }).waitFor();
  const address = opened.page.url();
  opened.host.folders.choose(beta);
  await openSwitcher(opened);
  await opened.page.getByRole("button", { name: locale === "fr" ? "Connecter un dossier" : "Connect a folder" }).click();
  await opened.page.getByRole("heading", { level: 1, name: "Beta document" }).waitFor();
  return { ...opened, alpha, beta, address };
}

/** Opens the Project switcher of the sidebar and returns its menu. */
async function openSwitcher({ page }: Opened) {
  await page.locator(".switcher > button").click();
  return page.getByRole("dialog", { name: /^(Projects|Projets)$/ });
}

const tree = (page: Opened["page"]) => page.getByRole("navigation", { name: "Documents" });

describe("the Project switcher", () => {
  test("connects a second Project and switches back and forth, the Tree following", async () => {
    const { page, address } = await twoProjects();
    assert.deepEqual(await tree(page).getByRole("link").allInnerTexts(), ["b.md"]);

    let menu = await openSwitcher({ page } as Opened);
    assert.equal(await menu.getByRole("button", { name: "beta", exact: true }).getAttribute("aria-current"), "true");
    await menu.getByRole("button", { name: "alpha", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "Alpha document" }).waitFor();
    assert.ok((await tree(page).getByRole("link").allInnerTexts()).includes("a.md"));

    menu = await openSwitcher({ page } as Opened);
    await menu.getByRole("button", { name: "beta", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "Beta document" }).waitFor();
    assert.equal(page.url(), address);
  });

  test("a folder inside an existing Project is refused, naming that Project", async () => {
    const { page, host, alpha, address } = await twoProjects();
    host.folders.choose(host.folders.inside(alpha, "sub"));

    const menu = await openSwitcher({ page } as Opened);
    await menu.getByRole("button", { name: "Connect a folder" }).click();

    await page.getByText("This folder overlaps the Project “alpha”: it is that folder, inside it or around it. Choose another folder.").waitFor();
    await page.getByRole("heading", { level: 1, name: "Beta document" }).waitFor();
    assert.equal(page.url(), address);
  });

  test("removing a Project asks first, forgets it and leaves its files on disk", async () => {
    const { page, host, alpha, address } = await twoProjects();

    let menu = await openSwitcher({ page } as Opened);
    await menu.getByRole("button", { name: "Remove alpha" }).click();
    const confirm = page.getByRole("dialog", { name: "Remove the Project “alpha”?" });
    await confirm.getByText("Its files stay on disk.").waitFor();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    menu = await openSwitcher({ page } as Opened);
    await menu.getByRole("button", { name: "alpha", exact: true }).waitFor();

    await menu.getByRole("button", { name: "Remove alpha" }).click();
    await page.getByRole("dialog", { name: "Remove the Project “alpha”?" }).getByRole("button", { name: "Remove", exact: true }).click();

    menu = await openSwitcher({ page } as Opened);
    await menu.getByRole("button", { name: "beta", exact: true }).waitFor();
    assert.equal(await menu.getByRole("button", { name: "alpha", exact: true }).count(), 0);
    assert.equal(host.folders.read(alpha, "a.md"), "# Alpha document\n");
    await page.getByRole("heading", { level: 1, name: "Beta document" }).waitFor();
    assert.equal(page.url(), address);
  });

  test("removing the Active Project opens another; removing the last one shows the welcome screen", async () => {
    const { page, address } = await twoProjects();

    await (await openSwitcher({ page } as Opened)).getByRole("button", { name: "Remove beta" }).click();
    await page.getByRole("dialog", { name: "Remove the Project “beta”?" }).getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "Alpha document" }).waitFor();

    await (await openSwitcher({ page } as Opened)).getByRole("button", { name: "Remove alpha" }).click();
    await page.getByRole("dialog", { name: "Remove the Project “alpha”?" }).getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("button", { name: "Connect a folder" }).waitFor();
    assert.equal(page.url(), address);
  });

  test("after a browser restart, the Unavailable Projects are listed and reconnected from the switcher", async () => {
    const first = await twoProjects();
    first.host.folders.restart();

    const { page } = await openView({ host: first.host });
    await page.getByText("beta is unavailable").waitFor();
    const address = page.url();
    const menu = await openSwitcher({ page } as Opened);
    await menu.getByText("unavailable", { exact: true }).first().waitFor();
    await menu.getByRole("button", { name: "Reconnect alpha" }).click();
    await page.getByRole("heading", { level: 1, name: "Alpha document" }).waitFor();
    assert.equal(page.url(), address);

    // The Project switched to is open; the other is still unavailable and can be removed.
    const again = await openSwitcher({ page } as Opened);
    await again.getByRole("button", { name: "Remove beta" }).click();
    await page.getByRole("dialog", { name: "Remove the Project “beta”?" }).getByRole("button", { name: "Remove", exact: true }).click();
    const last = await openSwitcher({ page } as Opened);
    await last.getByRole("button", { name: "alpha", exact: true }).waitFor();
    assert.equal(await last.getByRole("button", { name: "beta", exact: true }).count(), 0);
  });
});

describe("Project settings", () => {
  async function inRepository() {
    const opened = await openView();
    const repository = opened.host.folders.create("repo", { "docs/a.md": "# A\n", "src/main.ts": "" });
    const docs = opened.host.folders.inside(repository, "docs");
    opened.host.folders.choose(docs);
    await opened.page.getByRole("button", { name: "Connect a folder" }).click();
    await opened.page.getByRole("heading", { level: 1, name: "A" }).waitFor();
    return { ...opened, repository, docs, address: opened.page.url() };
  }

  async function openSettings(opened: Opened) {
    const menu = await openSwitcher(opened);
    await menu.getByRole("button", { name: "Project settings…" }).click();
    return opened.page.getByRole("dialog", { name: "Project settings" });
  }

  test("Connect repository refuses a folder that does not hold the Project folder, accepts the one that does, and Disconnect forgets it", async () => {
    const opened = await inRepository();
    const { page, host, repository, address } = opened;
    const settings = await openSettings(opened);
    await settings.getByText("Connect the git repository that holds this Project folder to see its versions.").waitFor();

    host.folders.choose(host.folders.create("apart", {}));
    await settings.getByRole("button", { name: "Connect repository" }).click();
    await settings.getByRole("alert").getByText("This folder does not contain the Project folder “docs”. Choose the root of the repository that holds it.").waitFor();

    host.folders.choose(repository);
    await settings.getByRole("button", { name: "Connect repository" }).click();
    await settings.getByText("repo", { exact: true }).waitFor();
    assert.equal(await settings.getByRole("button", { name: "Connect repository" }).count(), 0);

    await settings.getByRole("button", { name: "Disconnect" }).click();
    await settings.getByRole("button", { name: "Connect repository" }).waitFor();
    assert.equal(page.url(), address);
  });

  test("the line break checkbox writes .living-doc.json only when changed", async () => {
    const opened = await inRepository();
    const { page, host, docs, address } = opened;
    const settings = await openSettings(opened);
    const checkbox = settings.getByRole("checkbox", { name: "Treat every newline as a line break" });
    assert.equal(await checkbox.isChecked(), true);
    assert.equal(host.folders.read(docs, ".living-doc.json"), null);

    await checkbox.uncheck();

    await until(() => host.folders.read(docs, ".living-doc.json")?.includes('"markdownSoftBreaks": false'), "the setting on disk");
    await settings.getByRole("button", { name: "Close" }).click();
    await settings.waitFor({ state: "detached" });
    assert.equal(page.url(), address);
  });
});

describe("in French", () => {
  test("an overlapping folder is refused with a French message", async () => {
    const { page, host, alpha, address } = await twoProjects("fr");
    host.folders.choose(host.folders.inside(alpha, "sub"));

    const menu = await openSwitcher({ page } as Opened);
    await menu.getByRole("button", { name: "Connecter un dossier" }).click();

    await page.getByText("Ce dossier chevauche le projet « alpha » : c'est ce dossier, il est dedans ou autour. Choisissez un autre dossier.").waitFor();
    assert.equal(page.url(), address);
  });
});
