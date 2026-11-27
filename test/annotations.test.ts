// Annotations: the Document's notes in the Project's `.annotations.json` (docs/spec/annotations.md, docs/adr/0003).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { Conflict, openProject, Refused } from "../src/lib/project.ts";
import { ANNOTATIONS_FILE, type Annotation, addAnnotation, annotationKey, editAnnotation, excerpt, isDone, normalizeSpaces, placeAnnotations, readAnnotations, removeAnnotation, replyToAnnotation, setAnnotationStatus } from "../src/lib/annotations.ts";

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

/** The Project, whose first `times` saves find the file written by someone else (an agent) first. */
function interrupted(host: Awaited<ReturnType<typeof projectOf>>["host"], disk: Awaited<ReturnType<typeof projectOf>>["disk"], project: Awaited<ReturnType<typeof projectOf>>["project"], times: number, into = "agent") {
  const save = project.save.bind(project);
  let left = times;
  project.save = async (path, text, version) => {
    if (left-- > 0) {
      const current = JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string);
      host.folders.write(disk, ANNOTATIONS_FILE, JSON.stringify({ ...current, [into]: [...(current[into] ?? []), { ...stored, id: `agent${times - left}` }] }, null, 2));
    }
    return save(path, text, version);
  };
}

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

describe("editing an annotation", () => {
  const later = { now: () => new Date("2026-03-04T05:06:07.000Z") };
  const file = (extra: object = {}) => ({ [ANNOTATIONS_FILE]: JSON.stringify({ a: [stored, { ...stored, id: "u2", note: "Second" }], other: [{ ...stored, id: "x" }], ...extra }, null, 2) });

  test("changes the note, keeps createdAt, puts `updated` last, and leaves the rest as written", async () => {
    const { host, disk, project } = await projectOf(file());
    const edited = await editAnnotation(project, "a.md", "u1", "  New\n\n  note \n", later);
    assert.deepEqual(edited, { ...stored, note: "New\n\n  note", updated: "2026-03-04T05:06:07.000Z" });
    const raw = host.folders.read(disk, ANNOTATIONS_FILE) as string;
    assert.deepEqual(Object.keys(JSON.parse(raw).a[0]), ["id", "selectedText", "contextBefore", "contextAfter", "note", "createdAt", "updated"]);
    assert.equal(raw, JSON.stringify({ a: [edited, { ...stored, id: "u2", note: "Second" }], other: [{ ...stored, id: "x" }] }, null, 2));
  });

  test("an annotation edited again gets the new `updated` date, still last", async () => {
    const { project } = await projectOf({ [ANNOTATIONS_FILE]: JSON.stringify({ a: [{ ...stored, updated: "2026-01-02T00:00:00.000Z" }] }) });
    const edited = await editAnnotation(project, "a.md", "u1", "Again", later);
    assert.equal(edited.updated, "2026-03-04T05:06:07.000Z");
    assert.deepEqual(await readAnnotations(project, "a.md"), [edited]);
  });

  test("uses the current date by default", async () => {
    const { project } = await projectOf(file());
    const edited = await editAnnotation(project, "a.md", "u1", "x");
    assert.ok(Math.abs(Date.now() - Date.parse(edited.updated!)) < 5000);
  });

  test("a blank note is refused, nothing written", async () => {
    const { host, disk, project } = await projectOf(file());
    const before = host.folders.read(disk, ANNOTATIONS_FILE);
    await assert.rejects(editAnnotation(project, "a.md", "u1", " \n "), (error) => error instanceof Refused && error.reason === "empty");
    assert.equal(host.folders.read(disk, ANNOTATIONS_FILE), before);
  });

  test("an annotation that is gone, or no file, is refused as missing", async () => {
    const { project } = await projectOf(file());
    await assert.rejects(editAnnotation(project, "a.md", "nope", "x"), (error) => error instanceof Refused && error.reason === "missing");
    await assert.rejects(editAnnotation(project, "b.md", "u1", "x"), (error) => error instanceof Refused && error.reason === "missing");
    const empty = await projectOf();
    await assert.rejects(editAnnotation(empty.project, "a.md", "u1", "x"), (error) => error instanceof Refused && error.reason === "missing");
    assert.notEqual(typeof empty.host.folders.read(empty.disk, ANNOTATIONS_FILE), "string");
  });

  test("a malformed file or entry is refused, the file untouched", async () => {
    for (const content of ["{not json", "[1]", "null", '{"a":"nope"}', '{"a":{}}']) {
      const { host, disk, project } = await projectOf({ [ANNOTATIONS_FILE]: content });
      await assert.rejects(editAnnotation(project, "a.md", "u1", "x"), (error) => error instanceof Refused && error.reason === "invalidAnnotations", content);
      assert.equal(host.folders.read(disk, ANNOTATIONS_FILE), content);
    }
  });

  test("concurrent writes do not lose others' annotations: an agent's add between read and write survives", async () => {
    const { host, disk, project } = await projectOf(file());
    interrupted(host, disk, project, 1, "a");
    const edited = await editAnnotation(project, "a.md", "u1", "Mine", later);
    const after = JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string);
    assert.deepEqual(after.a.map((each: Annotation) => each.id), ["u1", "u2", "agent1"]);
    assert.equal(after.a[0].note, edited.note);
  });

  test("gives up with the Conflict after 3 attempts, succeeds on the third", async () => {
    const failing = await projectOf(file());
    interrupted(failing.host, failing.disk, failing.project, 3);
    await assert.rejects(editAnnotation(failing.project, "a.md", "u1", "x"), Conflict);
    const third = await projectOf(file());
    interrupted(third.host, third.disk, third.project, 2);
    await editAnnotation(third.project, "a.md", "u1", "x");
    assert.equal((await readAnnotations(third.project, "a.md"))[0]!.note, "x");
  });

  test("when someone else deleted the annotation meanwhile, the edit is refused as missing", async () => {
    const { host, disk, project } = await projectOf(file());
    const save = project.save.bind(project);
    let once = true;
    project.save = async (path, text, version) => {
      if (once) {
        once = false;
        host.folders.write(disk, ANNOTATIONS_FILE, JSON.stringify({ a: [{ ...stored, id: "u2", note: "Second" }] }));
      }
      return save(path, text, version);
    };
    await assert.rejects(editAnnotation(project, "a.md", "u1", "x"), (error) => error instanceof Refused && error.reason === "missing");
  });

  test("the Module's own write is not reported as an outside change", async () => {
    const { project } = await projectOf(file());
    await project.check();
    await editAnnotation(project, "a.md", "u1", "x");
    assert.deepEqual(await project.check(), { tree: false, documents: [] });
  });
});

describe("removing an annotation", () => {
  const file = (a: object[] = [stored, { ...stored, id: "u2" }]) => ({ [ANNOTATIONS_FILE]: JSON.stringify({ a, other: [{ ...stored, id: "x" }] }, null, 2) });

  test("deletes it and keeps the others as written", async () => {
    const { host, disk, project } = await projectOf(file());
    await removeAnnotation(project, "a.md", "u1");
    assert.equal(host.folders.read(disk, ANNOTATIONS_FILE), JSON.stringify({ a: [{ ...stored, id: "u2" }], other: [{ ...stored, id: "x" }] }, null, 2));
  });

  test("the Document's key goes when its list becomes empty", async () => {
    const { host, disk, project } = await projectOf(file([stored]));
    await removeAnnotation(project, "a.md", "u1");
    assert.equal(host.folders.read(disk, ANNOTATIONS_FILE), JSON.stringify({ other: [{ ...stored, id: "x" }] }, null, 2));
  });

  test("an annotation already gone, or no file, resolves without writing", async () => {
    const { host, disk, project } = await projectOf(file());
    const before = host.folders.read(disk, ANNOTATIONS_FILE);
    await removeAnnotation(project, "a.md", "nope");
    await removeAnnotation(project, "b.md", "u1");
    assert.equal(host.folders.read(disk, ANNOTATIONS_FILE), before);
    const empty = await projectOf();
    await removeAnnotation(empty.project, "a.md", "u1");
    assert.notEqual(typeof empty.host.folders.read(empty.disk, ANNOTATIONS_FILE), "string");
  });

  test("a malformed file or entry is refused, the file untouched", async () => {
    for (const content of ["{not json", "[1]", "null", '{"a":"nope"}', '{"a":{}}']) {
      const { host, disk, project } = await projectOf({ [ANNOTATIONS_FILE]: content });
      await assert.rejects(removeAnnotation(project, "a.md", "u1"), (error) => error instanceof Refused && error.reason === "invalidAnnotations", content);
      assert.equal(host.folders.read(disk, ANNOTATIONS_FILE), content);
    }
  });

  test("concurrent writes do not lose others' annotations: an agent's add between read and write survives", async () => {
    const { host, disk, project } = await projectOf(file());
    interrupted(host, disk, project, 1, "a");
    await removeAnnotation(project, "a.md", "u1");
    const after = JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string);
    assert.deepEqual(after.a.map((each: Annotation) => each.id), ["u2", "agent1"]);
  });

  test("an agent's add to another Document survives, and an agent's add to an emptied Document keeps its key", async () => {
    const { host, disk, project } = await projectOf(file([stored]));
    interrupted(host, disk, project, 1, "agentDoc");
    await removeAnnotation(project, "a.md", "u1");
    const after = JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string);
    assert.deepEqual(Object.keys(after), ["other", "agentDoc"]);
  });

  test("gives up with the Conflict after 3 attempts", async () => {
    const { host, disk, project } = await projectOf(file());
    interrupted(host, disk, project, 3);
    await assert.rejects(removeAnnotation(project, "a.md", "u1"), Conflict);
  });

  test("the Module's own write is not reported as an outside change", async () => {
    const { project } = await projectOf(file());
    await project.check();
    await removeAnnotation(project, "a.md", "u1");
    assert.deepEqual(await project.check(), { tree: false, documents: [] });
  });
});

describe("annotations as tasks (ADR 0012)", () => {
  const later = { now: () => new Date("2026-03-04T05:06:07.000Z") };
  const agentReply = { author: "agent", text: "Example added under the heading.", createdAt: "2026-02-01T00:00:00.000Z" };
  const file = (entry: object = stored) => ({ [ANNOTATIONS_FILE]: JSON.stringify({ a: [entry, { ...stored, id: "u2" }], other: [{ ...stored, id: "x" }] }, null, 2) });

  test("an annotation without a status is to do; its status and replies are read as written", async () => {
    const done = { ...stored, id: "u2", status: "done", replies: [agentReply] };
    const { project } = await projectOf({ [ANNOTATIONS_FILE]: JSON.stringify({ a: [stored, done] }) });
    const [first, second] = await readAnnotations(project, "a.md");
    assert.equal(isDone(first!), false);
    assert.deepEqual(second, done);
    assert.equal(isDone(second!), true);
  });

  test("an unknown status reads as to do, and malformed replies are dropped", async () => {
    const replies = [agentReply, { author: "user", text: "Thanks", createdAt: 3 }, { author: "robot", text: "x" }, { author: "user" }, "text", null];
    const { project } = await projectOf({ [ANNOTATIONS_FILE]: JSON.stringify({ a: [{ ...stored, status: "closed", replies }, { ...stored, id: "u2", replies: "none" }] }) });
    const [first, second] = await readAnnotations(project, "a.md");
    assert.equal(first!.status, undefined);
    assert.deepEqual(first!.replies, [agentReply, { author: "user", text: "Thanks", createdAt: "" }]);
    assert.equal(second!.replies, undefined);
  });

  test("a reply is appended with author user, trimmed, keeping the status and every other key as written", async () => {
    const { host, disk, project } = await projectOf(file({ ...stored, status: "done", replies: [agentReply], extra: { deep: 1 } }));
    const replied = await replyToAnnotation(project, "a.md", "u1", "  Not quite:\n\n  shorter please \n", later);
    const reply = { author: "user", text: "Not quite:\n\n  shorter please", createdAt: "2026-03-04T05:06:07.000Z" };
    assert.deepEqual(replied.replies, [agentReply, reply]);
    assert.equal(replied.status, "done");
    const after = JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string);
    assert.deepEqual(after.a[0], { ...stored, status: "done", replies: [agentReply, reply], extra: { deep: 1 } });
    assert.deepEqual(after.a.slice(1), [{ ...stored, id: "u2" }]);
    assert.deepEqual(after.other, [{ ...stored, id: "x" }]);
  });

  test("a first reply creates the list, after the existing keys", async () => {
    const { host, disk, project } = await projectOf(file());
    await replyToAnnotation(project, "a.md", "u1", "First", later);
    const entry = JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string).a[0];
    assert.deepEqual(Object.keys(entry), ["id", "selectedText", "contextBefore", "contextAfter", "note", "createdAt", "replies"]);
  });

  test("a blank reply is refused, a missing annotation too, and malformed replies are never overwritten", async () => {
    const { host, disk, project } = await projectOf(file({ ...stored, replies: "keep me" }));
    const before = host.folders.read(disk, ANNOTATIONS_FILE);
    await assert.rejects(replyToAnnotation(project, "a.md", "u2", " \n "), (error) => error instanceof Refused && error.reason === "empty");
    await assert.rejects(replyToAnnotation(project, "a.md", "nope", "x"), (error) => error instanceof Refused && error.reason === "missing");
    await assert.rejects(replyToAnnotation(project, "a.md", "u1", "x"), (error) => error instanceof Refused && error.reason === "invalidAnnotations");
    assert.equal(host.folders.read(disk, ANNOTATIONS_FILE), before);
  });

  test("marking done writes the status, in place when it exists; reopening writes todo", async () => {
    const { host, disk, project } = await projectOf(file({ ...stored, replies: [agentReply] }));
    const done = await setAnnotationStatus(project, "a.md", "u1", "done");
    assert.equal(done.status, "done");
    const read = () => JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string).a[0];
    assert.deepEqual(Object.keys(read()), ["id", "selectedText", "contextBefore", "contextAfter", "note", "createdAt", "replies", "status"]);
    await setAnnotationStatus(project, "a.md", "u1", "todo");
    assert.deepEqual(read(), { ...stored, replies: [agentReply], status: "todo" });
    assert.deepEqual(Object.keys(read()), ["id", "selectedText", "contextBefore", "contextAfter", "note", "createdAt", "replies", "status"]);
  });

  test("a status that is already the wanted one writes nothing", async () => {
    const { host, disk, project } = await projectOf(file({ ...stored, status: "done" }));
    const before = host.folders.read(disk, ANNOTATIONS_FILE);
    assert.equal((await setAnnotationStatus(project, "a.md", "u1", "done")).status, "done");
    assert.equal(host.folders.read(disk, ANNOTATIONS_FILE), before);
  });

  test("a missing annotation is refused when setting its status", async () => {
    const { project } = await projectOf(file());
    await assert.rejects(setAnnotationStatus(project, "a.md", "nope", "done"), (error) => error instanceof Refused && error.reason === "missing");
  });

  test("editing the note keeps the status and the replies", async () => {
    const { project } = await projectOf(file({ ...stored, status: "done", replies: [agentReply] }));
    const edited = await editAnnotation(project, "a.md", "u1", "New", later);
    assert.deepEqual([edited.status, edited.replies], ["done", [agentReply]]);
  });

  test("replying and setting the status survive an agent's concurrent write and give up after 3 attempts", async () => {
    const { host, disk, project } = await projectOf(file());
    interrupted(host, disk, project, 1, "a");
    await replyToAnnotation(project, "a.md", "u1", "Mine", later);
    await setAnnotationStatus(project, "a.md", "u2", "done");
    const after = JSON.parse(host.folders.read(disk, ANNOTATIONS_FILE) as string);
    assert.deepEqual(after.a.map((each: Annotation) => each.id), ["u1", "u2", "agent1"]);
    assert.equal(after.a[0].replies[0].text, "Mine");
    assert.equal(after.a[1].status, "done");
    const failing = await projectOf(file());
    interrupted(failing.host, failing.disk, failing.project, 3);
    await assert.rejects(setAnnotationStatus(failing.project, "a.md", "u1", "done"), Conflict);
  });

  test("the Module's own writes are not reported as outside changes", async () => {
    const { project } = await projectOf(file());
    await project.check();
    await replyToAnnotation(project, "a.md", "u1", "x");
    await setAnnotationStatus(project, "a.md", "u1", "done");
    assert.deepEqual(await project.check(), { tree: false, documents: [] });
  });
});
