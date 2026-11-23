// What the browser tests share: the built package served from dist/, its View opened in Chromium against the Test Host
// of the SDK, whose disk and folder picker the tests drive. Every wait goes through `until` or Playwright's own wait.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before } from "node:test";
import { type Browser, chromium, type Page } from "playwright";
import {
  createTestHost,
  type FolderServer,
  serveFolder,
  setWaitTimeout,
  slowDownCpu,
  type TestFolder,
  type TestHost,
  type TestHostOptions,
  type TestSurface,
} from "@tessello/sdk/testing";

// The View checks the Project for agent edits every 5 seconds: waits must outlast one check.
setWaitTimeout(12_000);

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const manifest = JSON.parse(
  await readFile(`${DIST}manifest.json`, "utf8").catch(() => {
    throw new Error("No dist/: run `npm run build` before the browser tests.");
  }),
);
const module = { id: manifest.id as string, version: manifest.version as string };

let browser: Browser;
let server: FolderServer;

/** Serves dist/ and starts Chromium for the tests of the file that calls it. */
export function useBrowser(): void {
  before(async () => {
    server = await serveFolder(DIST);
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await server?.close();
  });
}

export interface Opened {
  page: Page;
  host: TestHost;
  surface: TestSurface;
}

/** Opens the View on a Test Host of its own, with the Module's Permissions. */
export async function openView(options: { storage?: TestHostOptions["storage"]; locale?: string; host?: TestHost } = {}): Promise<Opened> {
  const host = options.host ?? createTestHost({ module, permissions: manifest.permissions, storage: options.storage, locale: options.locale });
  const page = await (await browser.newContext()).newPage();
  await slowDownCpu(page);
  const surface = await host.attach(page, { surface: "view" });
  await page.goto(`${server.url}/${manifest.view.entry}`);
  return { page, host, surface };
}

/** The View with a Project connected on a folder holding `files`, as the User does on a first visit. */
export async function withProject(
  files: Record<string, string | Uint8Array>,
  options: { locale?: string } = {},
): Promise<Opened & { disk: TestFolder }> {
  const opened = await openView({ locale: options.locale });
  const disk = opened.host.folders.create("docs", files);
  opened.host.folders.choose(disk);
  await opened.page.getByRole("button", { name: options.locale === "fr" ? "Connecter un dossier" : "Connect a folder" }).click();
  await opened.page.getByRole("navigation", { name: "Documents" }).waitFor();
  return { ...opened, disk };
}
