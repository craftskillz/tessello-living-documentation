// Automatic commits (ticket 34): what `tessello sync` last did for the Project, shown in Project settings › Repository, and the
// `sync` key the Module keeps for it. `syncStatus` is preset in the Module's storage, as sync writes it. Like every journey in the
// View, none may change the page address (the View is an about:srcdoc page in the Host).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import type { Page } from "playwright";
import { openView, useBrowser } from "./living-documentation.ts";

useBrowser();

const scratch: string[] = [];
after(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** The files of a real git repository (`.git` included) holding docs/a.md and one commit. */
function realRepository(): Record<string, Uint8Array> {
  const dir = mkdtempSync(join(tmpdir(), "sync-"));
  scratch.push(dir);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Ada", GIT_AUTHOR_EMAIL: "a@example.com", GIT_COMMITTER_NAME: "Ada", GIT_COMMITTER_EMAIL: "a@example.com" } });
  git("init", "-b", "main");
  git("config", "commit.gpgsign", "false");
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs/a.md"), "# A\n");
  git("add", "-A");
  git("commit", "-m", "Start");
  const files: Record<string, Uint8Array> = {};
  const walk = (base: string) => {
    for (const entry of readdirSync(join(dir, base), { withFileTypes: true })) {
      const path = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else files[path] = new Uint8Array(readFileSync(join(dir, path)));
    }
  };
  walk("");
  return files;
}

const PLAIN = { "docs/a.md": new TextEncoder().encode("# A\n") };

/** The View with the Project docs/ of a repository connected on, the repository itself too unless `connect` is false. */
async function inRepository(options: { files?: Record<string, Uint8Array>; locale?: string; connect?: boolean } = {}) {
  const fr = options.locale === "fr";
  const opened = await openView({ locale: options.locale });
  const repo = opened.host.folders.create("repo", options.files ?? PLAIN);
  opened.host.folders.choose(opened.host.folders.inside(repo, "docs"));
  await opened.page.getByRole("button", { name: fr ? "Connecter un dossier" : "Connect a folder" }).click();
  await opened.page.getByRole("navigation", { name: "Documents" }).waitFor();
  const address = opened.page.url();
  if (options.connect !== false) {
    const settings = await openSettings(opened.page, fr);
    opened.host.folders.choose(repo);
    await settings.getByRole("button", { name: fr ? "Connecter un dépôt" : "Connect repository" }).click();
    await settings.getByRole("button", { name: fr ? "Déconnecter" : "Disconnect" }).waitFor();
    await closeSettings(opened.page, fr);
  }
  return { ...opened, repo, address };
}

async function openSettings(page: Page, fr = false) {
  await page.locator(".switcher > button").click();
  await page.getByRole("dialog", { name: fr ? "Projets" : "Projects" }).getByRole("button", { name: fr ? "Réglages du projet…" : "Project settings…" }).click();
  const settings = page.getByRole("dialog", { name: fr ? "Réglages du projet" : "Project settings" });
  await settings.waitFor();
  return settings;
}

async function closeSettings(page: Page, fr = false) {
  const settings = page.getByRole("dialog", { name: fr ? "Réglages du projet" : "Project settings" });
  await settings.getByRole("button", { name: fr ? "Fermer" : "Close" }).click();
  await settings.waitFor({ state: "detached" });
}

type Entry = { id: string; name: string; repository: string; path?: string; location?: string };
const syncEntries = async (host: { storage: { get(key: string): Promise<unknown> } }) => ((await host.storage.get("sync")) as { projects: Entry[] } | null)?.projects ?? [];

/** Writes `syncStatus` as sync does: a heartbeat `ageSeconds` old, and `project` for the Project. */
async function writeStatus(host: Parameters<typeof syncEntries>[0] & { storage: { set(key: string, value: never): Promise<void> } }, project: Record<string, unknown> | null, ageSeconds = 5) {
  const [entry] = await syncEntries(host);
  const projects = project ? { [entry!.id]: project } : {};
  await host.storage.set("syncStatus", { heartbeat: new Date(Date.now() - ageSeconds * 1000).toISOString(), projects } as never);
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

describe("Project settings › Repository: automatic commits", () => {
  test("shows the last automatic commit, with its documents counted", async () => {
    const { page, host, address } = await inRepository();
    await writeStatus(host, { repository: "/Users/me/code/repo", lastCommit: { at: new Date().toISOString(), id: "a1b2c3d", documents: ["docs/a.md", "docs/b.md"] } });
    const settings = await openSettings(page);
    const time = new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(Date.now());
    await settings.getByText(`Last automatic commit: today at ${time} (a1b2c3d), 2 documents`).waitFor();
    assert.equal(await settings.getByText("not running").count(), 0);
    assert.equal(page.url(), address);
  });

  test("says 1 document in the singular, and shows the commit in French", async () => {
    const { page, host } = await inRepository({ locale: "fr" });
    await writeStatus(host, { repository: "/Users/me/code/repo", lastCommit: { at: new Date().toISOString(), id: "a1b2c3d", documents: ["docs/a.md"] } });
    const settings = await openSettings(page, true);
    const time = new Intl.DateTimeFormat("fr", { timeStyle: "short" }).format(Date.now());
    await settings.getByText(`Dernier commit automatique : aujourd’hui à ${time} (a1b2c3d), 1 document`).waitFor();
  });

  test("shows a problem in red while sync runs", async () => {
    const { page, host } = await inRepository();
    await writeStatus(host, { repository: "/Users/me/code/repo", problem: { kind: "not-a-repository", message: "Cannot sync: it is not a git repository (no .git).", since: minutesAgo(3) } });
    const settings = await openSettings(page);
    const alert = settings.getByRole("alert").filter({ hasText: "Automatic commits stopped: Cannot sync: it is not a git repository (no .git)." });
    await alert.waitFor();
    assert.ok(/^rgb\(/.test(await alert.evaluate((node) => getComputedStyle(node).color)));
  });

  test("shows the problem in French", async () => {
    const { page, host } = await inRepository({ locale: "fr" });
    await writeStatus(host, { repository: "/r", problem: { kind: "x", message: "Boom", since: minutesAgo(1) } });
    const settings = await openSettings(page, true);
    await settings.getByRole("alert").filter({ hasText: "Les commits automatiques sont arrêtés : Boom" }).waitFor();
  });

  test("when sync is not running, shows the command with the typed location and copies it, last commit kept", async () => {
    const { page, host, address } = await inRepository();
    const settings0 = await openSettings(page);
    await settings0.getByLabel("Location").fill("/Users/me/code/repo/docs");
    await settings0.getByLabel("Location").press("Enter");
    await closeSettings(page);
    // The Project path in the repository is "docs": the repository is the location minus it.
    await writeStatus(host, { repository: "/Users/me/code/repo", lastCommit: { at: minutesAgo(2), id: "abc1234", documents: ["docs/a.md"] } }, 600);
    const settings = await openSettings(page);
    await settings.getByText("The synchronisation is not running. In the Modules folder, run:").waitFor();
    await settings.getByText("Last automatic commit:").waitFor();
    const command = settings.locator("code");
    assert.equal(await command.innerText(), "npx tessello sync --living-documentation /Users/me/code/repo");
    await settings.getByRole("button", { name: "Copy" }).click();
    await settings.getByText("Copied").waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "npx tessello sync --living-documentation /Users/me/code/repo");
    assert.equal(page.url(), address);
  });

  test("with no status at all and no known path, shows a placeholder to replace and the location hint", async () => {
    const { page } = await inRepository();
    const settings = await openSettings(page);
    await settings.getByText("The synchronisation is not running. In the Modules folder, run:").waitFor();
    assert.equal(await settings.locator("code").innerText(), "npx tessello sync --living-documentation '<path of repo>'");
    await settings.getByText("Type this Project's location above so that the synchronisation finds it in the repository, or commit it once.").waitFor();
  });

  test("when sync runs but has no entry for this Project, says it runs for another repository", async () => {
    const { page, host } = await inRepository();
    await writeStatus(host, null);
    const settings = await openSettings(page);
    await settings.getByText("The synchronisation is running, but not for this repository. In the Modules folder, run:").waitFor();
  });

  test("the French command text and placeholder", async () => {
    const { page } = await inRepository({ locale: "fr" });
    const settings = await openSettings(page, true);
    await settings.getByText("La synchronisation ne tourne pas. Dans le dossier des Modules, lancez :").waitFor();
    assert.equal(await settings.locator("code").innerText(), "npx tessello sync --living-documentation '<chemin de repo>'");
    await settings.getByText("Saisissez l'emplacement de ce Projet ci-dessus pour que la synchronisation le retrouve dans le dépôt, ou faites-y un premier commit.").waitFor();
  });

  test("a failed copy says so", async () => {
    const { page } = await inRepository();
    const settings = await openSettings(page);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("no")) }, configurable: true });
    });
    await settings.getByRole("button", { name: "Copy" }).click();
    await settings.getByRole("alert").filter({ hasText: "The command could not be copied" }).waitFor();
  });

  test("shows nothing new without a Repository grant", async () => {
    const { page } = await inRepository({ connect: false });
    const settings = await openSettings(page);
    await settings.getByRole("button", { name: "Connect repository" }).waitFor();
    assert.equal(await settings.getByText("synchronisation").count(), 0);
    assert.equal(await settings.locator("code").count(), 0);
  });

  test("records the Project path in the sync key when Versions finds it", async () => {
    const files = realRepository();
    const { page, host, address } = await inRepository({ files, connect: true });
    // Connecting found it in the background; forget it to see Versions record it.
    await until(async () => (await syncEntries(host))[0]?.path === "docs");
    const [entry] = await syncEntries(host);
    await host.storage.set("sync", { projects: [{ id: entry!.id, name: entry!.name, repository: entry!.repository }] });
    await page.getByRole("link", { name: "a.md", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "A" }).waitFor();
    await page.getByRole("button", { name: "Versions", exact: true }).click();
    await page.getByRole("dialog", { name: "Document versions" }).locator(".commits button").first().waitFor();
    await until(async () => (await syncEntries(host))[0]?.path === "docs");
    assert.equal(page.url(), address);
  });

  test("finds the path in the background when Project settings opens, and the hint goes away", async () => {
    const files = realRepository();
    const { page, host } = await inRepository({ files });
    await until(async () => (await syncEntries(host))[0]?.path === "docs");
    const [entry] = await syncEntries(host);
    await host.storage.set("sync", { projects: [{ id: entry!.id, name: entry!.name, repository: entry!.repository }] });
    const settings = await openSettings(page);
    await until(async () => (await syncEntries(host))[0]?.path === "docs");
    await settings.getByText("Type this Project's location above").waitFor({ state: "detached" });
  });
});
