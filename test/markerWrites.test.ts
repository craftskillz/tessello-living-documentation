// Tag marker writes: insert and remove with the version check, and the names already used in the Project.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { insertMarker, removeMarker, usedMarkerNames } from "../src/lib/markerWrites.ts";
import { openProject, Refused } from "../src/lib/project.ts";

async function projectOf(files: Record<string, string>) {
  const host = createTestHost({ module: { id: "@craftskillz/living-documentation", version: "0.0.1" }, permissions: { folders: true } });
  const disk = host.folders.create("docs", files);
  host.folders.choose(disk);
  const module = await connect({ transport: host.mount({ surface: "view" }).transport });
  return { host, disk, project: openProject(module, (await module.folders.request())!) };
}

const refusedPassage = (error: unknown) => error instanceof Refused && error.reason === "passageChanged";

describe("inserting a marker", () => {
  test("writes the tag before the character and returns the new text and version", async () => {
    const { project } = await projectOf({ "a.md": "Hello world\n" });
    const base = await project.read("a.md");
    const saved = await insertMarker(project, "a.md", base, 6, "<todo>", { from: 0, to: 11 });
    assert.equal(saved.text, "Hello <todo>world\n");
    assert.deepEqual(await project.read("a.md"), saved);
  });

  test("an agent change outside the passage is kept and the insertion is retried", async () => {
    const { project } = await projectOf({ "a.md": "First\n\nSecond\n" });
    const base = await project.read("a.md");
    await project.save("a.md", "First\n\nSecond\n\nAgent added\n", base.version);
    const saved = await insertMarker(project, "a.md", base, 2, "<todo>", { from: 0, to: 5 });
    assert.equal(saved.text, "Fi<todo>rst\n\nSecond\n\nAgent added\n");
    assert.equal((await project.read("a.md")).text, saved.text);
  });

  test("an agent change inside the passage refuses with passageChanged and keeps the agent's file", async () => {
    const { project } = await projectOf({ "a.md": "First\n\nSecond\n" });
    const base = await project.read("a.md");
    await project.save("a.md", "Firstly\n\nSecond\n", base.version);
    await assert.rejects(insertMarker(project, "a.md", base, 2, "<todo>", { from: 0, to: 7 }), refusedPassage);
    assert.equal((await project.read("a.md")).text, "Firstly\n\nSecond\n");
  });

  test("a Document deleted meanwhile refuses with passageChanged", async () => {
    const { project } = await projectOf({ "a.md": "First\n" });
    const base = await project.read("a.md");
    await project.save("a.md", "Changed\n", base.version);
    await project.remove("a.md");
    await assert.rejects(insertMarker(project, "a.md", base, 2, "<todo>", { from: 0, to: 5 }), refusedPassage);
  });
});

describe("removing a marker", () => {
  test("deletes the tag at the range, not the other with the same name", async () => {
    const { project } = await projectOf({ "a.md": "A <todo> b <todo> c\n" });
    const base = await project.read("a.md");
    const saved = await removeMarker(project, "a.md", base, { from: 11, to: 17 });
    assert.equal(saved.text, "A <todo> b  c\n");
  });
});

describe("the names used in the Project", () => {
  test("lists lower-cased names once, in first-seen order, ignoring code and HTML elements", async () => {
    const { project } = await projectOf({
      "a.md": "One <Rewrite-Section> and <todo>\n\n```\n<in-code>\n```\n\nInline `<in-span>` and <div>x</div>\n",
      "b.md": "Again <todo> and <fix-me>\n",
    });
    const tree = await project.tree();
    assert.deepEqual(await usedMarkerNames(project, tree, true), ["rewrite-section", "todo", "fix-me"]);
  });
});
