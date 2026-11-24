// A Project: the only module that reads and writes a Project folder (docs/design.md §3), on the Test Host's disk.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type ConnectedModule, connect, TesselloError } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { Conflict, NotFound, openProject, Refused, refusalOf, type TreeEntry } from "../src/lib/project.ts";

/** A Project opened on a folder holding `files`, with the Test Host to change its disk as an agent would. */
async function projectOf(files: Record<string, string | Uint8Array> = {}, options?: { now?: () => Date; wrap?: (module: ConnectedModule) => ConnectedModule }) {
  const host = createTestHost({ module: { id: "@craftskillz/living-documentation", version: "0.0.1" }, permissions: { folders: true } });
  const disk = host.folders.create("docs", files);
  host.folders.choose(disk);
  const module = await connect({ transport: host.mount({ surface: "view" }).transport });
  const folder = (await module.folders.request())!;
  return { host, disk, project: openProject(options?.wrap?.(module) ?? module, folder, options) };
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

  test("a Document Name ending in .md (any case) is refused: .md is added to the Name; a Folder may end in .md", () => {
    assert.equal(refusalOf("document", "Guide.md", []), "extension");
    assert.equal(refusalOf("document", "Guide.MD", ["guide.md"]), "extension");
    assert.equal(refusalOf("document", "liv-doc-main.md", []), "extension");
    assert.equal(refusalOf("document", "Guide.mdx", []), null);
    assert.equal(refusalOf("folder", "notes.md", []), null);
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

  test("a refused name writes nothing and rejects with its reason", async () => {
    const { host, disk, project } = await projectOf({ "guide.md": "mine" });

    for (const [name, reason] of [["", "empty"], ["a/b", "characters"], [" a", "edges"], ["liv-doc-main", "reserved"], ["GUIDE", "taken"], ["Notes.MD", "extension"]]) {
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

/** The Test Host's files with `move` replaced by `move`, which receives the real one. */
const movingThrough = (move: (real: ConnectedModule["files"]["move"]) => ConnectedModule["files"]["move"]) => (module: ConnectedModule): ConnectedModule => ({
  ...module,
  files: { ...module.files, move: move(module.files.move) },
});

describe("renaming an entry", () => {
  test("renames a Document: the Name gets .md, the content stays, the old file is gone", async () => {
    const { host, disk, project } = await projectOf({ "guide/note.md": "# Note\n", "guide/other.md": "" });

    const path = await project.rename("guide/note.md", "memo");

    assert.equal(path, "guide/memo.md");
    assert.equal(host.folders.read(disk, "guide/memo.md"), "# Note\n");
    assert.equal(host.folders.read(disk, "guide/note.md"), null);
  });

  test("renames a Folder as typed, with everything in it", async () => {
    const { host, disk, project } = await projectOf({ "guide/a.md": "A", "guide/sub/b.md": "B", "guide/liv-doc-main.md": EMPTY_MANIFEST });

    assert.equal(await project.rename("guide", "Handbook v2"), "Handbook v2");

    assert.deepEqual(outline(await project.tree()), ["Handbook v2/", "  sub/", "    b.md", "  a.md"]);
    assert.equal(host.folders.read(disk, "Handbook v2/liv-doc-main.md"), EMPTY_MANIFEST);
    assert.equal(host.folders.read(disk, "guide/a.md"), null);
  });

  test("a refused name writes nothing and rejects with its reason, the entry itself not counting as a sibling", async () => {
    const { host, disk, project } = await projectOf({ "note.md": "n", "taken.md": "t", "guide/a.md": "a" });

    for (const [name, reason] of [["", "empty"], ["a/b", "characters"], ["x.", "edges"], ["liv-doc-main", "reserved"], ["TAKEN", "taken"], ["x.md", "extension"]]) {
      await assert.rejects(project.rename("note.md", name!), { reason }, name);
    }
    await assert.rejects(project.rename("guide", "Taken.md"), { reason: "taken" });
    assert.deepEqual(outline(await project.tree()), ["guide/", "  a.md", "note.md", "taken.md"]);
    assert.equal(host.folders.read(disk, "note.md"), "n");
  });

  test("the same name writes nothing and gives the same path", async () => {
    const { host, disk, project } = await projectOf({ "note.md": "n", "liv-doc-main.md": "---\norder:\n  - note.md\n---\n" });
    await project.check();

    assert.equal(await project.rename("note.md", "note"), "note.md");

    assert.equal(host.folders.read(disk, "note.md"), "n");
    assert.deepEqual(await project.check(), { tree: false, documents: [] });
  });

  test("the Folder manifest cannot be renamed", async () => {
    const { project } = await projectOf({ "liv-doc-main.md": EMPTY_MANIFEST, "guide/liv-doc-main.md": EMPTY_MANIFEST });

    await assert.rejects(project.rename("liv-doc-main.md", "other"), { reason: "reserved" });
    await assert.rejects(project.rename("guide/liv-doc-main.md", "other"), { reason: "reserved" });
  });

  test("a change of case only is allowed, even on a disk where Note.md and note.md are the same file", async () => {
    const insensitive = movingThrough((real) => async (folder, from, to) => {
      if (from.toLowerCase() === to.toLowerCase()) throw new TesselloError("conflict", "exists");
      return real(folder, from, to);
    });
    const { host, disk, project } = await projectOf({ "guide/note.md": "n", "guide/Docs/x.md": "x" }, { wrap: insensitive });

    assert.equal(await project.rename("guide/note.md", "Note"), "guide/Note.md");
    assert.equal(await project.rename("guide/Docs", "docs"), "guide/docs");

    assert.deepEqual(outline(await project.tree()), ["guide/", "  docs/", "    x.md", "  Note.md"]);
    assert.equal(host.folders.read(disk, "guide/Note.md"), "n");
  });

  test("a name taken on disk meanwhile, which the naming check could not see, is refused as taken", async () => {
    let race: (path: string) => void = () => {};
    const racing = movingThrough((real) => async (folder, from, to) => {
      race(to);
      return real(folder, from, to);
    });
    const { host, disk, project } = await projectOf({ "note.md": "mine" }, { wrap: racing });
    race = (path) => host.folders.write(disk, path, "an agent's");

    await assert.rejects(project.rename("note.md", "memo"), { reason: "taken" });

    assert.equal(host.folders.read(disk, "memo.md"), "an agent's");
    assert.equal(host.folders.read(disk, "note.md"), "mine");
  });
});

describe("renaming an entry and its Folder manifest", () => {
  test("the old name is replaced in place in order and hidden, other fields and body kept", async () => {
    const manifest = "---\ntitle: Guide\norder:\n  - b.md\n  - note.md\n  - c.md\nhidden:\n  - x.md\n  - note.md\n---\nThe guide.\n";
    const { host, disk, project } = await projectOf({ "liv-doc-main.md": manifest, "note.md": "", "b.md": "", "c.md": "" });

    await project.rename("note.md", "memo");

    assert.equal(
      host.folders.read(disk, "liv-doc-main.md"),
      "---\ntitle: Guide\norder:\n  - b.md\n  - memo.md\n  - c.md\nhidden:\n  - x.md\n  - memo.md\n---\nThe guide.\n",
    );
  });

  test("a manifest not listing the entry stays byte for byte; a missing one is not created", async () => {
    const manifest = "---\norder: [b.md]\nhidden:   []\n---\nbody";
    const { host, disk, project } = await projectOf({ "g/liv-doc-main.md": manifest, "g/note.md": "", "note.md": "" });

    await project.rename("g/note.md", "memo");
    await project.rename("note.md", "memo");

    assert.equal(host.folders.read(disk, "g/liv-doc-main.md"), manifest);
    assert.equal(host.folders.read(disk, "liv-doc-main.md"), null);
  });

  test("a renamed Folder is replaced by its name too", async () => {
    const { host, disk, project } = await projectOf({ "liv-doc-main.md": "---\norder:\n  - guide\nhidden:\n  - guide\n---\n", "guide/a.md": "" });

    await project.rename("guide", "manual");

    assert.equal(host.folders.read(disk, "liv-doc-main.md"), "---\norder:\n  - manual\nhidden:\n  - manual\n---\n");
  });

  test("an invalid manifest refuses the rename and nothing is written", async () => {
    for (const manifest of ["no frontmatter", "---\norder: [unclosed\n---\n", "---\n- a\n---\n"]) {
      const { host, disk, project } = await projectOf({ "liv-doc-main.md": manifest, "note.md": "n" });

      await assert.rejects(project.rename("note.md", "memo"), { reason: "invalidManifest" }, manifest);

      assert.equal(host.folders.read(disk, "liv-doc-main.md"), manifest);
      assert.equal(host.folders.read(disk, "note.md"), "n");
      assert.equal(host.folders.read(disk, "memo.md"), null);
    }
  });

  test("the Module's own rename is not reported as an agent's edit; the Tree change may be", async () => {
    const { project } = await projectOf({ "liv-doc-main.md": "---\norder:\n  - note.md\n---\n", "note.md": "n", "guide/a.md": "[n](../note.md)" });
    await project.check();

    await project.rename("note.md", "memo");
    await project.rename("guide", "manual");

    assert.deepEqual((await project.check()).documents, []);
  });
});

describe("moving an entry", () => {
  test("moves a Document into a Folder, the root or a deeper Folder, content kept", async () => {
    const { host, disk, project } = await projectOf({ "a.md": "A", "guide/liv-doc-main.md": EMPTY_MANIFEST, "guide/sub/b.md": "B" });

    assert.equal(await project.move("a.md", "guide/sub"), "guide/sub/a.md");
    assert.equal(await project.move("guide/sub/b.md", ""), "b.md");

    assert.equal(host.folders.read(disk, "guide/sub/a.md"), "A");
    assert.equal(host.folders.read(disk, "b.md"), "B");
    assert.equal(host.folders.read(disk, "a.md"), null);
    assert.equal(host.folders.read(disk, "guide/sub/b.md"), null);
  });

  test("moves a Folder with everything in it", async () => {
    const { host, disk, project } = await projectOf({ "guide/a.md": "A", "guide/deep/b.md": "B", "archive/x.md": "X" });

    assert.equal(await project.move("guide", "archive"), "archive/guide");

    assert.deepEqual(outline(await project.tree()), ["archive/", "  guide/", "    deep/", "      b.md", "    a.md", "  x.md"]);
    assert.equal(host.folders.read(disk, "guide/a.md"), null);
  });

  test("into the same Folder without a position is a no-op returning the same path", async () => {
    const { project } = await projectOf({ "guide/a.md": "A" });
    await project.check();

    assert.equal(await project.move("guide/a.md", "guide"), "guide/a.md");

    assert.deepEqual(await project.check(), { tree: false, documents: [] });
  });

  test("a Folder cannot go into itself or one of its descendants", async () => {
    const { host, disk, project } = await projectOf({ "guide/sub/a.md": "A", "guidebook/b.md": "B" });

    await assert.rejects(project.move("guide", "guide"), { reason: "intoItself" });
    await assert.rejects(project.move("guide", "guide/sub"), { reason: "intoItself" });
    await project.move("guide", "guidebook");

    assert.equal(host.folders.read(disk, "guidebook/guide/sub/a.md"), "A");
  });

  test("a name already used in the destination, ignoring case, is taken; nothing is written", async () => {
    const { host, disk, project } = await projectOf({ "a.md": "mine", "dest/A.md": "theirs", "x/dest": "a file", "Dest2/liv-doc-main.md": EMPTY_MANIFEST });

    await assert.rejects(project.move("a.md", "dest"), { reason: "taken" });

    assert.equal(host.folders.read(disk, "a.md"), "mine");
    assert.equal(host.folders.read(disk, "dest/A.md"), "theirs");
  });

  test("a destination Folder that does not exist is refused as missing; so is a source that does not", async () => {
    const { host, disk, project } = await projectOf({ "a.md": "A" });

    await assert.rejects(project.move("a.md", "nowhere"), { reason: "missing" });
    await assert.rejects(project.move("gone.md", ""), { reason: "missing" });

    assert.equal(host.folders.read(disk, "a.md"), "A");
  });

  test("the Folder manifest cannot be moved", async () => {
    const { project } = await projectOf({ "guide/liv-doc-main.md": EMPTY_MANIFEST, "other/a.md": "" });

    await assert.rejects(project.move("guide/liv-doc-main.md", "other"), { reason: "reserved" });
  });

  test("an invalid manifest, in the source or the destination, refuses the move and nothing is written", async () => {
    for (const [source, destination] of [["broken", EMPTY_MANIFEST], [EMPTY_MANIFEST, "broken"]]) {
      const { host, disk, project } = await projectOf({ "from/liv-doc-main.md": source!, "from/a.md": "A", "to/liv-doc-main.md": destination! });

      await assert.rejects(project.move("from/a.md", "to"), { reason: "invalidManifest" });
      await assert.rejects(project.move("from/a.md", "to", { before: "x.md" }), { reason: "invalidManifest" });

      assert.equal(host.folders.read(disk, "from/a.md"), "A");
      assert.equal(host.folders.read(disk, "from/liv-doc-main.md"), source);
      assert.equal(host.folders.read(disk, "to/liv-doc-main.md"), destination);
    }
  });

  test("a name taken on disk meanwhile is refused as taken", async () => {
    let race: (path: string) => void = () => {};
    const racing = movingThrough((real) => async (folder, from, to) => {
      race(to);
      return real(folder, from, to);
    });
    const { host, disk, project } = await projectOf({ "a.md": "mine", "dest/liv-doc-main.md": EMPTY_MANIFEST }, { wrap: racing });
    race = (path) => host.folders.write(disk, path, "an agent's");

    await assert.rejects(project.move("a.md", "dest"), { reason: "taken" });

    assert.equal(host.folders.read(disk, "dest/a.md"), "an agent's");
  });

  test("the Module's own move is not reported as an agent's edit", async () => {
    const { project } = await projectOf({ "a.md": "A", "guide/b.md": "B", "dest/liv-doc-main.md": "---\norder:\n  - z.md\n---\n", "dest/z.md": "" });
    await project.check();

    await project.move("a.md", "dest");
    await project.move("guide", "dest");

    assert.deepEqual((await project.check()).documents, []);
  });
});

describe("moving an entry and the Folder manifests", () => {
  test("the source manifest loses the name from order and hidden; one without it stays byte for byte", async () => {
    const manifest = "---\ntitle: T\norder:\n  - b.md\n  - a.md\nhidden:\n  - a.md\n---\nbody\n";
    const other = "---\norder: [b.md]\nhidden:   []\n---\nbody";
    const { host, disk, project } = await projectOf({ "g/liv-doc-main.md": manifest, "g/a.md": "", "h/liv-doc-main.md": other, "h/c.md": "", "dest/x.md": "" });

    await project.move("g/a.md", "dest");
    await project.move("h/c.md", "dest");

    assert.equal(host.folders.read(disk, "g/liv-doc-main.md"), "---\ntitle: T\norder:\n  - b.md\nhidden: []\n---\nbody\n");
    assert.equal(host.folders.read(disk, "h/liv-doc-main.md"), other);
  });

  test("without a position, the name is appended to a non-empty destination order", async () => {
    const { host, disk, project } = await projectOf({ "a.md": "", "g/b.md": "", "dest/liv-doc-main.md": "---\norder:\n  - z.md\nhidden: []\n---\nbody\n", "dest/z.md": "" });

    await project.move("a.md", "dest");
    await project.move("g", "dest");

    assert.equal(host.folders.read(disk, "dest/liv-doc-main.md"), "---\norder:\n  - z.md\n  - a.md\n  - g\nhidden: []\n---\nbody\n");
  });

  test("without a position, an empty order or a missing manifest is left alone and none is created", async () => {
    const empty = "---\norder: []\nhidden: []\n---\n";
    const { host, disk, project } = await projectOf({ "a.md": "", "b.md": "", "e/liv-doc-main.md": empty, "n/z.md": "" });

    await project.move("a.md", "e");
    await project.move("b.md", "n");

    assert.equal(host.folders.read(disk, "e/liv-doc-main.md"), empty);
    assert.equal(host.folders.read(disk, "n/liv-doc-main.md"), null);
  });
});

describe("placing an entry among its new siblings", () => {
  test("the destination's order becomes the whole Tree order, hidden entries counted, with the entry before the sibling", async () => {
    const { host, disk, project } = await projectOf({
      "a.md": "A",
      "dest/liv-doc-main.md": "---\norder:\n  - z.md\nhidden:\n  - h.md\n---\n",
      "dest/z.md": "",
      "dest/h.md": "",
      "dest/b.md": "",
      "dest/Sub/s.md": "",
      "dest/pic.png": "",
    });

    await project.move("a.md", "dest", { before: "b.md" });

    assert.equal(
      host.folders.read(disk, "dest/liv-doc-main.md"),
      "---\norder:\n  - z.md\n  - Sub\n  - a.md\n  - b.md\n  - h.md\nhidden:\n  - h.md\n---\n",
    );
    assert.equal(host.folders.read(disk, "dest/a.md"), "A");
  });

  test("after a sibling; the default order is used when the destination has no custom one", async () => {
    const { host, disk, project } = await projectOf({ "A.md": "", "dest/c.md": "", "dest/B.md": "", "dest/d/x.md": "" });

    await project.move("A.md", "dest", { after: "d" });

    assert.equal(host.folders.read(disk, "dest/liv-doc-main.md"), "---\norder:\n  - d\n  - A.md\n  - B.md\n  - c.md\nhidden: []\n---\n");
  });

  test("without a destination manifest, one is created", async () => {
    const { host, disk, project } = await projectOf({ "a.md": "", "dest/b.md": "" });

    await project.move("a.md", "dest", { before: "b.md" });

    assert.equal(host.folders.read(disk, "dest/liv-doc-main.md"), "---\norder:\n  - a.md\n  - b.md\nhidden: []\n---\n");
    assert.deepEqual(outline(await project.tree()), ["dest/", "  a.md", "  b.md"]);
  });

  test("a sibling that does not exist puts the entry at the end of the order", async () => {
    const { host, disk, project } = await projectOf({ "a.md": "", "dest/b.md": "", "dest/c.md": "" });

    await project.move("a.md", "dest", { before: "gone.md" });

    assert.equal(host.folders.read(disk, "dest/liv-doc-main.md"), "---\norder:\n  - b.md\n  - c.md\n  - a.md\nhidden: []\n---\n");
  });

  test("within the same Folder it is a reorder: only the manifest is written, no file moves", async () => {
    const { host, disk, project } = await projectOf({ "g/a.md": "A", "g/b.md": "B", "g/c.md": "C", "g/liv-doc-main.md": "---\norder: [c.md, a.md]\nhidden: [b.md]\n---\nbody\n" });
    await project.check();

    assert.equal(await project.move("g/b.md", "g", { before: "c.md" }), "g/b.md");

    assert.equal(host.folders.read(disk, "g/liv-doc-main.md"), "---\norder:\n  - b.md\n  - c.md\n  - a.md\nhidden:\n  - b.md\n---\nbody\n");
    assert.equal(host.folders.read(disk, "g/b.md"), "B");
    assert.deepEqual(await project.check(), { tree: false, documents: [] });
  });

  test("a reorder that changes nothing writes nothing, even without a manifest", async () => {
    const { host, disk, project } = await projectOf({ "g/a.md": "", "g/b.md": "", "h/liv-doc-main.md": "---\norder:   [x.md]\n---\n", "h/x.md": "", "h/y.md": "" });

    await project.move("g/a.md", "g", { before: "b.md" });
    await project.move("g/b.md", "g", { after: "a.md" });
    await project.move("h/y.md", "h", { after: "x.md" });

    assert.equal(host.folders.read(disk, "g/liv-doc-main.md"), null);
    assert.equal(host.folders.read(disk, "h/liv-doc-main.md"), "---\norder:   [x.md]\n---\n");
  });

  test("a Folder can be placed too, and its source loses the name", async () => {
    const { host, disk, project } = await projectOf({ "src/liv-doc-main.md": "---\norder: [sub]\n---\n", "src/sub/s.md": "", "dest/a.md": "" });

    await project.move("src/sub", "dest", { after: "a.md" });

    assert.equal(host.folders.read(disk, "dest/liv-doc-main.md"), "---\norder:\n  - a.md\n  - sub\nhidden: []\n---\n");
    assert.equal(host.folders.read(disk, "src/liv-doc-main.md"), "---\norder: []\n---\n");
    assert.equal(host.folders.read(disk, "dest/sub/s.md"), "");
  });
});

describe("links follow a rename or a move", () => {
  test("renaming a Document rewrites the links to it, anchors kept, in other Documents", async () => {
    const { host, disk, project } = await projectOf({
      "note.md": "# Note\n",
      "other.md": "See [note](./note.md#top) and [again](note.md).\n",
      "guide/deep.md": "[up](../note.md) and [elsewhere](../other.md)\n",
    });

    await project.rename("note.md", "memo");

    assert.equal(host.folders.read(disk, "other.md"), "See [note](./memo.md#top) and [again](memo.md).\n");
    assert.equal(host.folders.read(disk, "guide/deep.md"), "[up](../memo.md) and [elsewhere](../other.md)\n");
  });

  test("moving a Document adjusts the links pointing at it and its own relative links", async () => {
    const { host, disk, project } = await projectOf({
      "guide/a.md": "![x](../images/x.png) [b](./b.md) [out](../top.md)\n",
      "guide/b.md": "[a](./a.md)\n",
      "top.md": "[a](guide/a.md) [a again](./guide/a.md#s)\n",
      "archive/liv-doc-main.md": EMPTY_MANIFEST,
      "images/x.png": "png",
    });

    await project.move("guide/a.md", "archive");

    assert.equal(host.folders.read(disk, "archive/a.md"), "![x](../images/x.png) [b](../guide/b.md) [out](../top.md)\n");
    assert.equal(host.folders.read(disk, "guide/b.md"), "[a](../archive/a.md)\n");
    assert.equal(host.folders.read(disk, "top.md"), "[a](archive/a.md) [a again](./archive/a.md#s)\n");
  });

  test("renaming a Folder rewrites the links into it; links between Documents that moved together stay byte for byte", async () => {
    const inside = "[b](./b.md) [sub](sub/c.md) [home](../home.md)\n";
    const { host, disk, project } = await projectOf({
      "guide/a.md": inside,
      "guide/b.md": "[a](a.md)\n",
      "guide/sub/c.md": "[a](../a.md)\n",
      "home.md": "[a](guide/a.md) [c](./guide/sub/c.md)\n",
    });

    await project.rename("guide", "manual");

    assert.equal(host.folders.read(disk, "manual/a.md"), inside);
    assert.equal(host.folders.read(disk, "manual/b.md"), "[a](a.md)\n");
    assert.equal(host.folders.read(disk, "manual/sub/c.md"), "[a](../a.md)\n");
    assert.equal(host.folders.read(disk, "home.md"), "[a](manual/a.md) [c](./manual/sub/c.md)\n");
  });

  test("the manifests are read and rewritten like any Markdown file", async () => {
    const { host, disk, project } = await projectOf({ "liv-doc-main.md": "---\norder: []\n---\nStart at [the note](note.md).\n", "note.md": "" });

    await project.rename("note.md", "memo");

    assert.equal(host.folders.read(disk, "liv-doc-main.md"), "---\norder: []\n---\nStart at [the note](memo.md).\n");
  });

  /** A Project whose `other.md` is changed by an agent just before each of the first `times` writes to it. */
  async function racedOn(times: number) {
    let race: () => void = () => {};
    let left = times;
    const racing = (module: ConnectedModule): ConnectedModule => ({
      ...module,
      files: {
        ...module.files,
        write: async (folder, path, content, options) => {
          if (path === "other.md" && left-- > 0) race();
          return module.files.write(folder, path, content, options);
        },
      },
    });
    const made = await projectOf({ "note.md": "", "other.md": "[n](note.md)\n" }, { wrap: racing });
    race = () => made.host.folders.write(made.disk, "other.md", `${made.host.folders.read(made.disk, "other.md")}An agent's line.\n`);
    return made;
  }

  test("a file an agent writes meanwhile is read again and rewritten once", async () => {
    const { host, disk, project } = await racedOn(1);

    await project.rename("note.md", "memo");

    assert.equal(host.folders.read(disk, "other.md"), "[n](memo.md)\nAn agent's line.\n");
  });

  test("a second conflict propagates", async () => {
    const { project } = await racedOn(2);

    await assert.rejects(project.rename("note.md", "memo"), { code: "conflict" });
  });

  test("the Module's own rewritten files are not reported as an agent's edit", async () => {
    const { project } = await projectOf({ "note.md": "", "other.md": "[n](note.md)\n", "guide/a.md": "[n](../note.md)\n" });
    await project.check();

    await project.rename("note.md", "memo");
    await project.move("guide/a.md", "");

    assert.deepEqual((await project.check()).documents, []);
  });
});
