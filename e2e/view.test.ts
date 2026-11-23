import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { until } from "@tessello/sdk/testing";
import { openView, useBrowser, withProject } from "./living-documentation.ts";

useBrowser();

describe("a first visit", () => {
  test("offers to connect a folder; once connected, the Tree shows and the first Document opens", async () => {
    const { page } = await withProject({ "zeta.md": "# Zeta\n", "guide/intro.md": "# Introduction\n\nWelcome.\n" });

    const tree = page.getByRole("navigation", { name: "Documents" });
    assert.deepEqual(await tree.getByRole("link").allInnerTexts(), ["intro.md", "zeta.md"]);
    await page.getByRole("heading", { level: 1, name: "Introduction" }).waitFor();
    await page.getByText("Welcome.").waitFor();
  });

  test("cancelling the picker leaves the offer", async () => {
    const { page, host } = await openView();
    host.folders.choose(null);
    await page.getByRole("button", { name: "Connect a folder" }).click();
    await page.getByRole("button", { name: "Connect a folder" }).waitFor();
  });
});

describe("reading", () => {
  test("a Document of the Tree opens without changing the page's address, and a reload reopens it", async () => {
    const { page } = await withProject({ "a.md": "# A\n", "b.md": "# Bee\n\nSecond.\n" });
    // In the Host, the View is an about:srcdoc page: it cannot change its address, and a link would leave it.
    const address = page.url();

    await page.getByRole("link", { name: "b.md" }).click();
    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();
    assert.equal(page.url(), address);

    await page.reload();
    await page.getByRole("heading", { level: 1, name: "Bee" }).waitFor();
  });

  test("an agent's edit appears in place", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nOld text.\n" });
    await page.getByText("Old text.").waitFor();

    host.folders.write(disk, "a.md", "# A\n\nAn agent's text.\n");

    await page.getByText("An agent's text.").waitFor();
  });
});

describe("editing", () => {
  test("a change is saved a moment after typing stops; Done goes back to reading", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nFirst.\n" });

    await page.getByRole("button", { name: "Edit" }).click();
    const editor = page.getByRole("textbox", { name: "Markdown" });
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("Added.\n");

    await until(() => host.folders.read(disk, "a.md")?.includes("Added."), "the change on disk");
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByText("Added.").waitFor();
  });

  test("an agent's edit while editing: Take theirs puts their text in the editor", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nMine.\n" });
    await page.getByRole("button", { name: "Edit" }).click();

    host.folders.write(disk, "a.md", "# A\n\nTheirs.\n");

    const banner = page.getByRole("alert");
    await banner.getByText("changed outside").waitFor();
    await banner.getByRole("button", { name: "Take theirs" }).click();
    await page.getByRole("textbox", { name: "Markdown" }).getByText("Theirs.").waitFor();
    assert.equal(host.folders.read(disk, "a.md"), "# A\n\nTheirs.\n");
  });

  test("an agent's edit while editing: Keep mine writes the editor's text over theirs", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nMine.\n" });
    await page.getByRole("button", { name: "Edit" }).click();
    const editor = page.getByRole("textbox", { name: "Markdown" });
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("More of mine.");
    host.folders.write(disk, "a.md", "# A\n\nTheirs.\n");

    await page.getByRole("alert").getByRole("button", { name: "Keep mine" }).click();

    await until(() => host.folders.read(disk, "a.md")?.includes("More of mine."), "my text on disk");
  });

  test("Compare shows both texts side by side", async () => {
    const { page, host, disk } = await withProject({ "a.md": "# A\n\nMine.\n" });
    await page.getByRole("button", { name: "Edit" }).click();
    host.folders.write(disk, "a.md", "# A\n\nTheirs.\n");

    await page.getByRole("alert").getByRole("button", { name: "Compare" }).click();

    const compare = page.getByRole("region", { name: "Compare" });
    await compare.getByText("Mine.").waitFor();
    await compare.getByText("Theirs.").waitFor();
  });
});

describe("after a browser restart", () => {
  test("the Project is unavailable; Reconnect brings it back", async () => {
    const first = await withProject({ "a.md": "# A\n" });
    first.host.folders.restart();

    const { page } = await openView({ host: first.host });

    await page.getByText("docs is unavailable").waitFor();
    await page.getByRole("button", { name: "Reconnect" }).click();
    await page.getByRole("heading", { level: 1, name: "A" }).waitFor();
  });
});
