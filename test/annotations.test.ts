// Annotations: the Document's notes in the Project's `.annotations.json` (docs/spec/annotations.md, docs/adr/0003).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { Conflict, openProject, Refused } from "../src/lib/project.ts";
import { ANNOTATIONS_FILE, type Annotation, addAnnotation, annotationKey, excerpt, normalizeSpaces, placeAnnotations, readAnnotations } from "../src/lib/annotations.ts";

describe("text helpers", () => {
  test("a Document's key is its path without .md", () => {
    assert.equal(annotationKey("guide/intro.md"), "guide/intro");
    assert.equal(annotationKey("readme.md"), "readme");
  });

  test("runs of spaces and line breaks become one space, trimmed", () => {
    assert.equal(normalizeSpaces("  Hello \n\n  big\t world  "), "Hello big world");
    assert.equal(normalizeSpaces(" \n "), "");
  });

  test("the excerpt keeps 120 characters or fewer as they are, spaces normalized", () => {
    assert.equal(excerpt("a  b\nc"), "a b c");
    assert.equal(excerpt("x".repeat(120)), "x".repeat(120));
  });

  test("a longer excerpt is cut at 120 characters and ends with an ellipsis", () => {
    assert.equal(excerpt("x".repeat(121)), `${"x".repeat(120)}…`);
  });
});

const note = (selectedText: string, contextBefore = "", contextAfter = "", id = "a"): Annotation => ({ id, selectedText, contextBefore, contextAfter, note: "n", createdAt: "2026-01-01T10:00:00.000Z" });

describe("placing annotations", () => {
  const text = "Release on Friday. We ship on Friday.";

  test("a passage with its surrounding text is placed at its offsets", () => {
    const annotation = note("on Friday", "", ". We ship");
    assert.deepEqual(placeAnnotations(text, [annotation]), [{ annotation, state: "placed", start: 8, end: 17 }]);
  });

  test("the first match of the passage with its contexts wins", () => {
    const annotation = note("on Friday", "We ship ", ".");
    assert.deepEqual(placeAnnotations(text, [annotation]), [{ annotation, state: "placed", start: 27, end: 36 }]);
    const both = note("Friday", "on ", ".");
    assert.deepEqual(placeAnnotations(text, [both]), [{ annotation: both, state: "placed", start: 11, end: 17 }]);
  });

  test("a passage occurring twice whose contexts no longer match is an orphan, never a guess", () => {
    const annotation = note("on Friday", "Deploy ", " at noon");
    assert.deepEqual(placeAnnotations(text, [annotation]), [{ annotation, state: "orphan" }]);
  });

  test("a passage occurring once whose contexts changed is placed with its surrounding text changed", () => {
    const annotation = note("ship", "We will ", " later");
    assert.deepEqual(placeAnnotations(text, [annotation]), [{ annotation, state: "surroundingChanged", start: 22, end: 26 }]);
  });

  test("a passage that is gone is an orphan", () => {
    const annotation = note("Monday", "on ", "");
    assert.deepEqual(placeAnnotations(text, [annotation]), [{ annotation, state: "orphan" }]);
  });

  test("without contexts, a passage occurring once is placed and one occurring twice is an orphan", () => {
    const once = note("Release");
    const twice = note("Friday");
    assert.deepEqual(placeAnnotations(text, [once, twice]), [
      { annotation: once, state: "placed", start: 0, end: 7 },
      { annotation: twice, state: "orphan" },
    ]);
  });

  test("a blank passage is an orphan", () => {
    const annotation = note("  ", "Release", "");
    assert.deepEqual(placeAnnotations(text, [annotation]), [{ annotation, state: "orphan" }]);
  });

  test("spaces and line breaks in the text match the one space that was stored", () => {
    const spread = "Release  on\nFriday.   We\n\nship on Friday.";
    const annotation = note("on Friday", "", ". We ship");
    assert.deepEqual(placeAnnotations(spread, [annotation]), [{ annotation, state: "placed", start: 9, end: 18 }]);
    assert.equal(spread.slice(9, 18), "on\nFriday");
  });

  test("a context that touches the passage matches without a space, and words with regex characters are matched literally", () => {
    const annotation = note("a.b (c)", "x+", "?y");
    assert.deepEqual(placeAnnotations("x+a.b (c)?y and aXb (c)", [annotation]), [{ annotation, state: "placed", start: 2, end: 9 }]);
    assert.equal(placeAnnotations("aXb (c) only", [note("a.b (c)")])[0]!.state, "orphan");
  });

  test("the placements follow the list order", () => {
    const [first, second] = [note("ship", "", "", "1"), note("Release", "", "", "2")];
    assert.deepEqual(placeAnnotations(text, [first!, second!]).map((each) => each.annotation.id), ["1", "2"]);
  });
});

async function projectOf(files: Record<string, string> = {}) {
  const host = createTestHost({ module: { id: "@craftskillz/living-documentation", version: "0.0.1" }, permissions: { folders: true } });
  const disk = host.folders.create("docs", files);
  host.folders.choose(disk);
  const module = await connect({ transport: host.mount({ surface: "view" }).transport });
  return { host, disk, project: openProject(module, (await module.folders.request())!) };
}

const stored = { id: "u1", selectedText: "Welcome", contextBefore: "", contextAfter: " to the annotated", note: "Greeting", createdAt: "2026-01-01T10:00:00.000Z" };
const draft = { selectedText: "Welcome", contextBefore: "", contextAfter: " to the annotated", note: "Greeting" };
const fixed = { now: () => new Date("2026-02-03T04:05:06.000Z"), id: () => "new-id" };

describe("reading a Document's annotations", () => {
  test("is empty without a file, with a malformed file, a non-object, or a Document without an array", async () => {
    for (const content of [null, "{not json", "[1]", "null", "", '{"other":[]}', '{"guide/intro":"nope"}', '{"guide/intro":{"a":1}}']) {
      const { project } = await projectOf(content === null ? {} : { [ANNOTATIONS_FILE]: content });
      assert.deepEqual(await readAnnotations(project, "guide/intro.md"), [], String(content));
    }
  });

  test("gives the Document's entries as written, with its updated date when present", async () => {
    const edited = { ...stored, id: "u2", updated: "2026-01-02T00:00:00.000Z" };
    const { project } = await projectOf({ [ANNOTATIONS_FILE]: JSON.stringify({ "guide/intro": [stored, edited], other: [{ ...stored, id: "x" }] }) });
    assert.deepEqual(await readAnnotations(project, "guide/intro.md"), [stored, edited]);
  });

  test("drops entries lacking a string id, selectedText or note, and reads missing contexts as empty", async () => {
    const entries = [{ ...stored, id: 3 }, { ...stored, selectedText: undefined }, { ...stored, note: null }, "text", null, { id: "u3", selectedText: "A", note: "B" }];
    const { project } = await projectOf({ [ANNOTATIONS_FILE]: JSON.stringify({ doc: entries }) });
    assert.deepEqual(await readAnnotations(project, "doc.md"), [{ id: "u3", selectedText: "A", contextBefore: "", contextAfter: "", note: "B", createdAt: "" }]);
  });
});

describe("adding an annotation", () => {
  test("creates the file, 2-space indented without a trailing newline, keys in the original's order, and resolves with it", async () => {
    const { host, disk, project } = await projectOf();
    const added = await addAnnotation(project, "guide/intro.md", draft, fixed);
    const expected = { id: "new-id", selectedText: "Welcome", contextBefore: "", contextAfter: "to the annotated", note: "Greeting", createdAt: "2026-02-03T04:05:06.000Z" };
    assert.deepEqual(added, expected);
    assert.equal(host.folders.read(disk, ANNOTATIONS_FILE), JSON.stringify({ "guide/intro": [expected] }, null, 2));
    assert.deepEqual(Object.keys(JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string)["guide/intro"][0]), ["id", "selectedText", "contextBefore", "contextAfter", "note", "createdAt"]);
    assert.deepEqual(await readAnnotations(project, "guide/intro.md"), [expected]);
  });

  test("generates a UUID and the current date by default", async () => {
    const { project } = await projectOf();
    const added = await addAnnotation(project, "a.md", draft);
    assert.match(added.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.ok(Math.abs(Date.now() - Date.parse(added.createdAt)) < 5000);
  });

  test("appends to the Document's list and leaves the other keys and Documents as written", async () => {
    const before = { other: [{ ...stored, id: "x", updated: "2026-01-02T00:00:00.000Z" }], mine: [stored], extra: { deep: [1] } };
    const { host, disk, project } = await projectOf({ [ANNOTATIONS_FILE]: JSON.stringify(before, null, 2) });
    const added = await addAnnotation(project, "mine.md", { ...draft, selectedText: "Other" }, fixed);
    const after = JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string);
    assert.deepEqual(after, { ...before, mine: [stored, added] });
    assert.deepEqual(Object.keys(after), ["other", "mine", "extra"]);
  });

  test("normalizes the passage and the contexts, trims the note and keeps its line breaks", async () => {
    const { project } = await projectOf();
    const added = await addAnnotation(project, "a.md", { selectedText: " Hello \n  world ", contextBefore: "x \n y ", contextAfter: "  z ", note: "  one\n\n  two \n" }, fixed);
    assert.deepEqual([added.selectedText, added.contextBefore, added.contextAfter, added.note], ["Hello world", "x y", "z", "one\n\n  two"]);
  });

  test("refuses a blank passage or a blank note, writing nothing", async () => {
    const { host, disk, project } = await projectOf();
    for (const bad of [{ ...draft, selectedText: " \n" }, { ...draft, note: "  \n " }]) {
      await assert.rejects(addAnnotation(project, "a.md", bad), (error) => error instanceof Refused && error.reason === "empty");
    }
    assert.notEqual(typeof host.folders.read(disk, ANNOTATIONS_FILE), "string");
  });

  test("refuses a file that is not a JSON object, or a Document whose value is not an array, leaving the file untouched", async () => {
    for (const content of ["{not json", "[1]", "42", "null", "", '{"a":"nope"}', '{"a":{}}']) {
      const { host, disk, project } = await projectOf({ [ANNOTATIONS_FILE]: content });
      await assert.rejects(addAnnotation(project, "a.md", draft), (error) => error instanceof Refused && error.reason === "invalidAnnotations", content);
      assert.equal(host.folders.read(disk, ANNOTATIONS_FILE), content);
    }
  });

  /** The Project, whose first `times` saves find the file written by someone else (an agent) first. */
  function interrupted(host: Awaited<ReturnType<typeof projectOf>>["host"], disk: Awaited<ReturnType<typeof projectOf>>["disk"], project: Awaited<ReturnType<typeof projectOf>>["project"], times: number) {
    const save = project.save.bind(project);
    let left = times;
    project.save = async (path, text, version) => {
      if (left-- > 0) {
        const current = JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string);
        host.folders.write(disk, ANNOTATIONS_FILE, JSON.stringify({ ...current, agent: [...(current.agent ?? []), { ...stored, id: `agent${times - left}` }] }, null, 2));
      }
      return save(path, text, version);
    };
  }

  test("after a Conflict, re-reads the file and applies only its own append", async () => {
    const { host, disk, project } = await projectOf({ [ANNOTATIONS_FILE]: JSON.stringify({ a: [stored] }, null, 2) });
    interrupted(host, disk, project, 1);
    const added = await addAnnotation(project, "a.md", draft, fixed);
    const after = JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string);
    assert.deepEqual(after.a, [stored, added]);
    assert.deepEqual(after.agent.map((each: { id: string }) => each.id), ["agent1"]);
  });

  test("gives up with the Conflict after 3 attempts in total", async () => {
    const { host, disk, project } = await projectOf({ [ANNOTATIONS_FILE]: "{}" });
    interrupted(host, disk, project, 3);
    await assert.rejects(addAnnotation(project, "a.md", draft, fixed), Conflict);
    assert.equal(JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string).a, undefined);
  });

  test("succeeds on the third attempt", async () => {
    const { host, disk, project } = await projectOf({ [ANNOTATIONS_FILE]: "{}" });
    interrupted(host, disk, project, 2);
    await addAnnotation(project, "a.md", draft, fixed);
    assert.equal(JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string).a.length, 1);
  });

  test("the Module's own write is not reported as an outside change", async () => {
    const { project } = await projectOf({ [ANNOTATIONS_FILE]: "{}" });
    await project.check();
    await addAnnotation(project, "a.md", draft);
    assert.deepEqual(await project.check(), { tree: false, documents: [] });
  });
});
