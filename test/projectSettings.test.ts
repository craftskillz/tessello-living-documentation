// A Project's settings: the keys of its `.living-doc.json` the Module reads and changes (docs/adr/0003).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { Conflict, openProject, Refused } from "../src/lib/project.ts";
import { changeSetting, readSettings, setSoftBreaks, SETTINGS_FILE } from "../src/lib/projectSettings.ts";

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
    assert.deepEqual(await readSettings(project), { softBreaks: true });
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
