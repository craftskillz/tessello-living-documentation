// Ticket 33: the Project's palette for the five table colours, in .living-doc.json (`colorPalette`).
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { type Opened, useBrowser, withProject } from "./living-documentation.ts";

useBrowser();

const FILE = ".living-doc.json";
const RED = "#ff0000";
const DEFAULT_SUCCESS = "#22c55e";
const DEFAULT_INFO = "#3b82f6";

const TABLES = (kind: string) => `<!-- table-color: ${kind} -->\n| H1 | H2 |\n| -- | -- |\n| a  | b  |\n\n`;
const SOURCE = `# A\n\n${TABLES("info")}${TABLES("success")}`;

/** The View's address at the start of the journey: after every journey, it must not have changed (an about:srcdoc page in the Host). */
let watched: { page: Opened["page"]; address: string } | null = null;

async function project(...args: Parameters<typeof withProject>) {
  const opened = await withProject(...args);
  watched = { page: opened.page, address: opened.page.url() };
  return opened;
}

afterEach(() => {
  if (watched) assert.equal(watched.page.url(), watched.address);
  watched = null;
});

type Locator = ReturnType<Opened["page"]["locator"]>;
type Where = { locator(selector: string): Locator; getByRole: Opened["page"]["getByRole"] };

/** A computed colour (`#rrggbb` or `rgb(r g b)`) as `#rrggbb`. */
const hex = (value: string) => {
  const rgb = value.trim().toLowerCase().match(/^rgb\((\d+)[ ,]+(\d+)[ ,]+(\d+)\)$/);
  return rgb ? `#${rgb.slice(1).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}` : value.trim().toLowerCase();
};
const accentOfTable = (table: Locator) => table.evaluate((each) => getComputedStyle(each).getPropertyValue("--tbl-accent")).then(hex);

/** The `--tbl-accent` of the first table of a colour. */
const accentOf = (where: Where, kind: string) => accentOfTable(where.locator(`table.table-color-${kind}`).first());

async function openSettings(page: Opened["page"]) {
  await page.locator(".switcher > button").click();
  const menu = page.getByRole("dialog", { name: /^Projects$/ });
  await menu.getByRole("button", { name: "Project settings…" }).click();
  return page.getByRole("dialog", { name: "Project settings" });
}

const colours = (settings: Where) => settings.getByRole("group", { name: "Table colours" });
const stored = (host: Opened["host"], disk: Parameters<Opened["host"]["folders"]["read"]>[0]) => JSON.parse(String(host.folders.read(disk, FILE)));

describe("the Project's table colours", () => {
  test("a colorPalette entry recolours that colour in the reading view, the others keep theirs", async () => {
    const { page } = await project({ "a.md": SOURCE, [FILE]: '{"colorPalette":{"info":"#ff0000"}}\n' });
    await until(async () => (await accentOf(page, "info")) === RED, "info is red");
    assert.equal(await accentOf(page, "success"), DEFAULT_SUCCESS);
  });

  test("a malformed palette keeps today's colours", async () => {
    const { page } = await project({ "a.md": SOURCE, [FILE]: '{"colorPalette":{"info":"red","bogus":"#ff0000"}}\n' });
    await page.locator("table.table-color-info").first().waitFor();
    assert.equal(await accentOf(page, "info"), DEFAULT_INFO);
  });

  test("picking a colour writes only colorPalette and the reading view follows; Restore defaults removes the key", async () => {
    const { page, host, disk } = await project({ "a.md": SOURCE, [FILE]: '{"tagSuggestions":["todo"]}\n' });
    await page.locator("table.table-color-info").first().waitFor();
    assert.equal(await accentOf(page, "info"), DEFAULT_INFO);
    const settings = await openSettings(page);
    const info = colours(settings).getByLabel("Info", { exact: true });
    assert.equal(await info.inputValue(), DEFAULT_INFO);
    await info.fill(RED);
    await until(async () => (await accentOf(page, "info")) === RED, "info is red");
    await until(async () => String(host.folders.read(disk, FILE)).includes("colorPalette"), "the key written");
    assert.deepEqual(stored(host, disk), { tagSuggestions: ["todo"], colorPalette: { info: RED } });
    assert.equal(await accentOf(page, "success"), DEFAULT_SUCCESS);

    await settings.getByRole("button", { name: "Restore defaults: Table colours" }).click();
    await until(async () => (await accentOf(page, "info")) === DEFAULT_INFO, "info is blue again");
    await until(async () => !String(host.folders.read(disk, FILE)).includes("colorPalette"), "the key removed");
    assert.deepEqual(stored(host, disk), { tagSuggestions: ["todo"] });
    assert.equal(await colours(settings).getByLabel("Info", { exact: true }).inputValue(), DEFAULT_INFO);
  });

  test("picking a colour back to its default keeps the file clean", async () => {
    const { page, host, disk } = await project({ "a.md": SOURCE, [FILE]: '{"colorPalette":{"info":"#ff0000"}}\n' });
    await until(async () => (await accentOf(page, "info")) === RED, "info is red");
    const settings = await openSettings(page);
    await colours(settings).getByLabel("Info", { exact: true }).fill(DEFAULT_INFO);
    await until(async () => !String(host.folders.read(disk, FILE)).includes("colorPalette"), "the key removed");
    await until(async () => (await accentOf(page, "info")) === DEFAULT_INFO, "info is blue again");
  });

  test("a change made on disk by someone else is picked up", async () => {
    const { page, host, disk } = await project({ "a.md": SOURCE });
    await page.locator("table.table-color-success").first().waitFor();
    assert.equal(await accentOf(page, "success"), DEFAULT_SUCCESS);
    host.folders.write(disk, FILE, '{"colorPalette":{"success":"#00ff00"}}\n');
    await until(async () => (await accentOf(page, "success")) === "#00ff00", "success is green");
    host.folders.write(disk, FILE, "{}\n");
    await until(async () => (await accentOf(page, "success")) === DEFAULT_SUCCESS, "success is back");
  });

  test("the HTML view's page shows the Project's colour", async () => {
    const files = { "a.md": `---\nhtml_template: article\n---\n# Title\n\n${TABLES("info")}`, [FILE]: '{"colorPalette":{"info":"#ff0000"}}\n' };
    const { page } = await project(files);
    await page.getByRole("button", { name: "View as HTML" }).click();
    const view = page.getByRole("region", { name: "HTML view of the document" });
    await view.locator(".ld-html-page").waitFor();
    await until(async () => (await accentOf(view, "info")) === RED, "the page's table is red");
  });

  test("the snippet dialog's table grid shows the Project's colour", async () => {
    const { page } = await project({ "a.md": `# A\n\n${TABLES("info")}`, [FILE]: '{"colorPalette":{"info":"#ff0000"}}\n' });
    await page.getByRole("cell", { name: "a", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit table" }).click();
    const grid = page.getByRole("dialog").locator(".grid table");
    await grid.waitFor();
    assert.equal(await accentOfTable(grid), RED);
  });

  test("a refused write shows the message and the picker goes back to the previous colour", async () => {
    const { page, host, disk } = await project({ "a.md": SOURCE, [FILE]: "[1]" });
    await page.locator("table.table-color-info").first().waitFor();
    const settings = await openSettings(page);
    const info = colours(settings).getByLabel("Info", { exact: true });
    await info.fill(RED);
    await page.getByText("The Project's .living-doc.json is not valid JSON").waitFor();
    await until(async () => (await info.inputValue()) === DEFAULT_INFO, "the picker back");
    assert.equal(await accentOf(page, "info"), DEFAULT_INFO);
    assert.equal(host.folders.read(disk, FILE), "[1]");
  });

  test("French: the group, the colours and the Restore defaults button are named in French", async () => {
    const { page } = await project({ "a.md": SOURCE }, { locale: "fr" });
    await page.locator("table.table-color-info").first().waitFor();
    await page.locator(".switcher > button").click();
    await page.getByRole("dialog", { name: /^Projets$/ }).getByRole("button", { name: /Réglages du projet/ }).click();
    const settings = page.getByRole("dialog", { name: "Réglages du projet" });
    const group = settings.getByRole("group", { name: "Couleurs des tableaux" });
    for (const name of ["Info", "Succès", "Avertissement", "Danger", "Note"]) await group.getByLabel(name, { exact: true }).waitFor();
    await settings.getByRole("button", { name: "Rétablir les valeurs par défaut : Couleurs des tableaux" }).waitFor();
  });
});
