// Versions: the dialog of a Document's commits and their comparison with the file on disk, on a real repository made with the
// `git` CLI. Like every journey in the View, none may change the page address (the View is an about:srcdoc page in the Host).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import type { Page } from "playwright";
import { openView, type Opened, useBrowser } from "./living-documentation.ts";

useBrowser();

const DAY = 86_400_000;
const scratch: string[] = [];
after(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const ago = (days: number) => new Date(Date.now() - days * DAY);
/** The guide: a heading and 30 lines, with the edits given (line number → text). */
const guide = (edits: Record<number, string> = {}) =>
  ["# A", ...Array.from({ length: 30 }, (_, index) => edits[index + 1] ?? `line ${index + 1}`)].join("\n") + "\n";

interface Step {
  days: number;
  message: string;
  author?: string;
  files: Record<string, string | null>;
}

function git(cwd: string, args: string[], date: Date, author: string) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date.toISOString(),
      GIT_COMMITTER_DATE: date.toISOString(),
      GIT_AUTHOR_NAME: author,
      GIT_AUTHOR_EMAIL: "ada@example.com",
      GIT_COMMITTER_NAME: author,
      GIT_COMMITTER_EMAIL: "ada@example.com",
    },
  }).trim();
}

function readTree(dir: string, base = ""): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(join(dir, base), { withFileTypes: true })) {
    const path = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, readTree(dir, path));
    else files[path] = new Uint8Array(readFileSync(join(dir, path)));
  }
  return files;
}

/** A repository made with the real `git`, oldest step first: its files (`.git` included) and the id of each commit. `disk` replaces docs/a.md on disk. */
function repository(steps: Step[], disk?: string) {
  const dir = mkdtempSync(join(tmpdir(), "versions-"));
  scratch.push(dir);
  git(dir, ["init", "-b", "main"], new Date(), "Ada Lovelace");
  git(dir, ["config", "commit.gpgsign", "false"], new Date(), "Ada Lovelace");
  const ids: string[] = [];
  for (const step of steps) {
    const when = ago(step.days);
    for (const [path, text] of Object.entries(step.files)) {
      if (text === null) rmSync(join(dir, path));
      else {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), text);
      }
    }
    git(dir, ["add", "-A"], when, "Ada Lovelace");
    git(dir, ["commit", "-m", step.message], when, step.author ?? "Ada Lovelace");
    ids.push(git(dir, ["rev-parse", "HEAD"], when, "Ada Lovelace"));
  }
  const files = readTree(dir);
  if (disk !== undefined) files["docs/a.md"] = new TextEncoder().encode(disk);
  return { files, ids, short: ids.map((id) => id.slice(0, 7)) };
}

const BOARD = '# Board\n\n<div data-ld-kanban data-columns="To do|Done"></div>\n';

/** The usual history: the guide started 300 days ago (outside the default 180), written 10 days ago, edited 5 days ago, code touched 2 days ago. */
function usual(disk?: string) {
  return repository(
    [
      { days: 300, message: "Start the guide", files: { "docs/a.md": "# A\n" } },
      { days: 10, message: "Write the guide", files: { "docs/a.md": guide(), "docs/board.md": BOARD } },
      { days: 5, message: "Edit the guide", author: "Grace Hopper", files: { "docs/a.md": guide({ 5: "five edited" }) } },
      { days: 2, message: "Touch the code", files: { "src/main.ts": "export {};\n" } },
    ],
    disk,
  );
}

/** The View with the Project docs/ of the repository connected; the repository itself too unless `connect` is false. */
async function inRepository(files: Record<string, Uint8Array>, options: { connect?: boolean; locale?: string; repositoryFiles?: Record<string, Uint8Array> } = {}) {
  const fr = options.locale === "fr";
  const opened = await openView({ locale: options.locale });
  const repo = opened.host.folders.create("repo", options.repositoryFiles ?? files);
  opened.host.folders.choose(opened.host.folders.inside(repo, "docs"));
  await opened.page.getByRole("button", { name: fr ? "Connecter un dossier" : "Connect a folder" }).click();
  await opened.page.getByRole("navigation", { name: "Documents" }).waitFor();
  const address = opened.page.url();
  if (options.connect !== false) {
    const menu = await openSwitcher(opened, fr);
    await menu.getByRole("button", { name: fr ? "Réglages du projet…" : "Project settings…" }).click();
    const settings = opened.page.getByRole("dialog", { name: fr ? "Réglages du projet" : "Project settings" });
    opened.host.folders.choose(repo);
    await settings.getByRole("button", { name: fr ? "Connecter un dépôt" : "Connect repository" }).click();
    await settings.getByRole("button", { name: fr ? "Déconnecter" : "Disconnect" }).waitFor();
    await settings.getByRole("button", { name: fr ? "Fermer" : "Close" }).click();
    await settings.waitFor({ state: "detached" });
  }
  return { ...opened, repo, address };
}

async function openSwitcher({ page }: Pick<Opened, "page">, fr = false) {
  await page.locator(".switcher > button").click();
  return page.getByRole("dialog", { name: fr ? "Projets" : "Projects" });
}

const openGuide = async (page: Page) => {
  await page.getByRole("link", { name: "a.md", exact: true }).click();
  await page.getByRole("heading", { level: 1, name: "A" }).waitFor();
};
const versionsButton = (page: Page, fr = false) => page.getByRole("button", { name: fr ? "Versions" : "Versions", exact: true });
const dialogOf = (page: Page, fr = false) => page.getByRole("dialog", { name: fr ? "Versions du document" : "Document versions" });
const cards = (page: Page) => page.locator("dialog.ld-form").locator(".commits button");
const pressed = async (page: Page) => (await dialogOf(page).locator('.commits button[aria-pressed="true"]').allInnerTexts()).map((text) => text.split("\n")[0]);
const side = (page: Page, which: "mine" | "theirs", state: string) => dialogOf(page).locator(`.cell[data-side="${which}"][data-state="${state}"]`);

describe("the Versions dialog", () => {
  test("lists the commits newest first, compares with the latest, folds unchanged lines and compares with another commit", async () => {
    const { files, short } = usual(guide({ 5: "five edited", 15: "disk edit" }));
    const { page, address } = await inRepository(files);
    await openGuide(page);

    await versionsButton(page).click();
    const dialog = dialogOf(page);
    await dialog.getByText("a.md").first().waitFor();
    await cards(page).first().waitFor();
    // Only the commits that changed the Document, in 30 days, newest first.
    const texts = await cards(page).allInnerTexts();
    assert.equal(texts.length, 2);
    assert.ok(texts[0]!.includes(short[2]!) && texts[0]!.includes("Edit the guide") && texts[0]!.includes("Grace Hopper"), texts[0]);
    assert.ok(texts[1]!.includes(short[1]!) && texts[1]!.includes("Write the guide") && texts[1]!.includes("Ada Lovelace"), texts[1]);
    const day = new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(Date.now() - 5 * DAY);
    assert.ok(texts[0]!.includes(day), `the date ${day} is shown in ${texts[0]}`);
    assert.equal(await cards(page).first().getAttribute("title"), `Compare the current file with commit ${short[2]}`);

    // The latest commit is compared: the line edited on disk differs, and the unchanged runs are folded.
    assert.equal((await pressed(page)).length, 1);
    assert.ok((await cards(page).first().getAttribute("aria-pressed")) === "true");
    await dialog.getByText("Current file", { exact: true }).waitFor();
    await dialog.getByText(`Commit ${short[2]}`, { exact: true }).waitFor();
    await side(page, "mine", "only").filter({ hasText: "disk edit" }).waitFor();
    await side(page, "theirs", "only").filter({ hasText: "line 15" }).waitFor();
    const bars = dialog.getByRole("button", { name: /^12 unchanged lines$/ });
    assert.equal(await bars.count(), 2);
    assert.equal(await dialog.getByText("line 3", { exact: true }).count(), 0);

    await bars.first().click();
    await dialog.getByRole("button", { name: "Collapse 12 unchanged lines" }).waitFor();
    await dialog.getByText("line 3", { exact: true }).first().waitFor();
    await dialog.getByRole("button", { name: "Expand all" }).click();
    assert.equal(await dialog.getByRole("button", { name: /^12 unchanged lines$/ }).count(), 0);
    await dialog.getByRole("button", { name: "Collapse all" }).click();
    assert.equal(await dialog.getByRole("button", { name: /^12 unchanged lines$/ }).count(), 2);

    // Another commit: compared, folds closed.
    await bars.first().click();
    await cards(page).nth(1).click();
    await dialog.getByText(`Commit ${short[1]}`, { exact: true }).waitFor();
    assert.equal(await cards(page).nth(1).getAttribute("aria-pressed"), "true");
    assert.equal(await cards(page).first().getAttribute("aria-pressed"), "false");
    await side(page, "theirs", "only").filter({ hasText: "line 5" }).waitFor();
    await dialog.getByRole("button", { name: "3 unchanged lines", exact: true }).waitFor();
    await dialog.getByRole("button", { name: "12 unchanged lines", exact: true }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: /^Collapse \d+ unchanged/ }).count(), 0);

    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(page.url(), address);
  });

  test("Escape closes it; when the file on disk equals the latest commit, the one before is compared", async () => {
    const { files, short } = usual();
    const { page, address } = await inRepository(files);
    await openGuide(page);

    await versionsButton(page).click();
    await cards(page).first().waitFor();
    await dialogOf(page).getByText(`Commit ${short[1]}`, { exact: true }).waitFor();
    assert.equal(await cards(page).nth(1).getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Escape");
    await dialogOf(page).waitFor({ state: "detached" });
    assert.equal(page.url(), address);
  });

  test("the period lists older commits after Refresh and is brought into range", async () => {
    const { files, short } = usual(guide({ 5: "five edited" }));
    const { page, address } = await inRepository(files);
    await openGuide(page);
    await versionsButton(page).click();
    const dialog = dialogOf(page);
    await cards(page).first().waitFor();
    const period = dialog.getByRole("spinbutton", { name: "Period (days)" });
    assert.equal(await period.inputValue(), "180");
    assert.equal(await cards(page).count(), 2);
    assert.ok(!(await dialog.innerText()).includes("Start the guide"));

    await period.fill("365");
    await dialog.getByRole("button", { name: "Refresh" }).click();
    await until(async () => (await cards(page).count()) === 3, "the older commit listed");
    assert.ok((await cards(page).last().innerText()).includes(short[0]!));

    await period.fill("99999");
    await dialog.getByRole("button", { name: "Refresh" }).click();
    await until(async () => (await period.inputValue()) === "3650", "the period brought into range");
    await period.fill("2");
    await dialog.getByRole("button", { name: "Refresh" }).click();
    await dialog.getByText("No commits for this Document in this period.").waitFor();
    assert.equal(page.url(), address);
  });

  test("the period set in Project settings is the one Versions opens with; the dialog's own field does not change it", async () => {
    const { files, short } = usual(guide({ 5: "five edited" }));
    const { page, address } = await inRepository(files);
    await openGuide(page);
    const menu = await openSwitcher({ page });
    await menu.getByRole("button", { name: "Project settings…" }).click();
    const settings = page.getByRole("dialog", { name: "Project settings" });
    const kept = settings.getByRole("spinbutton", { name: "Versions period (days)" });
    assert.equal(await kept.inputValue(), "180");
    await kept.fill("99999");
    await kept.press("Enter");
    await until(async () => (await kept.inputValue()) === "3650", "the setting brought into range");
    await kept.fill("365");
    await kept.press("Enter");
    await settings.getByRole("button", { name: "Close" }).click();
    await settings.waitFor({ state: "detached" });

    await versionsButton(page).click();
    const dialog = dialogOf(page);
    const period = dialog.getByRole("spinbutton", { name: "Period (days)" });
    await until(async () => (await cards(page).count()) === 3, "the older commit listed");
    assert.equal(await period.inputValue(), "365");
    assert.ok((await cards(page).last().innerText()).includes(short[0]!));
    await period.fill("20");
    await dialog.getByRole("button", { name: "Refresh" }).click();
    await until(async () => (await cards(page).count()) === 2, "the shorter period");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    await versionsButton(page).click();
    await until(async () => (await cards(page).count()) === 3, "the setting again");
    assert.equal(await dialogOf(page).getByRole("spinbutton", { name: "Period (days)" }).inputValue(), "365");
    assert.equal(page.url(), address);
  });

  test("there is no Versions button without a Repository grant or while editing; a Kanban board has it", async () => {
    const { files } = usual();
    const without = await inRepository(files, { connect: false });
    await openGuide(without.page);
    await without.page.getByRole("button", { name: "Edit", exact: true }).waitFor();
    assert.equal(await versionsButton(without.page).count(), 0);
    assert.equal(without.page.url(), without.address);

    const { page, address } = await inRepository(files);
    await openGuide(page);
    await versionsButton(page).waitFor();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Done", exact: true }).waitFor();
    assert.equal(await versionsButton(page).count(), 0);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await versionsButton(page).waitFor();

    await page.getByRole("link", { name: "board.md", exact: true }).click();
    await page.getByRole("heading", { name: "Board" }).waitFor();
    await versionsButton(page).click();
    await dialogOf(page).getByText("board.md").first().waitFor();
    await cards(page).first().waitFor();
    assert.ok((await cards(page).first().innerText()).includes("Write the guide"));
    assert.equal(page.url(), address);
  });

  test("the button appears when the repository is connected and goes when it is disconnected, with no reload", async () => {
    const { files } = usual();
    const { page, host, repo, address } = await inRepository(files, { connect: false });
    await openGuide(page);
    assert.equal(await versionsButton(page).count(), 0);
    const menu = await openSwitcher({ page });
    await menu.getByRole("button", { name: "Project settings…" }).click();
    const settings = page.getByRole("dialog", { name: "Project settings" });
    host.folders.choose(repo);
    await settings.getByRole("button", { name: "Connect repository" }).click();
    await settings.getByRole("button", { name: "Disconnect" }).click();
    await settings.getByRole("button", { name: "Connect repository" }).waitFor();
    await settings.getByRole("button", { name: "Close" }).click();
    await settings.waitFor({ state: "detached" });
    assert.equal(await versionsButton(page).count(), 0);
    assert.equal(page.url(), address);
  });

  test("a commit with no file at this path says so, and shows the current file as added", async () => {
    const { files } = repository(
      [
        { days: 10, message: "Write the guide", files: { "docs/a.md": guide() } },
        { days: 6, message: "Remove the guide", files: { "docs/a.md": null } },
        { days: 2, message: "Restore the guide", files: { "docs/a.md": guide() } },
      ],
    );
    const { page, address } = await inRepository(files);
    await openGuide(page);
    await versionsButton(page).click();
    const dialog = dialogOf(page);
    await cards(page).first().waitFor();
    // The file on disk equals the latest commit: the commit before, which deleted it, is compared.
    await dialog.getByText("This Document does not exist in this commit. The current file is shown as added.").waitFor();
    assert.equal(await side(page, "mine", "only").count(), 31);
    assert.equal(await side(page, "theirs", "missing").count(), 31);

    await cards(page).first().click();
    await dialog.getByRole("button", { name: "31 unchanged lines", exact: true }).waitFor();
    assert.equal(await dialog.getByText("This Document does not exist in this commit.").count(), 0);
    assert.equal(page.url(), address);
  });

  test("a repository folder without .git shows a translated failure and no commits", async () => {
    const { files } = usual();
    const noGit = Object.fromEntries(Object.entries(files).filter(([path]) => !path.startsWith(".git/")));
    const { page, address } = await inRepository(files, { repositoryFiles: noGit });
    await openGuide(page);
    await versionsButton(page).click();
    const alert = dialogOf(page).getByRole("alert");
    await alert.getByText("The connected repository folder has no .git: connect the repository's root in Project settings.").waitFor();
    assert.equal(await cards(page).count(), 0);
    assert.equal(page.url(), address);
  });

  test("< restores one block into the file on disk, Undo puts it back, and the reading view shows the restored line", async () => {
    const { files, short } = usual(guide({ 5: "five edited", 15: "disk edit" }));
    const { page, host, repo, address } = await inRepository(files);
    const docs = host.folders.inside(repo, "docs");
    await openGuide(page);
    await versionsButton(page).click();
    const dialog = dialogOf(page);
    await cards(page).first().waitFor();
    await side(page, "mine", "only").filter({ hasText: "disk edit" }).waitFor();
    const restore = dialog.getByRole("button", { name: `Restore this block from commit ${short[2]}` });
    assert.equal(await restore.count(), 1);
    assert.equal(await restore.getAttribute("title"), `Restore this block from commit ${short[2]}`);

    await restore.click();
    await dialog.getByText("Block restored.").waitFor();
    assert.equal(await restore.count(), 0);
    assert.equal(await side(page, "mine", "only").count(), 0);
    await until(() => host.folders.read(docs, "a.md") === guide({ 5: "five edited" }), "the commit's line written to disk");

    await dialog.getByRole("button", { name: "Undo" }).click();
    await dialog.getByText("Restore undone.").waitFor();
    await side(page, "mine", "only").filter({ hasText: "disk edit" }).waitFor();
    assert.equal(host.folders.read(docs, "a.md"), guide({ 5: "five edited", 15: "disk edit" }));
    assert.equal(await dialog.getByRole("button", { name: "Undo" }).count(), 0);

    await restore.click();
    await dialog.getByText("Block restored.").waitFor();
    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByText(/line 15/).waitFor();
    assert.equal(await page.getByText(/disk edit/).count(), 0);
    assert.equal(page.url(), address);
  });

  test("a restore that removes a line keeps the open folds open", async () => {
    const { files, short } = usual(guide({ 5: "five edited", 10: "line 10\nextra line", 20: "disk twenty" }));
    const { page, host, repo, address } = await inRepository(files);
    const docs = host.folders.inside(repo, "docs");
    await openGuide(page);
    await versionsButton(page).click();
    const dialog = dialogOf(page);
    await side(page, "mine", "only").filter({ hasText: "extra line" }).waitFor();
    // The last fold: lines 24 to 30 of the guide, after the change on line 20.
    await dialog.getByRole("button", { name: "7 unchanged lines", exact: true }).click();
    await dialog.getByRole("button", { name: "Collapse 7 unchanged lines", exact: true }).waitFor();

    await dialog.getByRole("button", { name: `Restore this block from commit ${short[2]}` }).first().click();
    await dialog.getByText("Block restored.").waitFor();
    await until(() => host.folders.read(docs, "a.md") === guide({ 5: "five edited", 20: "disk twenty" }), "the extra line removed on disk");
    assert.equal(await side(page, "mine", "only").filter({ hasText: "extra line" }).count(), 0);
    assert.equal(await dialog.getByRole("button", { name: "Collapse 7 unchanged lines", exact: true }).count(), 1);
    assert.equal(page.url(), address);
  });

  test("a restore on a file an agent changed reloads the comparison, writes nothing and offers no Undo", async () => {
    const { files, short } = usual(guide({ 5: "five edited", 15: "disk edit" }));
    const { page, host, repo, address } = await inRepository(files);
    const docs = host.folders.inside(repo, "docs");
    await openGuide(page);
    await versionsButton(page).click();
    const dialog = dialogOf(page);
    await cards(page).first().waitFor();
    await side(page, "mine", "only").filter({ hasText: "disk edit" }).waitFor();

    const agent = guide({ 5: "five edited", 15: "disk edit", 20: "agent line" });
    host.folders.write(docs, "a.md", agent);
    await dialog.getByRole("button", { name: `Restore this block from commit ${short[2]}` }).first().click();
    await dialog.getByRole("alert").getByText("The file changed on disk: the comparison was reloaded. Nothing was written.").waitFor();
    await side(page, "mine", "only").filter({ hasText: "agent line" }).waitFor();
    assert.equal(host.folders.read(docs, "a.md"), agent);
    assert.equal(await dialog.getByRole("button", { name: "Undo" }).count(), 0);
    assert.equal(page.url(), address);
  });

  test("the history follows a rename: the commit before it is listed and compared", async () => {
    const { files, short } = repository([
      { days: 10, message: "Write old", files: { "docs/old.md": guide({ 5: "old five" }) } },
      { days: 6, message: "Rename it", files: { "docs/old.md": null, "docs/a.md": guide({ 5: "old five" }) } },
      { days: 2, message: "Edit it", files: { "docs/a.md": guide({ 5: "new five" }) } },
    ], guide({ 5: "new five", 9: "disk nine" }));
    const { page, address } = await inRepository(files);
    await openGuide(page);
    await versionsButton(page).click();
    const dialog = dialogOf(page);
    await cards(page).first().waitFor();
    await until(async () => (await cards(page).count()) === 3, "the commit before the rename listed");
    await cards(page).last().click();
    await dialog.getByText(`Commit ${short[0]} · old.md`, { exact: true }).waitFor();
    await side(page, "theirs", "only").filter({ hasText: "old five" }).waitFor();
    assert.equal(page.url(), address);
  });

  test("a hidden text file opened in its panel has Versions: compared and restored; a large one has none", async () => {
    const big = `{"data": "${"x".repeat(300 * 1024)}"}\n`;
    const { files, short } = repository([
      { days: 10, message: "Add the config", files: { "docs/a.md": "# A\n", "docs/config.json": '{\n  "a": 1,\n  "b": 2\n}\n', "docs/big.json": big } },
      { days: 5, message: "Change b", files: { "docs/config.json": '{\n  "a": 1,\n  "b": 3\n}\n' } },
    ]);
    files["docs/config.json"] = new TextEncoder().encode('{\n  "a": 1,\n  "b": 4\n}\n');
    const { page, host, repo, address } = await inRepository(files);
    const docs = host.folders.inside(repo, "docs");
    await page.getByRole("button", { name: "Show hidden items" }).click();

    await page.getByRole("link", { name: "big.json" }).click();
    await page.getByRole("heading", { level: 2, name: "big.json" }).waitFor();
    assert.equal(await versionsButton(page).count(), 0);

    await page.getByRole("link", { name: "config.json" }).click();
    await page.getByRole("heading", { level: 2, name: "config.json" }).waitFor();
    await versionsButton(page).click();
    const dialog = page.getByRole("dialog", { name: "File versions" });
    await dialog.getByText("config.json").first().waitFor();
    await cards(page).first().waitFor();
    const texts = await cards(page).allInnerTexts();
    assert.equal(texts.length, 2);
    assert.ok(texts[0]!.includes(short[1]!) && texts[0]!.includes("Change b"), texts[0]);
    await dialog.locator('.cell[data-side="mine"][data-state="only"]').filter({ hasText: '"b": 4' }).waitFor();

    await dialog.getByRole("button", { name: `Restore this block from commit ${short[1]}` }).click();
    await dialog.getByText("Block restored.").waitFor();
    await until(() => host.folders.read(docs, "config.json") === '{\n  "a": 1,\n  "b": 3\n}\n', "the commit's line written to disk");
    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.locator("section.file pre").filter({ hasText: '"b": 3' }).waitFor();
    assert.equal(page.url(), address);
  });

  test("in French, the dialog and its labels are in French", async () => {
    const { files, short } = usual(guide({ 5: "five edited", 15: "disk edit" }));
    const { page, address } = await inRepository(files, { locale: "fr" });
    await openGuide(page);
    await versionsButton(page, true).click();
    const dialog = dialogOf(page, true);
    await cards(page).first().waitFor();
    await dialog.getByLabel("Période (jours)").waitFor();
    await dialog.getByRole("button", { name: "Actualiser" }).waitFor();
    await dialog.getByText("Fichier actuel", { exact: true }).waitFor();
    await dialog.getByText(`Commit ${short[2]}`, { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "12 lignes inchangées", exact: true }).first().click();
    await dialog.getByRole("button", { name: "Replier 12 lignes inchangées" }).waitFor();
    await dialog.getByRole("button", { name: `Restaurer ce bloc depuis le commit ${short[2]}` }).first().click();
    await dialog.getByText("Bloc restauré.").waitFor();
    await dialog.getByRole("button", { name: "Annuler" }).waitFor();
    const french = new Intl.DateTimeFormat("fr", { dateStyle: "medium" }).format(Date.now() - 5 * DAY);
    assert.ok((await cards(page).first().innerText()).includes(french), `the date ${french} is shown in French`);
    assert.equal(page.url(), address);
  });
});
