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
