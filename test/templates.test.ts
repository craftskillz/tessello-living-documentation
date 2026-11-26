// Templates: a Project's library as files `.templates/<folder>/<name>.md`, on the Test Host's disk.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { openProject } from "../src/lib/project.ts";
import { copyName, InvalidLegacyLibrary, LEGACY_LIBRARY, openTemplates, templateMatches } from "../src/lib/templates.ts";

/** A Project opened on a folder holding `files`, its template library, and the Test Host to change its disk as an agent would. */
async function libraryOf(files: Record<string, string> = {}) {
  const host = createTestHost({ module: { id: "@craftskillz/living-documentation", version: "0.0.1" }, permissions: { folders: true } });
  const disk = host.folders.create("docs", files);
  host.folders.choose(disk);
  const module = await connect({ transport: host.mount({ surface: "view" }).transport });
  const folder = (await module.folders.request())!;
  const project = openProject(module, folder);
  return { host, disk, project, library: openTemplates(project) };
}

/** The library as lines: "folder/" then its templates indented. */
const outlineOf = (folders: Awaited<ReturnType<ReturnType<typeof openTemplates>["list"]>>) => folders.flatMap((folder) => [`${folder.name}/`, ...folder.templates.map((template) => `  ${template.name}`)]);

describe("listing the library", () => {
  test("is empty without .templates/", async () => {
    const { library } = await libraryOf({ "a.md": "# A\n" });
    assert.deepEqual(await library.list(), []);
  });

  test("lists folders and templates alphabetically ignoring case and accents, with their paths", async () => {
    const { library } = await libraryOf({
      ".templates/Zeta/b.md": "",
      ".templates/Zeta/A.md": "",
      ".templates/été/z.md": "",
      ".templates/ete2/é.md": "",
      ".templates/alpha/liv-doc-main.md": "---\norder: []\nhidden: []\n---\n",
    });
    const folders = await library.list();
    assert.deepEqual(outlineOf(folders), ["alpha/", "été/", "  z", "ete2/", "  é", "Zeta/", "  A", "  b"]);
    assert.deepEqual(folders[3]!.templates[0], { folder: "Zeta", name: "A", path: ".templates/Zeta/A.md" });
  });

  test("ignores files directly in .templates/, deeper folders, and other files than .md", async () => {
    const { library } = await libraryOf({
      ".templates/stray.md": "",
      ".templates/f/ok.md": "",
      ".templates/f/notes.txt": "",
      ".templates/f/deeper/no.md": "",
    });
    assert.deepEqual(outlineOf(await library.list()), ["f/", "  ok"]);
  });
});

describe("folders", () => {
  test("a created folder exists on disk and is listed while empty", async () => {
    const { library, host, disk } = await libraryOf();
    await library.createFolder("Meetings");
    assert.deepEqual(outlineOf(await library.list()), ["Meetings/"]);
    assert.ok((host.folders.read(disk, ".templates/Meetings/liv-doc-main.md") as string).startsWith("---"));
  });

  test("a folder name follows the naming rule and is unique ignoring case", async () => {
    const { library } = await libraryOf({ ".templates/Meetings/a.md": "" });
    await assert.rejects(library.createFolder(""), { reason: "empty" });
    await assert.rejects(library.createFolder("a/b"), { reason: "characters" });
    await assert.rejects(library.createFolder(".hidden"), { reason: "edges" });
    await assert.rejects(library.createFolder("meetings"), { reason: "taken" });
  });

  test("renaming a folder keeps its templates; a taken name is refused", async () => {
    const { library, host, disk } = await libraryOf({ ".templates/A/t.md": "text", ".templates/B/u.md": "" });
    await library.renameFolder("A", "C");
    assert.deepEqual(outlineOf(await library.list()), ["B/", "  u", "C/", "  t"]);
    assert.equal(host.folders.read(disk, ".templates/C/t.md"), "text");
    await assert.rejects(library.renameFolder("C", "b"), { reason: "taken" });
  });

  test("removing a folder deletes its templates", async () => {
    const { library, host, disk } = await libraryOf({ ".templates/A/t.md": "text", ".templates/B/u.md": "" });
    await library.removeFolder("A");
    assert.deepEqual(outlineOf(await library.list()), ["B/", "  u"]);
    assert.notEqual(typeof host.folders.read(disk, ".templates/A/t.md"), "string");
  });
});

describe("creating, reading and saving a template", () => {
  test("creates the file holding the text and resolves with its path", async () => {
    const { library, host, disk } = await libraryOf({ ".templates/Meetings/liv-doc-main.md": "---\norder: []\nhidden: []\n---\n" });
    const path = await library.create("Meetings", "Weekly", "# {{title}}\n");
    assert.equal(path, ".templates/Meetings/Weekly.md");
    assert.equal(host.folders.read(disk, path), "# {{title}}\n");
    assert.deepEqual((await library.read(path)).text, "# {{title}}\n");
  });

  test("refuses a name that breaks the naming rule, a taken name ignoring case, or a missing folder", async () => {
    const { library } = await libraryOf({ ".templates/Meetings/Weekly.md": "mine" });
    await assert.rejects(library.create("Meetings", "", ""), { reason: "empty" });
    await assert.rejects(library.create("Meetings", "a:b", ""), { reason: "characters" });
    await assert.rejects(library.create("Meetings", " a", ""), { reason: "edges" });
    await assert.rejects(library.create("Meetings", "a.MD", ""), { reason: "extension" });
    await assert.rejects(library.create("Meetings", "liv-doc-main", ""), { reason: "reserved" });
    await assert.rejects(library.create("Meetings", "weekly", ""), { reason: "taken" });
    await assert.rejects(library.create("Nowhere", "Weekly", ""), { reason: "missing" });
    assert.equal((await library.read(".templates/Meetings/Weekly.md")).text, "mine");
  });

  test("reading a template that is gone is NotFound", async () => {
    const { library } = await libraryOf();
    await assert.rejects(library.read(".templates/a/b.md"), { name: "NotFound" });
  });

  test("saves a template read at its version, and refuses with a Conflict once an agent changed the file", async () => {
    const { library, host, disk } = await libraryOf({ ".templates/F/t.md": "one" });
    const { version } = await library.read(".templates/F/t.md");
    const saved = await library.save(".templates/F/t.md", "two", version);
    assert.equal(host.folders.read(disk, ".templates/F/t.md"), "two");
    host.folders.write(disk, ".templates/F/t.md", "agent");
    await assert.rejects(library.save(".templates/F/t.md", "three", saved), (error: Error & { theirs?: { text: string } }) => error.name === "Conflict" && error.theirs?.text === "agent");
    assert.equal(host.folders.read(disk, ".templates/F/t.md"), "agent");
  });

  test("the conflict is per template: another template saves freely", async () => {
    const { library, host, disk } = await libraryOf({ ".templates/F/t.md": "one", ".templates/F/u.md": "uno" });
    const { version } = await library.read(".templates/F/u.md");
    host.folders.write(disk, ".templates/F/t.md", "agent");
    await library.save(".templates/F/u.md", "dos", version);
    assert.equal(host.folders.read(disk, ".templates/F/u.md"), "dos");
  });

  test("removes a template for good", async () => {
    const { library } = await libraryOf({ ".templates/F/t.md": "one", ".templates/F/u.md": "" });
    await library.remove(".templates/F/t.md");
    assert.deepEqual(outlineOf(await library.list()), ["F/", "  u"]);
  });
});

describe("renaming, moving and duplicating a template", () => {
  const linked = "![logo](../../images/logo.png)\n\n[guide](../../guide/intro.md)\n";
  const files = { "images/logo.png": "png", "guide/intro.md": "# Intro\n", ".templates/A/t.md": linked, ".templates/A/other.md": "", ".templates/B/liv-doc-main.md": "---\norder: []\nhidden: []\n---\n" };

  test("rename resolves with the new path and keeps the links pointing at the same targets", async () => {
    const { library, host, disk } = await libraryOf(files);
    const path = await library.rename(".templates/A/t.md", "Renamed");
    assert.equal(path, ".templates/A/Renamed.md");
    assert.equal(host.folders.read(disk, path), linked);
    assert.notEqual(typeof host.folders.read(disk, ".templates/A/t.md"), "string");
  });

  test("rename is refused by the naming rule, and for a name taken ignoring case", async () => {
    const { library } = await libraryOf(files);
    await assert.rejects(library.rename(".templates/A/t.md", "a:b"), { reason: "characters" });
    await assert.rejects(library.rename(".templates/A/t.md", "OTHER"), { reason: "taken" });
  });

  test("move keeps the name in the new folder, and links still reach the same targets from a folder at the same depth", async () => {
    const { library, host, disk } = await libraryOf(files);
    const path = await library.move(".templates/A/t.md", "B");
    assert.equal(path, ".templates/B/t.md");
    assert.equal(host.folders.read(disk, path), linked);
    assert.deepEqual(outlineOf(await library.list()), ["A/", "  other", "B/", "  t"]);
  });

  test("move is refused when the name is taken in the destination or the folder does not exist", async () => {
    const { library } = await libraryOf({ ...files, ".templates/B/T.md": "" });
    await assert.rejects(library.move(".templates/A/t.md", "B"), { reason: "taken" });
    await assert.rejects(library.move(".templates/A/t.md", "Nowhere"), { reason: "missing" });
  });

  test("duplicate names the copy `<name> copy`, then `copy 2`, `copy 3`, with the same text", async () => {
    const { library, host, disk } = await libraryOf({ ".templates/A/t.md": "same" });
    assert.equal(await library.duplicate(".templates/A/t.md"), ".templates/A/t copy.md");
    assert.equal(await library.duplicate(".templates/A/t.md"), ".templates/A/t copy 2.md");
    assert.equal(await library.duplicate(".templates/A/t copy.md"), ".templates/A/t copy copy.md");
    assert.equal(host.folders.read(disk, ".templates/A/t copy 2.md"), "same");
    host.folders.write(disk, ".templates/A/T COPY 3.md", "");
    assert.equal(await library.duplicate(".templates/A/t.md"), ".templates/A/t copy 4.md");
  });
});

describe("copyName", () => {
  test("is the first free `<name> copy`, `<name> copy 2`, ... ignoring case", () => {
    assert.equal(copyName("Plan", []), "Plan copy");
    assert.equal(copyName("Plan", ["PLAN COPY"]), "Plan copy 2");
    assert.equal(copyName("Plan", ["Plan copy", "plan copy 2"]), "Plan copy 3");
  });
});

describe("searching templates", () => {
  const files = { ".templates/A/Réunion.md": "Ordre du jour", ".templates/A/Plan.md": "Les ÉTAPES", ".templates/B/Notes.md": "nothing" };

  test("matches the name or the content ignoring case and accents, in list order", async () => {
    const { library } = await libraryOf(files);
    assert.deepEqual((await library.search("reunion")).map((entry) => entry.name), ["Réunion"]);
    assert.deepEqual((await library.search(" etapes ")).map((entry) => entry.path), [".templates/A/Plan.md"]);
    assert.deepEqual((await library.search("NOTES")).map((entry) => entry.name), ["Notes"]);
    assert.deepEqual(await library.search("absent"), []);
  });

  test("a blank query matches every template", async () => {
    const { library } = await libraryOf(files);
    assert.deepEqual((await library.search("  ")).map((entry) => entry.name), ["Plan", "Réunion", "Notes"]);
  });

  test("templateMatches looks in the name and in the text", () => {
    assert.equal(templateMatches("Été", "", "ete"), true);
    assert.equal(templateMatches("x", "Ordre DU jour", "du"), true);
    assert.equal(templateMatches("x", "y", "z"), false);
    assert.equal(templateMatches("x", "y", " "), true);
  });
});

describe("converting the original's library", () => {
  const legacy = (folders: unknown) => JSON.stringify({ version: 1, folders }, null, 2);
  const folderOf = (name: string, templates: { name: string; content: string }[]) => ({ id: `f-${name}`, name, templates: templates.map((template, i) => ({ id: `t-${i}`, ...template })) });

  test("is offered only when .document-templates.json is there and .templates/ is not", async () => {
    assert.equal(await (await libraryOf()).library.offersConversion(), false);
    assert.equal(await (await libraryOf({ [LEGACY_LIBRARY]: legacy([]) })).library.offersConversion(), true);
    assert.equal(await (await libraryOf({ [LEGACY_LIBRARY]: legacy([]), ".templates/A/t.md": "" })).library.offersConversion(), false);
  });

  test("writes each folder and template as files, leaves the JSON byte for byte, and counts the templates", async () => {
    const json = legacy([folderOf("Meetings", [{ name: "Weekly", content: "# {{title}}\n\nLine\n" }, { name: "Empty", content: "" }]), folderOf("Empty folder", [])]);
    const { library, host, disk } = await libraryOf({ [LEGACY_LIBRARY]: json });
    assert.equal(await library.convert(), 2);
    assert.deepEqual(outlineOf(await library.list()), ["Empty folder/", "Meetings/", "  Empty", "  Weekly"]);
    assert.equal(host.folders.read(disk, ".templates/Meetings/Weekly.md"), "# {{title}}\n\nLine\n");
    assert.equal(host.folders.read(disk, LEGACY_LIBRARY), json);
    assert.equal(await library.offersConversion(), false);
  });

  test("makes the names the naming rule refuses acceptable, and numbers the names taken ignoring case", async () => {
    const json = legacy([
      folderOf("a/b", [{ name: "x:y?", content: "1" }, { name: "  .Spaced.. ", content: "2" }, { name: "", content: "3" }, { name: "Notes.md", content: "4" }, { name: "notes", content: "5" }, { name: "NOTES", content: "6" }, { name: "liv-doc-main", content: "7" }]),
      folderOf("A_B", []),
      folderOf("", []),
    ]);
    const { library } = await libraryOf({ [LEGACY_LIBRARY]: json });
    assert.equal(await library.convert(), 7);
    assert.deepEqual(outlineOf(await library.list()), ["a_b/", "  liv-doc-main 2", "  Notes", "  notes 2", "  NOTES 3", "  Spaced", "  Template", "  x_y_", "A_B 2/", "Folder/"]);
  });

  test("rejects with InvalidLegacyLibrary, writing nothing, when the file is not JSON or not the original's format", async () => {
    for (const content of ["not json", "[]", JSON.stringify({ version: 2, folders: [] }), JSON.stringify({ version: 1, folders: [{ id: "a", name: "A", templates: [{ id: "t", name: "T" }] }] }), JSON.stringify({ version: 1, folders: [folderOf("OK", [{ name: "t", content: "" }]), { name: 3, templates: [] }] })]) {
      const { library, host, disk } = await libraryOf({ [LEGACY_LIBRARY]: content });
      await assert.rejects(library.convert(), InvalidLegacyLibrary);
      assert.deepEqual(await library.list(), []);
      assert.equal(host.folders.read(disk, LEGACY_LIBRARY), content);
    }
  });
});
