// A Project's settings: the keys of its `.living-doc.json` the Module reads and changes (docs/adr/0003).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { Conflict, openProject, Refused } from "../src/lib/project.ts";
import { changeSetting, formatList, parseList, readSettings, setExcluded, setShownExtensions, setSoftBreaks, setTagNames, SETTINGS_FILE } from "../src/lib/projectSettings.ts";

async function projectOf(files: Record<string, string> = {}) {
  const host = createTestHost({ module: { id: "@craftskillz/living-documentation", version: "0.0.1" }, permissions: { folders: true } });
  const disk = host.folders.create("docs", files);
  host.folders.choose(disk);
  const module = await connect({ transport: host.mount({ surface: "view" }).transport });
  return { host, disk, project: openProject(module, (await module.folders.request())!) };
}

describe("reading the settings", () => {
  test("soft breaks are on without a file", async () => {
    const { project } = await projectOf();
    assert.deepEqual(await readSettings(project), {
      softBreaks: true,
      visibility: {
        shownExtensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico", "pdf", "txt"],
        excluded: [".git", "node_modules", ".DS_Store"],
      },
      tagNames: [],
    });
  });

  test("markdownSoftBreaks is read as written", async () => {
    for (const written of [true, false]) {
      const { project } = await projectOf({ [SETTINGS_FILE]: JSON.stringify({ markdownSoftBreaks: written }) });
      assert.equal((await readSettings(project)).softBreaks, written);
    }
  });

  test("a value that is not a boolean, a malformed file or a file that is not an object gives on", async () => {
    for (const content of ['{"markdownSoftBreaks":"yes"}', '{"markdownSoftBreaks":0}', "{not json", "[false]", "false", "", "null"]) {
      const { project } = await projectOf({ [SETTINGS_FILE]: content });
      assert.equal((await readSettings(project)).softBreaks, true, content);
    }
  });
});

describe("reading the Tree's visibility settings", () => {
  const defaults = {
    shownExtensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico", "pdf", "txt"],
    excluded: [".git", "node_modules", ".DS_Store"],
  };
  const read = async (content: unknown) => (await readSettings((await projectOf({ [SETTINGS_FILE]: JSON.stringify(content) })).project)).visibility;

  test("treeShownExtensions alone replaces the shown extensions only", async () => {
    assert.deepEqual(await read({ treeShownExtensions: ["md", "csv"] }), { ...defaults, shownExtensions: ["md", "csv"] });
  });

  test("treeExcluded alone replaces the excluded names only", async () => {
    assert.deepEqual(await read({ treeExcluded: ["dist", "build"] }), { ...defaults, excluded: ["dist", "build"] });
  });

  test("a value that is not an array of strings gives that list's default, the other list is still read", async () => {
    for (const bad of ["png", 3, null, { a: 1 }, ["png", 1], [["png"]]]) {
      assert.deepEqual(await read({ treeShownExtensions: bad, treeExcluded: ["dist"] }), { ...defaults, excluded: ["dist"] });
      assert.deepEqual(await read({ treeShownExtensions: ["md"], treeExcluded: bad }), { ...defaults, shownExtensions: ["md"] });
    }
  });

  test("a malformed file or a file that is not an object gives both defaults", async () => {
    for (const content of ["{not json", "[1]", "null", ""]) {
      const { project } = await projectOf({ [SETTINGS_FILE]: content });
      assert.deepEqual((await readSettings(project)).visibility, defaults, content);
    }
  });

  test("extensions lose their leading dot and are lower-cased and trimmed, empty items dropped", async () => {
    assert.deepEqual(await read({ treeShownExtensions: [".PNG", " Jpg ", "", "  ", ".", "pdf"] }), { ...defaults, shownExtensions: ["png", "jpg", "pdf"] });
  });

  test("excluded names are trimmed and empty items dropped, otherwise exact", async () => {
    assert.deepEqual(await read({ treeExcluded: [" Dist ", "", "  ", ".git"] }), { ...defaults, excluded: ["Dist", ".git"] });
  });

  test("an empty array is kept: nothing shown, nothing excluded", async () => {
    assert.deepEqual(await read({ treeShownExtensions: [], treeExcluded: [] }), { shownExtensions: [], excluded: [] });
  });
});

describe("changing a setting", () => {
  test("creates the file when it is missing, 2-space indented with a trailing newline", async () => {
    const { host, disk, project } = await projectOf();
    await setSoftBreaks(project, false);
    assert.equal(host.folders.read(disk, SETTINGS_FILE), '{\n  "markdownSoftBreaks": false\n}\n');
    assert.equal((await readSettings(project)).softBreaks, false);
  });

  test("changes only its key: the other keys keep their values and their order", async () => {
    const written = { favorites: [{ id: "a", title: "A" }], mine: { deep: [1, 2] }, markdownSoftBreaks: true, tagSuggestions: ["x"], unknown: null };
    const { host, disk, project } = await projectOf({ [SETTINGS_FILE]: `${JSON.stringify(written, null, 2)}\n` });
    await setSoftBreaks(project, false);
    const after = host.folders.read(disk, SETTINGS_FILE) as string;
    assert.deepEqual(JSON.parse(after), { ...written, markdownSoftBreaks: false });
    assert.deepEqual(Object.keys(JSON.parse(after)), Object.keys(written));
    assert.equal(after, `${JSON.stringify({ ...written, markdownSoftBreaks: false }, null, 2)}\n`);
  });

  test("a key that is not there yet is added at the end", async () => {
    const { host, disk, project } = await projectOf({ [SETTINGS_FILE]: '{"favorites":[]}\n' });
    await changeSetting(project, "markdownSoftBreaks", true);
    assert.deepEqual(Object.keys(JSON.parse(host.folders.read(disk, SETTINGS_FILE) as string)), ["favorites", "markdownSoftBreaks"]);
  });

  test("keeps the file's tabs or 4 spaces", async () => {
    for (const indent of ["\t", "    "]) {
      const { host, disk, project } = await projectOf({ [SETTINGS_FILE]: JSON.stringify({ a: 1 }, null, indent) });
      await setSoftBreaks(project, false);
      assert.equal(host.folders.read(disk, SETTINGS_FILE), `${JSON.stringify({ a: 1, markdownSoftBreaks: false }, null, indent)}\n`);
    }
  });

  test("refuses a file that is not a JSON object and leaves it untouched", async () => {
    for (const content of ["{not json", "[1]", "42", "null", ""]) {
      const { host, disk, project } = await projectOf({ [SETTINGS_FILE]: content });
      await assert.rejects(setSoftBreaks(project, false), (error) => error instanceof Refused && error.reason === "invalidSettings");
      assert.equal(host.folders.read(disk, SETTINGS_FILE), content);
    }
  });

  test("is a Conflict when the file changed between the read and the write", async () => {
    const { host, disk, project } = await projectOf({ [SETTINGS_FILE]: '{"a":1}' });
    const read = project.read.bind(project);
    project.read = async (path) => {
      const result = await read(path);
      host.folders.write(disk, SETTINGS_FILE, '{"a":2}');
      return result;
    };
    await assert.rejects(setSoftBreaks(project, false), Conflict);
    assert.equal(host.folders.read(disk, SETTINGS_FILE), '{"a":2}');
  });

  test("is a Conflict when the file appeared after it was found missing", async () => {
    const { host, disk, project } = await projectOf();
    const read = project.read.bind(project);
    project.read = async (path) => {
      const result = await read(path).catch((error: unknown) => {
        host.folders.write(disk, SETTINGS_FILE, '{"a":2}');
        throw error;
      });
      return result;
    };
    await assert.rejects(setSoftBreaks(project, false), Conflict);
    assert.equal(host.folders.read(disk, SETTINGS_FILE), '{"a":2}');
  });

  test("the Module's own write is not reported as an outside change", async () => {
    const { project } = await projectOf({ [SETTINGS_FILE]: "{}" });
    await project.check();
    await setSoftBreaks(project, false);
    assert.deepEqual(await project.check(), { tree: false, documents: [] });
  });
});

describe("changing the Tree's visibility settings", () => {
  test("setShownExtensions writes the normalized list on a missing file, 2-space indented", async () => {
    const { host, disk, project } = await projectOf();
    await setShownExtensions(project, [".PNG", " pdf ", ""]);
    assert.equal(host.folders.read(disk, SETTINGS_FILE), '{\n  "treeShownExtensions": [\n    "png",\n    "pdf"\n  ]\n}\n');
    assert.deepEqual((await readSettings(project)).visibility.shownExtensions, ["png", "pdf"]);
  });

  test("setExcluded writes the trimmed list and keeps the other keys, their order and the tab indentation", async () => {
    const written = { markdownSoftBreaks: false, unknown: { deep: [1] }, treeShownExtensions: ["md"] };
    const { host, disk, project } = await projectOf({ [SETTINGS_FILE]: JSON.stringify(written, null, "\t") });
    await setExcluded(project, [" dist ", "", "build"]);
    assert.equal(host.folders.read(disk, SETTINGS_FILE), `${JSON.stringify({ ...written, treeExcluded: ["dist", "build"] }, null, "\t")}\n`);
  });

  test("setting an empty list is kept as an empty array", async () => {
    const { project } = await projectOf({ [SETTINGS_FILE]: '{"treeExcluded":["x"]}' });
    await setExcluded(project, []);
    assert.deepEqual((await readSettings(project)).visibility.excluded, []);
  });

  test("refuse a file that is not a JSON object and leave it untouched", async () => {
    for (const set of [setShownExtensions, setExcluded]) {
      const { host, disk, project } = await projectOf({ [SETTINGS_FILE]: "[1]" });
      await assert.rejects(set(project, ["a"]), (error) => error instanceof Refused && error.reason === "invalidSettings");
      assert.equal(host.folders.read(disk, SETTINGS_FILE), "[1]");
    }
  });

  test("are a Conflict when the file changed between the read and the write", async () => {
    for (const set of [setShownExtensions, setExcluded]) {
      const { host, disk, project } = await projectOf({ [SETTINGS_FILE]: '{"a":1}' });
      const read = project.read.bind(project);
      project.read = async (path) => {
        const result = await read(path);
        host.folders.write(disk, SETTINGS_FILE, '{"a":2}');
        return result;
      };
      await assert.rejects(set(project, ["a"]), Conflict);
      assert.equal(host.folders.read(disk, SETTINGS_FILE), '{"a":2}');
    }
  });
});

describe("the dialog's list text", () => {
  test("parseList splits on commas, trims and drops empty items, keeping what was typed", () => {
    assert.deepEqual(parseList("png, .JPG ,, pdf"), ["png", ".JPG", "pdf"]);
    assert.deepEqual(parseList(""), []);
    assert.deepEqual(parseList(" , "), []);
  });

  test("formatList joins with a comma and a space", () => {
    assert.equal(formatList(["png", "jpg", "pdf"]), "png, jpg, pdf");
    assert.equal(formatList([]), "");
  });
});

describe("the Tag names setting", () => {
  test("reads tagSuggestions normalized, dropping invalid entries and duplicates", async () => {
    const { project } = await projectOf({ [SETTINGS_FILE]: JSON.stringify({ tagSuggestions: ["<Add-Footnote>", "rewrite-section", "bad name", "1x", "add-footnote"] }) });
    assert.deepEqual((await readSettings(project)).tagNames, ["add-footnote", "rewrite-section"]);
  });

  test("a value that is not an array of strings, or no key, gives []", async () => {
    for (const written of ["todo", 3, { a: 1 }, ["todo", 2], null]) {
      const { project } = await projectOf({ [SETTINGS_FILE]: JSON.stringify({ tagSuggestions: written }) });
      assert.deepEqual((await readSettings(project)).tagNames, [], JSON.stringify(written));
    }
    assert.deepEqual((await readSettings((await projectOf({})).project)).tagNames, []);
  });

  test("setTagNames writes the normalized names and keeps the other keys", async () => {
    const { project } = await projectOf({ [SETTINGS_FILE]: JSON.stringify({ markdownSoftBreaks: false }) });
    await setTagNames(project, ["<Todo>", "fix-me", "todo"]);
    assert.deepEqual(JSON.parse((await project.read(SETTINGS_FILE)).text), { markdownSoftBreaks: false, tagSuggestions: ["todo", "fix-me"] });
  });
});
