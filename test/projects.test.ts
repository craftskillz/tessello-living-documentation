// The User's Projects: connecting folders, the Active Project, where it opens, and Projects after a browser restart.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost, type TestHostOptions } from "@tessello/sdk/testing";
import { createProjects } from "../src/lib/projects.ts";

const MODULE = { id: "@craftskillz/living-documentation", version: "0.0.1" };

function hostOf(options: TestHostOptions = {}) {
  return createTestHost({ module: MODULE, permissions: { folders: true }, ...options });
}

/** The Module's Projects, as a new View sees them. */
async function projectsOf(host: ReturnType<typeof hostOf>) {
  return createProjects(await connect({ transport: host.mount({ surface: "view" }).transport }));
}

describe("connecting a folder", () => {
  test("adds a Project named after the folder, which becomes the Active Project", async () => {
    const host = hostOf();
    host.folders.choose(host.folders.create("docs", { "a.md": "a" }));
    const projects = await projectsOf(host);

    const project = await projects.connect();

    assert.equal(project?.name, "docs");
    assert.deepEqual(await projects.list(), [{ ...project, state: "available" }]);
    assert.equal((await projects.active())?.id, project?.id);
  });

  test("the Projects and the Active Project are kept for the next visit", async () => {
    const host = hostOf();
    host.folders.choose(host.folders.create("docs"));
    const first = await (await projectsOf(host)).connect();
    host.folders.choose(host.folders.create("handbook"));
    const second = await (await projectsOf(host)).connect();

    const next = await projectsOf(host);

    assert.deepEqual((await next.list()).map((project) => project.name), ["docs", "handbook"]);
    assert.equal((await next.active())?.id, second?.id);
    assert.notEqual(first?.id, second?.id);
  });

  test("cancelling the picker adds nothing", async () => {
    const host = hostOf();
    host.folders.choose(null);
    const projects = await projectsOf(host);

    assert.equal(await projects.connect(), null);
    assert.deepEqual(await projects.list(), []);
  });

  test("connecting the folder of a Project again does not add a second one", async () => {
    const host = hostOf();
    const docs = host.folders.create("docs");
    host.folders.choose(docs);
    const projects = await projectsOf(host);
    const project = await projects.connect();

    assert.equal((await projects.connect())?.id, project?.id);
    assert.equal((await projects.list()).length, 1);
  });
});

describe("where a Project opens", () => {
  test("on the last Document opened in it", async () => {
    const host = hostOf();
    host.folders.choose(host.folders.create("docs", { "a.md": "a", "guide/b.md": "b" }));
    const project = (await (await projectsOf(host)).connect())!;
    await (await projectsOf(host)).opened(project, "guide/b.md");

    assert.equal(await (await projectsOf(host)).startDocument(project), "guide/b.md");
  });

  test("else on the first Document of the Tree", async () => {
    const host = hostOf();
    host.folders.choose(host.folders.create("docs", { "zeta.md": "", "guide/b.md": "" }));
    const projects = await projectsOf(host);
    const project = (await projects.connect())!;

    assert.equal(await projects.startDocument(project), "guide/b.md");
  });

  test("not on a last Document that no longer exists", async () => {
    const host = hostOf();
    const disk = host.folders.create("docs", { "a.md": "", "gone.md": "" });
    host.folders.choose(disk);
    const projects = await projectsOf(host);
    const project = (await projects.connect())!;
    await projects.opened(project, "gone.md");
    host.folders.remove(disk, "gone.md");

    assert.equal(await projects.startDocument(project), "a.md");
  });

  test("an empty Project opens on nothing", async () => {
    const host = hostOf();
    host.folders.choose(host.folders.create("docs"));
    const projects = await projectsOf(host);

    assert.equal(await projects.startDocument((await projects.connect())!), null);
  });
});

describe("after a browser restart", () => {
  test("a Project is unavailable until the User reconnects it", async () => {
    const host = hostOf();
    host.folders.choose(host.folders.create("docs", { "a.md": "a" }));
    const project = (await (await projectsOf(host)).connect())!;
    host.folders.restart();
    const projects = await projectsOf(host);

    assert.deepEqual(await projects.list(), [{ ...project, state: "unavailable" }]);
    assert.equal(await projects.reconnect(project), true);
    assert.deepEqual(await projects.list(), [{ ...project, state: "available" }]);
  });
});

describe("removing a Project", () => {
  test("forgets it, and gives its folder back; its files stay", async () => {
    const host = hostOf();
    const disk = host.folders.create("docs", { "a.md": "a" });
    host.folders.choose(disk);
    const projects = await projectsOf(host);
    const project = (await projects.connect())!;

    await projects.remove(project);

    assert.deepEqual(await projects.list(), []);
    assert.equal(await projects.active(), null);
    assert.equal(host.folders.read(disk, "a.md"), "a");
  });
});

describe("display preferences", () => {
  test("are the defaults on a first visit", async () => {
    const projects = await projectsOf(hostOf());

    assert.deepEqual(await projects.preferences(), { lines: false, whiteBackground: false, showHidden: false, treeLabels: "name", toc: { open: false, width: 224 }, sidebar: { width: 256 } });
  });

  test("a change is kept for the next visit", async () => {
    const host = hostOf();
    const changed = await (await projectsOf(host)).setPreferences({ lines: true, whiteBackground: true, showHidden: false, treeLabels: "name", toc: { open: true, width: 300 }, sidebar: { width: 256 } });

    assert.deepEqual(changed, { lines: true, whiteBackground: true, showHidden: false, treeLabels: "name", toc: { open: true, width: 300 }, sidebar: { width: 256 } });
    assert.deepEqual(await (await projectsOf(host)).preferences(), changed);
  });

  test("changing one keeps the others", async () => {
    const projects = await projectsOf(hostOf());
    await projects.setPreferences({ lines: true, toc: { open: true, width: 300 }, sidebar: { width: 256 } });

    assert.deepEqual(await projects.setPreferences({ whiteBackground: true }), { lines: true, whiteBackground: true, showHidden: false, treeLabels: "name", toc: { open: true, width: 300 }, sidebar: { width: 256 } });
    assert.deepEqual(await projects.setPreferences({ toc: { open: false } }), { lines: true, whiteBackground: true, showHidden: false, treeLabels: "name", toc: { open: false, width: 300 }, sidebar: { width: 256 } });
    assert.deepEqual(await projects.setPreferences({ toc: { width: 180 } }), { lines: true, whiteBackground: true, showHidden: false, treeLabels: "name", toc: { open: false, width: 180 }, sidebar: { width: 256 } });
  });

  test("Show hidden items is kept, and changing it keeps the others", async () => {
    const host = hostOf();
    const projects = await projectsOf(host);
    await projects.setPreferences({ lines: true });

    assert.deepEqual(await projects.setPreferences({ showHidden: true }), { lines: true, whiteBackground: false, showHidden: true, treeLabels: "name", toc: { open: false, width: 224 }, sidebar: { width: 256 } });
    assert.equal((await (await projectsOf(host)).preferences()).showHidden, true);
    assert.equal((await projects.setPreferences({ whiteBackground: true })).showHidden, true);
    assert.equal((await (await projectsOf(hostOf({ storage: { display: { showHidden: "yes" } } }))).preferences()).showHidden, false);
  });

  test("Titles or file names is file names by default, is kept, and changing it keeps the others", async () => {
    const host = hostOf();
    const projects = await projectsOf(host);
    assert.equal((await projects.preferences()).treeLabels, "name");
    await projects.setPreferences({ lines: true });

    assert.deepEqual(await projects.setPreferences({ treeLabels: "title" }), { lines: true, whiteBackground: false, showHidden: false, treeLabels: "title", toc: { open: false, width: 224 }, sidebar: { width: 256 } });
    assert.equal((await (await projectsOf(host)).preferences()).treeLabels, "title");
    assert.equal((await projects.setPreferences({ whiteBackground: true })).treeLabels, "title");
    assert.equal((await projects.setPreferences({ treeLabels: "name" })).treeLabels, "name");
  });

  test("a malformed kept Titles or file names is file names", async () => {
    assert.equal((await (await projectsOf(hostOf({ storage: { display: { treeLabels: "both" } } }))).preferences()).treeLabels, "name");
    assert.equal((await (await projectsOf(hostOf({ storage: { display: { treeLabels: 3 } } }))).preferences()).treeLabels, "name");
  });

  test("a TOC width is kept between 160 and 400 pixels, whole", async () => {
    const projects = await projectsOf(hostOf());

    assert.equal((await projects.setPreferences({ toc: { width: 100 } })).toc.width, 160);
    assert.equal((await projects.setPreferences({ toc: { width: 900 } })).toc.width, 400);
    assert.equal((await projects.setPreferences({ toc: { width: 250.6 } })).toc.width, 251);
    assert.equal((await projects.setPreferences({ toc: { width: Number.NaN } })).toc.width, 251);
  });

  test("a sidebar width is kept between 200 and 600 pixels, whole", async () => {
    const host = hostOf();
    const projects = await projectsOf(host);

    assert.equal((await projects.preferences()).sidebar.width, 256);
    assert.equal((await projects.setPreferences({ sidebar: { width: 100 } })).sidebar.width, 200);
    assert.equal((await projects.setPreferences({ sidebar: { width: 900 } })).sidebar.width, 600);
    assert.equal((await projects.setPreferences({ sidebar: { width: 300.6 } })).sidebar.width, 301);
    assert.equal((await projects.setPreferences({ sidebar: { width: Number.NaN } })).sidebar.width, 301);
    assert.equal((await projects.setPreferences({ lines: true, toc: { open: true } })).sidebar.width, 301);
    assert.equal((await (await projectsOf(host)).preferences()).sidebar.width, 301);
    assert.equal((await projects.setPreferences({ sidebar: { width: 320 } })).lines, true);
  });

  test("a malformed or out of range kept sidebar width gives 256 or the nearest bound", async () => {
    const widthOf = async (sidebar: unknown) => (await (await projectsOf(hostOf({ storage: { display: { sidebar } } as never }))).preferences()).sidebar.width;

    assert.equal(await widthOf("wide"), 256);
    assert.equal(await widthOf({ width: "x" }), 256);
    assert.equal(await widthOf({}), 256);
    assert.equal(await widthOf([1]), 256);
    assert.equal(await widthOf({ width: 999 }), 600);
    assert.equal(await widthOf({ width: 50 }), 200);
    assert.equal(await widthOf({ width: 300.4 }), 300);
  });

  test("a malformed kept value gives the defaults, field by field", async () => {
    const defaults = { lines: false, whiteBackground: false, showHidden: false, treeLabels: "name", toc: { open: false, width: 224 }, sidebar: { width: 256 } };

    assert.deepEqual(await (await projectsOf(hostOf({ storage: { display: "nope" } }))).preferences(), defaults);
    assert.deepEqual(await (await projectsOf(hostOf({ storage: { display: [1] } }))).preferences(), defaults);
    assert.deepEqual(
      await (await projectsOf(hostOf({ storage: { display: { lines: true, whiteBackground: "yes", toc: { open: 1, width: 999 } } } }))).preferences(),
      { lines: true, whiteBackground: false, showHidden: false, treeLabels: "name", toc: { open: false, width: 400 }, sidebar: { width: 256 } },
    );
  });

  test("are not touched by connecting or removing a Project", async () => {
    const host = hostOf();
    host.folders.choose(host.folders.create("docs", { "a.md": "a" }));
    const projects = await projectsOf(host);
    const kept = await projects.setPreferences({ lines: true, toc: { open: true, width: 300 }, sidebar: { width: 256 } });

    const project = (await projects.connect())!;
    assert.deepEqual(await projects.preferences(), kept);
    await projects.remove(project);
    assert.deepEqual(await (await projectsOf(host)).preferences(), kept);
  });
});

describe("label filter", () => {
  async function connected(host = hostOf()) {
    const projects = await projectsOf(host);
    host.folders.choose(host.folders.create("one", { "a.md": "a" }));
    const one = (await projects.connect())!;
    host.folders.choose(host.folders.create("two", { "b.md": "b" }));
    const two = (await projects.connect())!;
    return { host, projects, one, two };
  }

  test("is empty by default", async () => {
    const { projects, one } = await connected();

    assert.deepEqual(await projects.labelFilter(one), { pattern: "", replacement: "" });
  });

  test("is kept per Project for the next visit", async () => {
    const { host, projects, one } = await connected();

    assert.deepEqual(await projects.setLabelFilter(one, { pattern: "^\\d+-", replacement: "" }), { pattern: "^\\d+-", replacement: "" });
    assert.deepEqual(await (await projectsOf(host)).labelFilter(one), { pattern: "^\\d+-", replacement: "" });
  });

  test("one Project's filter does not change another's", async () => {
    const { projects, one, two } = await connected();
    await projects.setLabelFilter(one, { pattern: "a", replacement: "b" });
    await projects.setLabelFilter(two, { pattern: "c", replacement: "d" });

    assert.deepEqual(await projects.labelFilter(one), { pattern: "a", replacement: "b" });
    assert.deepEqual(await projects.labelFilter(two), { pattern: "c", replacement: "d" });
  });

  test("a malformed kept value is the empty filter", async () => {
    const host = hostOf({ storage: { labelFilters: { p1: { pattern: 1, replacement: "x" }, p2: "nope" } } });
    const projects = await projectsOf(host);

    assert.deepEqual(await projects.labelFilter({ id: "p1", name: "one" }), { pattern: "", replacement: "" });
    assert.deepEqual(await projects.labelFilter({ id: "p2", name: "two" }), { pattern: "", replacement: "" });
  });

  test("is forgotten when the Project is removed", async () => {
    const { projects, one, two } = await connected();
    await projects.setLabelFilter(one, { pattern: "a", replacement: "b" });
    await projects.setLabelFilter(two, { pattern: "c", replacement: "d" });

    await projects.remove(one);

    assert.deepEqual(await projects.labelFilter(one), { pattern: "", replacement: "" });
    assert.deepEqual(await projects.labelFilter(two), { pattern: "c", replacement: "d" });
  });
});
