// The User's favorites in a Project: seeded once from `.living-doc.json`, personal, kept in the Module's storage.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { createProjects } from "../src/lib/projects.ts";

const MODULE = { id: "@craftskillz/living-documentation", version: "0.0.1" };

const hostOf = () => createTestHost({ module: MODULE, permissions: { folders: true } });

/** The Module's Projects, as a new View sees them. */
async function projectsOf(host: ReturnType<typeof hostOf>) {
  return createProjects(await connect({ transport: host.mount({ surface: "view" }).transport }));
}

/** A connected Project holding `files`. */
async function projectWith(files: Record<string, string>) {
  const host = hostOf();
  const disk = host.folders.create("docs", files);
  host.folders.choose(disk);
  const projects = await projectsOf(host);
  const project = (await projects.connect())!;
  return { host, disk, projects, project };
}

const living = (favorites: unknown) => JSON.stringify({ favorites });

describe("the first favorites of a Project", () => {
  test("come from .living-doc.json: the id is the encoded path without .md, in the file's order", async () => {
    const { projects, project } = await projectWith({
      "a.md": "# Alpha",
      "guides/Getting started.md": "# Start",
      ".living-doc.json": living([
        { id: "guides%2FGetting%20started", title: "Old start" },
        { id: "a", title: "Old alpha" },
      ]),
    });

    assert.deepEqual(await projects.favorites(project), [
      { path: "guides/Getting started.md", title: "Start", missing: false },
      { path: "a.md", title: "Alpha", missing: false },
    ]);
  });

  test("are empty without the file, or when it or its field is malformed", async () => {
    for (const files of [{ "a.md": "" } as Record<string, string>, { "a.md": "", ".living-doc.json": "{nope" }, { "a.md": "", ".living-doc.json": "{\"favorites\":3}" }]) {
      const { projects, project } = await projectWith(files);
      assert.deepEqual(await projects.favorites(project), []);
    }
  });

  test("are read from the file once: later changes to it are ignored, and it is never written", async () => {
    const { host, disk, projects, project } = await projectWith({ "a.md": "# A", "b.md": "# B", ".living-doc.json": living([{ id: "a", title: "A" }]) });
    await projects.favorites(project);
    host.folders.write(disk, ".living-doc.json", living([{ id: "b", title: "B" }]));

    assert.deepEqual((await (await projectsOf(host)).favorites(project)).map((each) => each.path), ["a.md"]);
    await projects.setFavorites(project, [{ path: "b.md", title: "B" }]);
    assert.equal(host.folders.read(disk, ".living-doc.json"), living([{ id: "b", title: "B" }]));
  });

  test("stay empty once seeded empty, even if the file gets favorites later", async () => {
    const { host, disk, projects, project } = await projectWith({ "a.md": "" });
    await projects.favorites(project);
    host.folders.write(disk, ".living-doc.json", living([{ id: "a", title: "A" }]));

    assert.deepEqual(await (await projectsOf(host)).favorites(project), []);
  });
});

describe("a favorite", () => {
  test("shows the Document's current title", async () => {
    const { host, disk, projects, project } = await projectWith({ "a.md": "# First" });
    await projects.setFavorites(project, [{ path: "a.md", title: "First" }]);
    host.folders.write(disk, "a.md", "# Second");

    assert.deepEqual(await projects.favorites(project), [{ path: "a.md", title: "Second", missing: false }]);
  });

  test("is Missing when its file is gone, keeps its title and place, and is never removed", async () => {
    const { host, disk, projects, project } = await projectWith({ "a.md": "# A", "b.md": "# B" });
    await projects.setFavorites(project, [
      { path: "a.md", title: "A" },
      { path: "b.md", title: "B" },
    ]);
    host.folders.remove(disk, "a.md");

    assert.deepEqual(await projects.favorites(project), [
      { path: "a.md", title: "A", missing: true },
      { path: "b.md", title: "B", missing: false },
    ]);
    assert.equal((await (await projectsOf(host)).favorites(project)).length, 2);
  });

  test("a Missing one with no kept title shows its path, as the original showed its id", async () => {
    const { projects, project } = await projectWith({ "a.md": "# A", ".living-doc.json": living([{ id: "guides%2Fgone" }]) });

    assert.deepEqual(await projects.favorites(project), [{ path: "guides/gone.md", title: "guides/gone.md", missing: true }]);
  });
});

describe("setting the favorites", () => {
  test("keeps them for the next visit, per Project", async () => {
    const { host, projects, project } = await projectWith({ "a.md": "# A" });
    host.folders.choose(host.folders.create("other", { "a.md": "# Other" }));
    const other = (await projects.connect())!;

    await projects.setFavorites(project, [{ path: "a.md", title: "A" }]);

    assert.deepEqual(await (await projectsOf(host)).favorites(project), [{ path: "a.md", title: "A", missing: false }]);
    assert.deepEqual(await (await projectsOf(host)).favorites(other), []);
  });

  test("normalizes: trims, drops empty and duplicate paths keeping the first, cuts titles to 200 characters", async () => {
    const { projects, project } = await projectWith({});

    const kept = await projects.setFavorites(project, [
      { path: " a.md ", title: "  A  " },
      { path: "", title: "x" },
      { path: "   ", title: "y" },
      { path: "a.md", title: "again" },
      { path: "b.md", title: "b".repeat(250) },
    ]);

    assert.deepEqual(kept, [
      { path: "a.md", title: "A" },
      { path: "b.md", title: "b".repeat(200) },
    ]);
  });

  test("keeps at most 200 entries, the first ones", async () => {
    const { projects, project } = await projectWith({});

    const kept = await projects.setFavorites(project, Array.from({ length: 205 }, (_, index) => ({ path: `d${index}.md`, title: "t" })));

    assert.equal(kept.length, 200);
    assert.equal(kept[199]!.path, "d199.md");
  });
});

describe("renaming, moving and deleting in the Module", () => {
  const entries = (...paths: string[]) => paths.map((path) => ({ path, title: path }));
  const pathsOf = async (projects: Awaited<ReturnType<typeof projectsOf>>, project: Parameters<typeof projects.favorites>[0]) =>
    (await projects.favorites(project)).map((each) => each.path);

  test("renaming a Document maps its favorite, keeping place and title", async () => {
    const { projects, project } = await projectWith({ "a.md": "# A", "b.md": "# B" });
    await projects.setFavorites(project, [{ path: "a.md", title: "Kept" }, { path: "b.md", title: "B" }]);

    await projects.open(project).rename("a.md", "z");

    assert.deepEqual(await projects.favorites(project), [
      { path: "z.md", title: "A", missing: false },
      { path: "b.md", title: "B", missing: false },
    ]);
  });

  test("renaming a Folder maps the favorites inside it", async () => {
    const { projects, project } = await projectWith({ "g/a.md": "", "g/s/b.md": "", "gx/c.md": "" });
    await projects.setFavorites(project, entries("g/a.md", "g/s/b.md", "gx/c.md"));

    await projects.open(project).rename("g", "h");

    assert.deepEqual(await pathsOf(projects, project), ["h/a.md", "h/s/b.md", "gx/c.md"]);
  });

  test("moving a Document or a Folder maps its favorites", async () => {
    const { projects, project } = await projectWith({ "a.md": "", "g/b.md": "", "t/.keep.md": "" });
    await projects.setFavorites(project, entries("a.md", "g/b.md"));

    await projects.open(project).move("a.md", "t");
    await projects.open(project).move("g", "t");

    assert.deepEqual(await pathsOf(projects, project), ["t/a.md", "t/g/b.md"]);
  });

  test("moving within the same Folder changes nothing", async () => {
    const { projects, project } = await projectWith({ "a.md": "", "b.md": "" });
    await projects.setFavorites(project, entries("a.md", "b.md"));

    await projects.open(project).move("a.md", "", { after: "b.md" });

    assert.deepEqual(await pathsOf(projects, project), ["a.md", "b.md"]);
  });

  test("deleting a Document removes its favorite, the others keep their order", async () => {
    const { projects, project } = await projectWith({ "a.md": "", "b.md": "", "c.md": "" });
    await projects.setFavorites(project, entries("a.md", "b.md", "c.md"));

    await projects.open(project).remove("b.md");

    assert.deepEqual(await pathsOf(projects, project), ["a.md", "c.md"]);
  });

  test("deleting a Folder removes the favorites inside it", async () => {
    const { projects, project } = await projectWith({ "a.md": "", "g/b.md": "", "g/s/c.md": "", "gx/d.md": "" });
    await projects.setFavorites(project, entries("a.md", "g/b.md", "g/s/c.md", "gx/d.md"));

    await projects.open(project).remove("g");

    assert.deepEqual(await pathsOf(projects, project), ["a.md", "gx/d.md"]);
  });

  test("a refused change leaves the favorites alone", async () => {
    const { projects, project } = await projectWith({ "a.md": "", "b.md": "" });
    await projects.setFavorites(project, entries("a.md"));

    await assert.rejects(projects.open(project).rename("a.md", "b"));

    assert.deepEqual(await pathsOf(projects, project), ["a.md"]);
  });
});

describe("where a Project opens, with favorites", () => {
  const favorite = (path: string) => ({ path, title: path });

  test("on the last Document opened, before any favorite", async () => {
    const { projects, project } = await projectWith({ "a.md": "", "b.md": "" });
    await projects.setFavorites(project, [favorite("a.md")]);
    await projects.opened(project, "b.md");

    assert.equal(await projects.startDocument(project), "b.md");
  });

  test("else on the top favorite, skipping missing ones and paths that are not Documents", async () => {
    const { projects, project } = await projectWith({ "a.md": "", "z.md": "", "g/b.md": "" });
    await projects.setFavorites(project, [favorite("gone.md"), favorite("g"), favorite("g/b.md"), favorite("z.md")]);
    await projects.opened(project, "never.md");

    assert.equal(await projects.startDocument(project), "g/b.md");
  });

  test("a hidden Document is not missing: it opens when it is the top favorite", async () => {
    const { projects, project } = await projectWith({ "a.md": "", "secret.md": "", "liv-doc-main.md": "---\norder: []\nhidden: [secret.md]\n---\n" });
    await projects.setFavorites(project, [favorite("secret.md")]);

    assert.equal(await projects.startDocument(project), "secret.md");
  });

  test("else on the first Document of the Tree when no favorite exists", async () => {
    const { projects, project } = await projectWith({ "a.md": "" });
    await projects.setFavorites(project, [favorite("gone.md")]);

    assert.equal(await projects.startDocument(project), "a.md");
  });

  test("the favorites seeded from the file count too", async () => {
    const { projects, project } = await projectWith({ "a.md": "", "z.md": "", ".living-doc.json": living([{ id: "z", title: "Z" }]) });

    assert.equal(await projects.startDocument(project), "z.md");
  });
});

describe("removing a Project", () => {
  test("forgets its favorites: nothing of them stays in the Module's storage", async () => {
    const { host, projects, project } = await projectWith({ "a.md": "", ".living-doc.json": living([{ id: "a", title: "A" }]) });
    assert.equal((await projects.favorites(project)).length, 1);

    await projects.remove(project);

    const kept = (await host.storage.get("favorites")) as Record<string, unknown> | null;
    assert.equal(kept?.[project.id], undefined);
  });
});
