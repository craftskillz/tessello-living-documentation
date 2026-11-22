// A Project: the only module that reads and writes a Project folder (docs/design.md §3), on the Test Host's disk.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { Conflict, openProject, type TreeEntry } from "../src/lib/project.ts";

/** A Project opened on a folder holding `files`, with the Test Host to change its disk as an agent would. */
async function projectOf(files: Record<string, string> = {}) {
  const host = createTestHost({ module: { id: "@craftskillz/living-documentation", version: "0.0.1" }, permissions: { folders: true } });
  const disk = host.folders.create("docs", files);
  host.folders.choose(disk);
  const module = await connect({ transport: host.mount({ surface: "view" }).transport });
  const folder = (await module.folders.request())!;
  return { host, disk, project: openProject(module, folder) };
}

/** The Tree as lines: "folder/" or "document", indented by depth. */
const outline = (entries: TreeEntry[], depth = 0): string[] =>
  entries.flatMap((entry) =>
    entry.kind === "folder"
      ? [`${"  ".repeat(depth)}${entry.name}/`, ...outline(entry.children, depth + 1)]
      : [`${"  ".repeat(depth)}${entry.name}`],
  );

describe("the Tree", () => {
  test("Folders, then Documents, each alphabetical ignoring case; only Markdown Documents", async () => {
    const { project } = await projectOf({
      "zeta.md": "",
      "Alpha.md": "",
      "guide/b.md": "",
      "guide/A.md": "",
      "Archive/old.md": "",
      "logo.png": "",
      "notes.txt": "",
    });

    assert.deepEqual(outline(await project.tree()), ["Archive/", "  old.md", "guide/", "  A.md", "  b.md", "Alpha.md", "zeta.md"]);
  });

  test("a Folder manifest puts its listed entries first, in its order, and leaves its hidden entries out", async () => {
    const { project } = await projectOf({
      "liv-doc-main.md": "---\norder:\n  - zeta.md\n  - guide\nhidden:\n  - drafts\n  - secret.md\n---\n",
      "alpha.md": "",
      "zeta.md": "",
      "secret.md": "",
      "guide/a.md": "",
      "drafts/d.md": "",
      "archive/x.md": "",
    });

    assert.deepEqual(outline(await project.tree()), ["zeta.md", "guide/", "  a.md", "archive/", "  x.md", "alpha.md"]);
  });

  test("a manifest applies to its own Folder; the manifest itself is never shown", async () => {
    const { project } = await projectOf({
      "guide/liv-doc-main.md": "---\norder:\n  - z.md\n---\nThe guide.\n",
      "guide/a.md": "",
      "guide/z.md": "",
    });

    assert.deepEqual(outline(await project.tree()), ["guide/", "  z.md", "  a.md"]);
  });

  test("an invalid manifest falls back to the default order", async () => {
    const { project } = await projectOf({ "liv-doc-main.md": "---\norder: [unclosed\n---\n", "b.md": "", "a.md": "" });

    assert.deepEqual(outline(await project.tree()), ["a.md", "b.md"]);
  });
});

describe("reading and saving a Document", () => {
  test("a Document is read with its version; saving with that version writes it and gives the new one", async () => {
    const { host, disk, project } = await projectOf({ "guide/intro.md": "# Intro\n" });

    const document = await project.read("guide/intro.md");
    const version = await project.save("guide/intro.md", "# Intro\n\nMore.\n", document.version);

    assert.equal(document.text, "# Intro\n");
    assert.equal(host.folders.read(disk, "guide/intro.md"), "# Intro\n\nMore.\n");
    assert.equal((await project.read("guide/intro.md")).version, version);
  });

  test("saving over an agent's edit is refused with a Conflict that carries their text and version", async () => {
    const { host, disk, project } = await projectOf({ "intro.md": "mine" });
    const { version } = await project.read("intro.md");
    host.folders.write(disk, "intro.md", "theirs");

    const refused = await project.save("intro.md", "my edit", version).catch((error: unknown) => error);

    assert.ok(refused instanceof Conflict);
    assert.equal(refused.theirs?.text, "theirs");
    assert.equal(host.folders.read(disk, "intro.md"), "theirs");
  });

  test("saving over a Document an agent deleted is a Conflict with no text of theirs", async () => {
    const { host, disk, project } = await projectOf({ "intro.md": "mine" });
    const { version } = await project.read("intro.md");
    host.folders.remove(disk, "intro.md");

    const refused = await project.save("intro.md", "my edit", version).catch((error: unknown) => error);

    assert.ok(refused instanceof Conflict);
    assert.equal(refused.theirs, null);
  });
});

describe("noticing changes made outside the Module", () => {
  test("a Document an agent changed is reported once; the Tree is unchanged", async () => {
    const { host, disk, project } = await projectOf({ "a.md": "a", "b.md": "b" });
    await project.check();

    host.folders.write(disk, "a.md", "an agent's edit");

    assert.deepEqual(await project.check(), { tree: false, documents: ["a.md"] });
    assert.deepEqual(await project.check(), { tree: false, documents: [] });
  });

  test("a Document an agent added or deleted changes the Tree", async () => {
    const { host, disk, project } = await projectOf({ "a.md": "a" });
    await project.check();

    host.folders.write(disk, "new.md", "new");
    host.folders.remove(disk, "a.md");

    assert.deepEqual(await project.check(), { tree: true, documents: ["a.md", "new.md"] });
  });

  test("the Module's own saves are not reported", async () => {
    const { project } = await projectOf({ "a.md": "a" });
    await project.check();
    const { version } = await project.read("a.md");

    await project.save("a.md", "mine", version);

    assert.deepEqual(await project.check(), { tree: false, documents: [] });
  });
});
