// A Project: the only module that reads and writes a Project folder (docs/design.md §3), on the Test Host's disk.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { Conflict, NotFound, openProject, Refused, refusalOf, type TreeEntry } from "../src/lib/project.ts";

/** A Project opened on a folder holding `files`, with the Test Host to change its disk as an agent would. */
async function projectOf(files: Record<string, string | Uint8Array> = {}, options?: { now?: () => Date }) {
  const host = createTestHost({ module: { id: "@craftskillz/living-documentation", version: "0.0.1" }, permissions: { folders: true } });
  const disk = host.folders.create("docs", files);
  host.folders.choose(disk);
  const module = await connect({ transport: host.mount({ surface: "view" }).transport });
  const folder = (await module.folders.request())!;
  return { host, disk, project: openProject(module, folder, options) };
}

/** The Tree as lines: "folder/" or "document", indented by depth. */
const outline = (entries: TreeEntry[], depth = 0): string[] =>
  entries.flatMap((entry) =>
    entry.kind === "folder"
      ? [`${"  ".repeat(depth)}${entry.name}/`, ...outline(entry.children, depth + 1)]
      : [`${"  ".repeat(depth)}${entry.name}`],
  );

describe("the Tree's dates", () => {
  /** The date the Tree gives the Document named `name` at the top of `entries`. */
  const dateOf = (entries: TreeEntry[], name: string) => {
    const entry = entries.find((each) => each.name === name);
    assert.ok(entry?.kind === "document", name);
    return entry.date;
  };

  test("a Document shows its frontmatter timestamp as written, to the minute, as its creation date", async () => {
    const { project } = await projectOf({
      "a.md": "---\ntimestamp: 2026-03-04T14:30:12.000Z\n---\n# A\n",
      "b.md": "---\ntimestamp: 2025-12-01\n---\n",
      "c.md": "---\ntimestamp: '2024-01-02 08:05'\ntitle: C\n---\n",
    });

    const tree = await project.tree();

    assert.deepEqual(dateOf(tree, "a.md"), { kind: "created", at: "2026-03-04T14:30" });
    assert.deepEqual(dateOf(tree, "b.md"), { kind: "created", at: "2025-12-01" });
    assert.deepEqual(dateOf(tree, "c.md"), { kind: "created", at: "2024-01-02T08:05" });
  });

  test("without a usable timestamp, a Document shows when its file was last modified", async () => {
    const { host, disk, project } = await projectOf();
    const modified = Date.UTC(2026, 10, 20, 9, 15);
    host.folders.write(disk, "guide/none.md", "# None\n", { modified });
    host.folders.write(disk, "guide/odd.md", "---\ntimestamp: yesterday\n---\n", { modified });
    host.folders.write(disk, "guide/broken.md", "---\ntimestamp: [unclosed\n---\n", { modified });

    const [guide] = await project.tree();

    assert.ok(guide?.kind === "folder");
    for (const entry of guide.children) assert.deepEqual(dateOf(guide.children, entry.name), { kind: "modified", at: modified }, entry.name);
  });
});

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

describe("reading a missing file or an image", () => {
  test("reading a Document that does not exist rejects with NotFound carrying its path", async () => {
    const { project } = await projectOf({ "a.md": "a" });

    const refused = await project.read("gone.md").catch((error: unknown) => error);

    assert.ok(refused instanceof NotFound);
    assert.equal(refused.path, "gone.md");
  });

  test("an image is read as its exact bytes, even when they are not valid UTF-8", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0xc3, 0x28]);
    const { project } = await projectOf({ "images/a.png": png });

    assert.deepEqual(await project.readImage("images/a.png"), png);
  });

  test("reading an image that does not exist rejects with NotFound carrying its path", async () => {
    const { project } = await projectOf();

    const refused = await project.readImage("images/gone.png").catch((error: unknown) => error);

    assert.ok(refused instanceof NotFound);
    assert.equal(refused.path, "images/gone.png");
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

describe("the naming rule", () => {
  test("an empty name is refused", () => {
    assert.equal(refusalOf("document", "", []), "empty");
    assert.equal(refusalOf("folder", "", []), "empty");
  });

  test("a name with / \\ : * ? \" < > | is refused, never trimmed or changed", () => {
    for (const name of ["a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b"]) {
      assert.equal(refusalOf("document", name, []), "characters", name);
      assert.equal(refusalOf("folder", name, []), "characters", name);
    }
  });

  test("a leading or trailing space or dot is refused", () => {
    for (const name of [" a", "a ", ".a", "a."]) assert.equal(refusalOf("document", name, []), "edges", name);
    assert.equal(refusalOf("folder", "a.", []), "edges");
  });

  test("the Folder manifest's name is reserved, in any case", () => {
    assert.equal(refusalOf("document", "liv-doc-main", []), "reserved");
    assert.equal(refusalOf("document", "LIV-Doc-Main", []), "reserved");
    assert.equal(refusalOf("folder", "liv-doc-main.md", []), "reserved");
    assert.equal(refusalOf("folder", "liv-doc-main", []), null);
  });

  test("a name differing only by case from a sibling is refused; a Document's name is compared with .md", () => {
    assert.equal(refusalOf("document", "Guide", ["guide.md"]), "taken");
    assert.equal(refusalOf("document", "Guide", ["guide"]), null);
    assert.equal(refusalOf("folder", "Guide", ["guide"]), "taken");
    assert.equal(refusalOf("folder", "Guide", ["GUIDE"]), "taken");
    assert.equal(refusalOf("document", "Other", ["guide.md", "liv-doc-main.md"]), null);
  });

  test("a Document Name already ending in .md (any case) is the file name itself", () => {
    assert.equal(refusalOf("document", "Guide.MD", ["guide.md"]), "taken");
    assert.equal(refusalOf("document", "Guide.md", []), null);
    assert.equal(refusalOf("document", "liv-doc-main.MD", []), "reserved");
  });

  test("the first broken rule wins: characters before edges before reserved before taken", () => {
    assert.equal(refusalOf("document", " a/", []), "characters");
    assert.equal(refusalOf("document", ".", []), "edges");
  });
});

const NOW = () => new Date("2026-11-23T10:15:30.123Z");
const EMPTY_MANIFEST = "---\norder: []\nhidden: []\n---\n";

describe("creating a Document", () => {
  test("writes <Name>.md with a timestamp frontmatter and a heading, and gives its path", async () => {
    const { host, disk, project } = await projectOf({}, { now: NOW });

    const path = await project.createDocument("", "Getting started");

    assert.equal(path, "Getting started.md");
    assert.equal(host.folders.read(disk, path), "---\ntimestamp: 2026-11-23T10:15:30.123Z\n---\n# Getting started\n");
  });

  test("goes into the Folder asked for", async () => {
    const { host, disk, project } = await projectOf({ "guide/a.md": "a" }, { now: NOW });

    const path = await project.createDocument("guide", "B");

    assert.equal(path, "guide/B.md");
    assert.match(host.folders.read(disk, "guide/B.md") as string, /^---\ntimestamp: .*\n---\n# B\n$/);
  });

  test("a Name already ending in .md is the file name and the heading drops the suffix", async () => {
    const { host, disk, project } = await projectOf({}, { now: NOW });

    const path = await project.createDocument("", "Notes.MD");

    assert.equal(path, "Notes.MD");
    assert.match(host.folders.read(disk, path) as string, /# Notes\n$/);
  });

  test("a refused name writes nothing and rejects with its reason", async () => {
    const { host, disk, project } = await projectOf({ "guide.md": "mine" });

    for (const [name, reason] of [["", "empty"], ["a/b", "characters"], [" a", "edges"], ["liv-doc-main", "reserved"], ["GUIDE", "taken"]]) {
      const refused = await project.createDocument("", name!).catch((error: unknown) => error);
      assert.ok(refused instanceof Refused, name);
      assert.equal(refused.reason, reason);
    }
    assert.equal(host.folders.read(disk, "guide.md"), "mine");
    assert.deepEqual((await project.tree()).map((entry) => entry.name), ["guide.md"]);
  });

  test("only the entries of the target Folder count as siblings", async () => {
    const { project } = await projectOf({ "guide/guide.md": "x", "logo.png": "" });

    assert.equal(await project.createDocument("", "guide"), "guide.md");
    assert.equal(await project.createDocument("guide", "logo"), "guide/logo.md");
    await assert.rejects(project.createDocument("guide", "GUIDE"), { reason: "taken" });
  });

  test("the Module's own creation is not reported as an agent's edit", async () => {
    const { project } = await projectOf({ "a.md": "a" });
    await project.check();

    await project.createDocument("", "New");

    assert.deepEqual((await project.check()).documents, []);
  });
});

describe("creating a Folder", () => {
  test("holds the empty Folder manifest, appears in the Tree and gives its path", async () => {
    const { host, disk, project } = await projectOf({ "a.md": "a" });

    const path = await project.createFolder("", "guide");

    assert.equal(path, "guide");
    assert.equal(host.folders.read(disk, "guide/liv-doc-main.md"), EMPTY_MANIFEST);
    assert.deepEqual(outline(await project.tree()), ["guide/", "a.md"]);
  });

  test("goes into the parent Folder asked for", async () => {
    const { host, disk, project } = await projectOf({ "guide/a.md": "a" });

    assert.equal(await project.createFolder("guide", "deep"), "guide/deep");
    assert.equal(host.folders.read(disk, "guide/deep/liv-doc-main.md"), EMPTY_MANIFEST);
  });

  test("a refused name writes nothing; a Folder differing only by case from a file or Folder is taken", async () => {
    const { project } = await projectOf({ "Guide/a.md": "a", "NOTES": "" });

    await assert.rejects(project.createFolder("", "guide"), { reason: "taken" });
    await assert.rejects(project.createFolder("", "notes"), { reason: "taken" });
    await assert.rejects(project.createFolder("", "liv-doc-main.md"), { reason: "reserved" });
    await assert.rejects(project.createFolder("", "a:b"), { reason: "characters" });
    assert.deepEqual(outline(await project.tree()), ["Guide/", "  a.md"]);
  });
});

describe("a new entry and its Folder manifest", () => {
  test("is appended to a custom order, keeping the other fields and the body", async () => {
    const manifest = "---\ntitle: Guide\norder:\n  - b.md\n  - a.md\nhidden:\n  - x.md\n---\nThe guide.\n\nMore.\n";
    const { host, disk, project } = await projectOf({ "liv-doc-main.md": manifest, "a.md": "", "b.md": "" }, { now: NOW });

    await project.createDocument("", "C");
    await project.createFolder("", "sub");

    assert.equal(
      host.folders.read(disk, "liv-doc-main.md"),
      "---\ntitle: Guide\norder:\n  - b.md\n  - a.md\n  - C.md\n  - sub\nhidden:\n  - x.md\n---\nThe guide.\n\nMore.\n",
    );
    assert.deepEqual(outline(await project.tree()), ["b.md", "a.md", "C.md", "sub/"]);
  });

  test("in a nested Folder it is that Folder's manifest that changes", async () => {
    const { host, disk, project } = await projectOf({ "guide/liv-doc-main.md": "---\norder:\n  - a.md\n---\n", "guide/a.md": "" });

    await project.createDocument("guide", "B");

    assert.equal(host.folders.read(disk, "guide/liv-doc-main.md"), "---\norder:\n  - a.md\n  - B.md\n---\n");
  });

  test("an empty or absent order leaves the manifest byte for byte as it was", async () => {
    const empty = "---\norder: []\nhidden: [x.md]\n---\nbody";
    const absent = "---\nhidden:\n  - x.md\n---\n";
    const { host, disk, project } = await projectOf({ "liv-doc-main.md": empty, "g/liv-doc-main.md": absent });

    await project.createDocument("", "A");
    await project.createDocument("g", "B");

    assert.equal(host.folders.read(disk, "liv-doc-main.md"), empty);
    assert.equal(host.folders.read(disk, "g/liv-doc-main.md"), absent);
  });

  test("a missing manifest is not created", async () => {
    const { host, disk, project } = await projectOf({ "a.md": "a" });

    await project.createDocument("", "B");

    assert.equal(host.folders.read(disk, "liv-doc-main.md"), null);
  });

  test("an invalid manifest refuses the creation and nothing is written", async () => {
    for (const manifest of ["no frontmatter", "---\norder: [unclosed\n---\n", "---\n- a\n- b\n---\n", "---\njust text\n---\n", "---\norder:\n  - a.md\n"]) {
      const { host, disk, project } = await projectOf({ "liv-doc-main.md": manifest, "a.md": "" });

      await assert.rejects(project.createDocument("", "B"), { reason: "invalidManifest" }, manifest);
      await assert.rejects(project.createFolder("", "sub"), { reason: "invalidManifest" }, manifest);

      assert.equal(host.folders.read(disk, "liv-doc-main.md"), manifest);
      assert.equal(host.folders.read(disk, "B.md"), null);
      assert.equal(host.folders.read(disk, "sub/liv-doc-main.md"), null);
    }
  });

  test("the name rule is checked before the manifest", async () => {
    const { project } = await projectOf({ "liv-doc-main.md": "broken" });

    await assert.rejects(project.createDocument("", ""), { reason: "empty" });
  });

  test("the manifest update is the Module's own write, not an agent's", async () => {
    const { project } = await projectOf({ "liv-doc-main.md": "---\norder:\n  - a.md\n---\n", "a.md": "" });
    await project.check();

    await project.createDocument("", "B");

    assert.deepEqual((await project.check()).documents, []);
  });
});
