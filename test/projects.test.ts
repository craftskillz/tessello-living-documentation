// The User's Projects: connecting folders, the Active Project, where it opens, and Projects after a browser restart.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost, type TestHostOptions } from "@tessello/sdk/testing";
import { createProjects, FolderRefused } from "../src/lib/projects.ts";

const MODULE = { id: "@craftskillz/living-documentation", version: "0.0.1" };

function hostOf(options: TestHostOptions = {}) {
  return createTestHost({ module: MODULE, permissions: { folders: true }, ...options });
}

/** The Module's Projects, as a new View sees them. */
async function projectsOf(host: ReturnType<typeof hostOf>) {
  return createProjects(await connect({ transport: host.mount({ surface: "view" }).transport }));
}

describe("the name shown", () => {
  test("is kept per Project for the next visit, trimmed and cut; an empty one shows the folder's name again", async () => {
    const host = hostOf();
    host.folders.choose(host.folders.create("docs"));
    const project = (await (await projectsOf(host)).connect())!;
    const projects = await projectsOf(host);

    const kept = await projects.setDisplayName(project, "  Handbook of the team  ");

    assert.deepEqual(kept, { id: project.id, name: "docs", displayName: "Handbook of the team" });
    const next = await projectsOf(host);
    assert.deepEqual(await next.list(), [{ ...kept, state: "available" }]);
    assert.deepEqual(await next.active(), kept);
    assert.equal((await next.setDisplayName(project, "x".repeat(250))).displayName, "x".repeat(200));

    assert.deepEqual(await next.setDisplayName(project, "   "), { id: project.id, name: "docs" });
    assert.deepEqual(await (await projectsOf(host)).list(), [{ id: project.id, name: "docs", state: "available" }]);
  });

  test("the location is kept as typed, trimmed and cut, beside the name shown; an empty one forgets it", async () => {
    const host = hostOf();
    host.folders.choose(host.folders.create("docs"));
    const project = (await (await projectsOf(host)).connect())!;
    const projects = await projectsOf(host);
    await projects.setDisplayName(project, "Handbook");

    const kept = await projects.setLocation(project, "  /Users/me/work/repo/docs ");

    assert.deepEqual(kept, { id: project.id, name: "docs", displayName: "Handbook", location: "/Users/me/work/repo/docs" });
    assert.deepEqual(await (await projectsOf(host)).active(), kept);
    assert.equal((await projects.setLocation(project, "/".repeat(1200))).location?.length, 1000);
    assert.deepEqual(await projects.setLocation(project, ""), { id: project.id, name: "docs", displayName: "Handbook" });
  });

  test("names the Project an overlapping folder clashes with", async () => {
    const host = hostOf();
    const docs = host.folders.create("docs");
    host.folders.choose(docs);
    const project = (await (await projectsOf(host)).connect())!;
    const projects = await projectsOf(host);
    await projects.setDisplayName(project, "Handbook");
    host.folders.choose(docs);

    const refused = await projects.connect().catch((error: unknown) => error);

    assert.ok(refused instanceof FolderRefused);
    assert.equal(refused.project?.displayName, "Handbook");
  });
});

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

  test("choosing the folder of a Project again is refused as overlapping, naming that Project", async () => {
    const host = hostOf();
    const docs = host.folders.create("docs");
    host.folders.choose(docs);
    const projects = await projectsOf(host);
    const project = await projects.connect();

    const refused = await projects.connect().catch((error: unknown) => error);

    assert.ok(refused instanceof FolderRefused);
    assert.equal(refused.reason, "overlapping");
    assert.equal(refused.project?.id, project?.id);
    assert.equal((await projects.list()).length, 1);
  });

  test("a folder inside a Project is refused, and the Active Project stays", async () => {
    const host = hostOf();
    const docs = host.folders.create("docs", { "guide/a.md": "a" });
    host.folders.choose(docs);
    const projects = await projectsOf(host);
    const project = await projects.connect();
    host.folders.choose(host.folders.inside(docs, "guide"));

    const refused = await projects.connect().catch((error: unknown) => error);

    assert.ok(refused instanceof FolderRefused);
    assert.equal(refused.reason, "overlapping");
    assert.equal(refused.project?.id, project?.id);
    assert.equal((await projects.list()).length, 1);
    assert.equal((await projects.active())?.id, project?.id);
  });

  test("a folder around a Project is refused", async () => {
    const host = hostOf();
    const repository = host.folders.create("shop", { "docs/a.md": "a" });
    host.folders.choose(host.folders.inside(repository, "docs"));
    const projects = await projectsOf(host);
    const project = await projects.connect();
    host.folders.choose(repository);

    const refused = await projects.connect().catch((error: unknown) => error);

    assert.ok(refused instanceof FolderRefused);
    assert.equal(refused.project?.id, project?.id);
    assert.equal((await projects.list()).length, 1);
  });

  test("a folder apart from every Project is accepted", async () => {
    const host = hostOf();
    host.folders.choose(host.folders.create("docs"));
    const projects = await projectsOf(host);
    await projects.connect();
    host.folders.choose(host.folders.create("handbook"));

    assert.equal((await projects.connect())?.name, "handbook");
    assert.equal((await projects.list()).length, 2);
  });

  test("an Unavailable Project still counts for the overlap", async () => {
    const host = hostOf();
    const docs = host.folders.create("docs");
    host.folders.choose(docs);
    const project = await (await projectsOf(host)).connect();
    host.folders.restart();
    const projects = await projectsOf(host);
    // As the View does on load: connect() sends its request without reading the storage first.
    await projects.list();

    const refused = await projects.connect().catch((error: unknown) => error);

    assert.ok(refused instanceof FolderRefused);
    assert.equal(refused.project?.id, project?.id);
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

    assert.deepEqual(await projects.preferences(), { lines: false, whiteBackground: false, showHidden: false, markerHidden: false, treeLabels: "name", toc: { open: false, width: 224 }, sidebar: { width: 256 } });
  });

  test("a change is kept for the next visit", async () => {
    const host = hostOf();
    const changed = await (await projectsOf(host)).setPreferences({ lines: true, whiteBackground: true, showHidden: false, treeLabels: "name", toc: { open: true, width: 300 }, sidebar: { width: 256 } });

    assert.deepEqual(changed, { lines: true, whiteBackground: true, showHidden: false, markerHidden: false, treeLabels: "name", toc: { open: true, width: 300 }, sidebar: { width: 256 } });
    assert.deepEqual(await (await projectsOf(host)).preferences(), changed);
  });

  test("changing one keeps the others", async () => {
    const projects = await projectsOf(hostOf());
    await projects.setPreferences({ lines: true, toc: { open: true, width: 300 }, sidebar: { width: 256 } });

    assert.deepEqual(await projects.setPreferences({ whiteBackground: true }), { lines: true, whiteBackground: true, showHidden: false, markerHidden: false, treeLabels: "name", toc: { open: true, width: 300 }, sidebar: { width: 256 } });
    assert.deepEqual(await projects.setPreferences({ toc: { open: false } }), { lines: true, whiteBackground: true, showHidden: false, markerHidden: false, treeLabels: "name", toc: { open: false, width: 300 }, sidebar: { width: 256 } });
    assert.deepEqual(await projects.setPreferences({ toc: { width: 180 } }), { lines: true, whiteBackground: true, showHidden: false, markerHidden: false, treeLabels: "name", toc: { open: false, width: 180 }, sidebar: { width: 256 } });
  });

  test("Show hidden items is kept, and changing it keeps the others", async () => {
    const host = hostOf();
    const projects = await projectsOf(host);
    await projects.setPreferences({ lines: true });

    assert.deepEqual(await projects.setPreferences({ showHidden: true }), { lines: true, whiteBackground: false, showHidden: true, markerHidden: false, treeLabels: "name", toc: { open: false, width: 224 }, sidebar: { width: 256 } });
    assert.equal((await (await projectsOf(host)).preferences()).showHidden, true);
    assert.equal((await projects.setPreferences({ whiteBackground: true })).showHidden, true);
    assert.equal((await (await projectsOf(hostOf({ storage: { display: { showHidden: "yes" } } }))).preferences()).showHidden, false);
  });

  test("The Marker's Hidden state is off by default, is kept, and changing it keeps the others", async () => {
    const host = hostOf();
    const projects = await projectsOf(host);
    await projects.setPreferences({ lines: true });

    assert.equal((await projects.preferences()).markerHidden, false);
    assert.deepEqual(await projects.setPreferences({ markerHidden: true }), { lines: true, whiteBackground: false, showHidden: false, markerHidden: true, treeLabels: "name", toc: { open: false, width: 224 }, sidebar: { width: 256 } });
    assert.equal((await (await projectsOf(host)).preferences()).markerHidden, true);
    assert.equal((await projects.setPreferences({ whiteBackground: true })).markerHidden, true);
    assert.equal((await (await projectsOf(hostOf({ storage: { display: { markerHidden: "yes" } } }))).preferences()).markerHidden, false);
  });

  test("Titles or file names is file names by default, is kept, and changing it keeps the others", async () => {
    const host = hostOf();
    const projects = await projectsOf(host);
    assert.equal((await projects.preferences()).treeLabels, "name");
    await projects.setPreferences({ lines: true });

    assert.deepEqual(await projects.setPreferences({ treeLabels: "title" }), { lines: true, whiteBackground: false, showHidden: false, markerHidden: false, treeLabels: "title", toc: { open: false, width: 224 }, sidebar: { width: 256 } });
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
    const defaults = { lines: false, whiteBackground: false, showHidden: false, markerHidden: false, treeLabels: "name", toc: { open: false, width: 224 }, sidebar: { width: 256 } };

    assert.deepEqual(await (await projectsOf(hostOf({ storage: { display: "nope" } }))).preferences(), defaults);
    assert.deepEqual(await (await projectsOf(hostOf({ storage: { display: [1] } }))).preferences(), defaults);
    assert.deepEqual(
      await (await projectsOf(hostOf({ storage: { display: { lines: true, whiteBackground: "yes", toc: { open: 1, width: 999 } } } }))).preferences(),
      { lines: true, whiteBackground: false, showHidden: false, markerHidden: false, treeLabels: "name", toc: { open: false, width: 400 }, sidebar: { width: 256 } },
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

describe("a Project's Repository grant", () => {
  /** A repository `shop` holding two Project folders, `docs` and `handbook`; the first is connected. */
  async function inRepository() {
    const host = hostOf();
    const repository = host.folders.create("shop", { "docs/a.md": "a", "handbook/b.md": "b", ".git/HEAD": "ref" });
    const docs = host.folders.inside(repository, "docs");
    const handbook = host.folders.inside(repository, "handbook");
    host.folders.choose(docs);
    const projects = await projectsOf(host);
    const project = (await projects.connect())!;
    return { host, repository, docs, handbook, projects, project };
  }

  /** The names of the folders the Host lists as granted. */
  const granted = async (host: ReturnType<typeof hostOf>) => {
    const module = await connect({ transport: host.mount({ surface: "view" }).transport });
    return (await module.folders.list()).map((folder) => folder.name).sort();
  };

  test("a repository holding the Project folder is kept, available, and stays out of the Project's info", async () => {
    const { host, repository, projects, project } = await inRepository();
    host.folders.choose(repository);

    const kept = await projects.connectRepository(project);

    assert.equal(kept?.name, "shop");
    assert.deepEqual(await projects.repository(project), { ...kept, state: "available" });
    assert.deepEqual(await projects.active(), { id: project.id, name: "docs" });
    assert.deepEqual(await projects.list(), [{ id: project.id, name: "docs", state: "available" }]);
  });

  test("the period Versions opens with is kept per Project for the next visit, brought into 1–3650, and kept on disconnecting", async () => {
    const { host, repository, projects, project } = await inRepository();
    assert.equal((await projects.active())?.versionsPeriod, undefined);
    host.folders.choose(repository);
    await projects.connectRepository(project);

    const kept = await projects.setVersionsPeriod(project, 90);

    assert.deepEqual(kept, { id: project.id, name: "docs", versionsPeriod: 90 });
    assert.deepEqual(await (await projectsOf(host)).active(), kept);
    assert.equal((await projects.setVersionsPeriod(project, 99999)).versionsPeriod, 3650);
    assert.equal((await projects.setVersionsPeriod(project, 0)).versionsPeriod, 1);
    assert.equal((await projects.setVersionsPeriod(project, Number.NaN)).versionsPeriod, 180);
    await projects.setVersionsPeriod(project, 45);
    await projects.disconnectRepository(project);
    assert.equal((await (await projectsOf(host)).active())?.versionsPeriod, 45);
  });

  test("a Project has none until one is connected", async () => {
    const { projects, project } = await inRepository();

    assert.equal(await projects.repository(project), null);
  });

  test("cancelling the picker keeps nothing", async () => {
    const { host, projects, project } = await inRepository();
    host.folders.choose(null);

    assert.equal(await projects.connectRepository(project), null);
    assert.equal(await projects.repository(project), null);
  });

  test("a folder that does not hold the Project folder is refused and nothing is kept", async () => {
    const { host, projects, project } = await inRepository();
    host.folders.choose(host.folders.create("elsewhere"));

    const refused = await projects.connectRepository(project).catch((error: unknown) => error);

    assert.ok(refused instanceof FolderRefused);
    assert.equal(refused.reason, "notContaining");
    assert.equal(await projects.repository(project), null);
    assert.deepEqual(await granted(host), ["docs"]);
  });

  test("it is kept for the next visit, and unavailable after a browser restart", async () => {
    const { host, repository, projects, project } = await inRepository();
    host.folders.choose(repository);
    await projects.connectRepository(project);
    host.folders.restart();

    assert.equal((await (await projectsOf(host)).repository(project))?.state, "unavailable");
  });

  test("disconnecting forgets it and gives its folder back", async () => {
    const { host, repository, projects, project } = await inRepository();
    host.folders.choose(repository);
    await projects.connectRepository(project);

    await projects.disconnectRepository(project);

    assert.equal(await projects.repository(project), null);
    assert.deepEqual(await granted(host), ["docs"]);
  });

  test("connecting another repository gives the previous one back", async () => {
    const { host, repository, docs, projects, project } = await inRepository();
    host.folders.choose(repository);
    await projects.connectRepository(project);
    host.folders.choose(docs);
    await projects.connectRepository(project);

    assert.deepEqual(await granted(host), ["docs"]);
    assert.equal((await projects.repository(project))?.name, "docs");
  });

  test("two Projects in one repository share its grant, given back with the last one", async () => {
    const { host, repository, handbook, projects, project: first } = await inRepository();
    host.folders.choose(handbook);
    const second = (await projects.connect())!;
    host.folders.choose(repository);
    await projects.connectRepository(first);
    host.folders.choose(repository);
    await projects.connectRepository(second);

    await projects.disconnectRepository(first);
    assert.deepEqual(await granted(host), ["docs", "handbook", "shop"]);
    assert.equal((await projects.repository(second))?.state, "available");

    await projects.disconnectRepository(second);
    assert.deepEqual(await granted(host), ["docs", "handbook"]);
  });

  test("a repository that is the Project folder itself is never given back by disconnecting it", async () => {
    const { host, docs, projects, project } = await inRepository();
    host.folders.choose(docs);
    const kept = await projects.connectRepository(project);
    assert.equal(kept?.id, project.id);

    await projects.disconnectRepository(project);

    assert.equal(await projects.repository(project), null);
    assert.deepEqual(await granted(host), ["docs"]);
    assert.equal((await projects.list())[0]?.state, "available");
  });

  test("removing the Project forgets its repository and gives that back too", async () => {
    const { host, repository, projects, project } = await inRepository();
    host.folders.choose(repository);
    await projects.connectRepository(project);

    await projects.remove(project);

    assert.deepEqual(await granted(host), []);
  });

  test("removing a Project keeps a repository another Project still uses", async () => {
    const { host, repository, handbook, projects, project: first } = await inRepository();
    host.folders.choose(handbook);
    const second = (await projects.connect())!;
    host.folders.choose(repository);
    await projects.connectRepository(first);
    host.folders.choose(repository);
    await projects.connectRepository(second);

    await projects.remove(first);

    assert.deepEqual(await granted(host), ["handbook", "shop"]);
  });

  describe("the key `sync` read by tessello sync", () => {
    /** The raw key, as the CLI reads it. */
    const rawSync = async (host: ReturnType<typeof hostOf>) => (await connect({ transport: host.mount({ surface: "view" }).transport })).storage.get("sync");

    test("connecting a repository records the Project without a path, the path being unknown yet", async () => {
      const { host, repository, projects, project } = await inRepository();
      host.folders.choose(repository);

      await projects.connectRepository(project);

      assert.deepEqual(await rawSync(host), { projects: [{ id: project.id, name: "docs", repository: "shop" }] });
      assert.deepEqual(await projects.syncEntry(project), { id: project.id, name: "docs", repository: "shop" });
    });

    test("a Project without a Repository grant has no entry, and no key is written", async () => {
      const { host, projects, project } = await inRepository();

      assert.equal(await projects.syncEntry(project), null);
      assert.equal(await rawSync(host), null);
    });

    test("the repository being the Project folder itself records the path \"\"", async () => {
      const { host, docs, projects, project } = await inRepository();
      host.folders.choose(docs);

      await projects.connectRepository(project);

      assert.deepEqual(await projects.syncEntry(project), { id: project.id, name: "docs", repository: "docs", path: "" });
    });

    test("the location is recorded with the entry when the Project has one", async () => {
      const { host, repository, projects, project } = await inRepository();
      await projects.setLocation(project, "/Users/me/shop/docs");
      host.folders.choose(repository);

      await projects.connectRepository(project);

      assert.deepEqual(await projects.syncEntry(project), { id: project.id, name: "docs", repository: "shop", location: "/Users/me/shop/docs" });
    });

    test("the name is the folder's, not the name the User gave", async () => {
      const { host, repository, projects, project } = await inRepository();
      await projects.setDisplayName(project, "Our docs");
      host.folders.choose(repository);

      await projects.connectRepository(project);

      assert.equal((await projects.syncEntry(project))?.name, "docs");
    });

    test("where Versions found the Project folder is recorded, even for a grant that has no entry yet", async () => {
      const { host, repository, projects, project } = await inRepository();
      host.folders.choose(repository);
      await projects.connectRepository(project);
      const module = await connect({ transport: host.mount({ surface: "view" }).transport });
      await module.storage.delete("sync");
      assert.equal(await projects.syncEntry(project), null);

      await projects.foundProjectPath(project, "docs");

      assert.deepEqual(await rawSync(host), { projects: [{ id: project.id, name: "docs", repository: "shop", path: "docs" }] });
    });

    test("finding a path does nothing for a Project without a Repository grant", async () => {
      const { host, projects, project } = await inRepository();

      await projects.foundProjectPath(project, "docs");

      assert.equal(await rawSync(host), null);
    });

    test("reconnecting the same repository keeps the known path; another repository drops it", async () => {
      const { host, repository, docs, projects, project } = await inRepository();
      host.folders.choose(repository);
      await projects.connectRepository(project);
      await projects.foundProjectPath(project, "docs");

      host.folders.choose(repository);
      await projects.connectRepository(project);
      assert.equal((await projects.syncEntry(project))?.path, "docs");

      // A different grant, the Project folder itself: its path is "".
      host.folders.choose(docs);
      await projects.connectRepository(project);
      assert.deepEqual(await projects.syncEntry(project), { id: project.id, name: "docs", repository: "docs", path: "" });
    });

    test("changing the location keeps the entry in step: added, changed, removed; a Project without entry gains none", async () => {
      const { host, repository, projects, project } = await inRepository();
      await projects.setLocation(project, "/a");
      assert.equal(await rawSync(host), null);
      host.folders.choose(repository);
      await projects.connectRepository(project);
      await projects.foundProjectPath(project, "docs");

      await projects.setLocation(project, "/b");
      assert.deepEqual(await projects.syncEntry(project), { id: project.id, name: "docs", repository: "shop", path: "docs", location: "/b" });
      await projects.setLocation(project, "");
      assert.deepEqual(await projects.syncEntry(project), { id: project.id, name: "docs", repository: "shop", path: "docs" });
      await projects.setLocation(project, "/c");
      assert.equal((await projects.syncEntry(project))?.location, "/c");
    });

    test("typing the location records a Project whose grant was connected before the key existed", async () => {
      const { host, repository, projects, project } = await inRepository();
      host.folders.choose(repository);
      await projects.connectRepository(project);
      await (await connect({ transport: host.mount({ surface: "view" }).transport })).storage.delete("sync");

      await projects.setLocation(project, "/code/shop/docs");

      assert.deepEqual(await projects.syncEntry(project), { id: project.id, name: "docs", repository: "shop", location: "/code/shop/docs" });
    });

    test("disconnecting the repository or forgetting the Project removes the entry, and leaves the other Projects' entries", async () => {
      const { host, repository, handbook, projects, project: first } = await inRepository();
      host.folders.choose(handbook);
      const second = (await projects.connect())!;
      for (const project of [first, second]) {
        host.folders.choose(repository);
        await projects.connectRepository(project);
      }

      await projects.disconnectRepository(first);
      assert.deepEqual(await rawSync(host), { projects: [{ id: second.id, name: "handbook", repository: "shop" }] });

      await projects.remove(second);
      assert.deepEqual(await rawSync(host), { projects: [] });
    });

    test("drops malformed entries and malformed optional fields when reading", async () => {
      const { host, repository, projects, project } = await inRepository();
      host.folders.choose(repository);
      await projects.connectRepository(project);
      const module = await connect({ transport: host.mount({ surface: "view" }).transport });
      await module.storage.set("sync", { projects: [{ id: project.id, name: "docs", repository: "shop", path: 3 }, { id: 4 }, "nope"] });

      assert.deepEqual(await projects.syncEntry(project), { id: project.id, name: "docs", repository: "shop" });
      await module.storage.set("sync", { projects: [{ id: 4 }, "nope", { id: project.id, name: "docs" }] });
      assert.equal(await projects.syncEntry(project), null);
      assert.equal((await projects.active())?.id, project.id);
    });
  });

  test("a malformed kept repository is dropped", async () => {
    const { host, projects, project } = await inRepository();
    const module = await connect({ transport: host.mount({ surface: "view" }).transport });
    await module.storage.set("projects", { projects: [{ id: project.id, name: "docs", repository: { id: 3 } }], active: project.id, lastOpened: {} });

    assert.equal(await projects.repository(project), null);
    assert.deepEqual(await projects.list(), [{ id: project.id, name: "docs", state: "available" }]);
  });
});
