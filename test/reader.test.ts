// Reader: written from the spec (Read aloud rules 10-11), driven by a fake Speaker.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createReader, type Position, type ReaderState, type ScriptSegment, type Speaker } from "../src/lib/reader.ts";

type Handlers = { onend(): void; onerror(message: string): void };

class FakeSpeaker implements Speaker {
  spoken: string[] = [];
  cancels = 0;
  private current: Handlers | null = null;
  private all: Handlers[] = [];
  speak(text: string, handlers: Handlers): void {
    this.spoken.push(text);
    this.current = handlers;
    this.all.push(handlers);
  }
  cancel(): void {
    this.cancels++;
    this.current = null;
  }
  /** The current utterance finishes. */
  end(): void {
    const h = this.current;
    assert.ok(h, "nothing is being spoken");
    this.current = null;
    h.onend();
  }
  fail(message: string): void {
    const h = this.current;
    assert.ok(h, "nothing is being spoken");
    this.current = null;
    h.onerror(message);
  }
  /** A buggy Speaker: fires the handler of the n-th utterance (0-based) even though it was cancelled. */
  staleEnd(n: number): void {
    this.all[n]!.onend();
  }
  staleFail(n: number, message: string): void {
    this.all[n]!.onerror(message);
  }
  get speaking(): boolean {
    return this.current !== null;
  }
}

const seg = (kind: string, ...sentences: string[][]): ScriptSegment => ({
  kind,
  sentences: sentences.map((pieces) => ({ pieces })),
});

function setup() {
  const speaker = new FakeSpeaker();
  const states: ReaderState[] = [];
  const errors: string[] = [];
  const reader = createReader(speaker, {
    onchange: (s) => states.push(structuredClone(s)),
    onerror: (m) => errors.push(m),
  });
  const finish = () => {
    while (speaker.speaking) speaker.end();
  };
  return { speaker, reader, states, errors, finish };
}

const at = (segment: number, sentence: number): Position => ({ segment, sentence });

const doc: ScriptSegment[] = [
  seg("heading", ["Title"]),
  seg("paragraph", ["One a", "One b"], ["Two"]),
  seg("heading", ["Second"]),
  seg("paragraph", ["Three"]),
];

describe("Reader", () => {
  test("reads every piece and sentence in order, then ends idle", () => {
    const { speaker, reader, states, finish } = setup();
    reader.start(doc);
    assert.deepEqual(speaker.spoken, ["Title"]);
    assert.equal(reader.state.status, "playing");
    assert.deepEqual(reader.state.at, at(0, 0));
    finish();
    assert.deepEqual(speaker.spoken, ["Title", "One a", "One b", "Two", "Second", "Three"]);
    assert.deepEqual(reader.state, { status: "idle", at: null, hasNextSection: false });
    assert.deepEqual(states.at(-1), { status: "idle", at: null, hasNextSection: false });
  });

  test("the highlight stays on a sentence while its pieces play", () => {
    const { speaker, reader } = setup();
    reader.start(doc, at(1, 0));
    assert.deepEqual(reader.state.at, at(1, 0));
    speaker.end();
    assert.deepEqual(speaker.spoken, ["One a", "One b"]);
    assert.deepEqual(reader.state.at, at(1, 0));
    speaker.end();
    assert.deepEqual(reader.state.at, at(1, 1));
  });

  test("skips sentences without pieces and segments without sentences", () => {
    const { speaker, reader, finish } = setup();
    reader.start([seg("paragraph"), seg("paragraph", [], ["A"], []), seg("paragraph"), seg("paragraph", ["B"])]);
    assert.deepEqual(reader.state.at, at(1, 1));
    finish();
    assert.deepEqual(speaker.spoken, ["A", "B"]);
    assert.equal(reader.state.status, "idle");
  });

  test("an empty script does nothing and stays idle", () => {
    const { speaker, reader, states } = setup();
    reader.start([]);
    reader.start([seg("heading"), seg("paragraph", [])]);
    assert.deepEqual(speaker.spoken, []);
    assert.deepEqual(states, []);
    assert.deepEqual(reader.state, { status: "idle", at: null, hasNextSection: false });
  });

  test("starts from a given position", () => {
    const { speaker, reader, finish } = setup();
    reader.start(doc, at(1, 1));
    finish();
    assert.deepEqual(speaker.spoken, ["Two", "Second", "Three"]);
  });

  test("pause cancels the speaker; resume speaks the current piece again from its start", () => {
    const { speaker, reader } = setup();
    reader.start(doc, at(1, 0));
    speaker.end(); // "One a" done, "One b" playing
    reader.pause();
    assert.equal(speaker.speaking, false);
    assert.equal(speaker.cancels, 1);
    assert.equal(reader.state.status, "paused");
    assert.deepEqual(reader.state.at, at(1, 0));
    reader.resume();
    assert.deepEqual(speaker.spoken, ["One a", "One b", "One b"]);
    assert.equal(reader.state.status, "playing");
    speaker.end();
    assert.deepEqual(speaker.spoken.at(-1), "Two");
  });

  test("pause while paused and resume while playing do nothing", () => {
    const { speaker, reader, states } = setup();
    reader.start(doc);
    reader.resume();
    assert.equal(speaker.spoken.length, 1);
    reader.pause();
    const n = states.length;
    reader.pause();
    assert.equal(speaker.cancels, 1);
    assert.equal(states.length, n);
    const idle = setup();
    idle.reader.pause();
    idle.reader.resume();
    assert.deepEqual(idle.speaker.spoken, []);
    assert.deepEqual(idle.states, []);
  });

  test("a stale end after pause does not advance the reading", () => {
    const { speaker, reader } = setup();
    reader.start(doc, at(1, 0));
    reader.pause();
    speaker.staleEnd(0);
    assert.deepEqual(speaker.spoken, ["One a"]);
    assert.equal(reader.state.status, "paused");
  });

  test("nextSection while playing jumps to the next heading and speaks it", () => {
    const { speaker, reader } = setup();
    reader.start(doc, at(1, 0));
    assert.equal(reader.state.hasNextSection, true);
    reader.nextSection();
    assert.equal(speaker.cancels, 1);
    assert.deepEqual(speaker.spoken, ["One a", "Second"]);
    assert.deepEqual(reader.state.at, at(2, 0));
    assert.equal(reader.state.status, "playing");
  });

  test("nextSection while paused moves the highlight and speaks only on resume", () => {
    const { speaker, reader } = setup();
    reader.start(doc, at(1, 0));
    reader.pause();
    reader.nextSection();
    assert.deepEqual(speaker.spoken, ["One a"]);
    assert.deepEqual(reader.state.at, at(2, 0));
    assert.equal(reader.state.status, "paused");
    reader.resume();
    assert.deepEqual(speaker.spoken, ["One a", "Second"]);
  });

  test("from a heading, nextSection goes to the following heading", () => {
    const { reader } = setup();
    reader.start(doc);
    reader.nextSection();
    assert.deepEqual(reader.state.at, at(2, 0));
  });

  test("hasNextSection is false in the last section, and nextSection then does nothing", () => {
    const { speaker, reader, states } = setup();
    reader.start(doc, at(2, 0));
    assert.equal(reader.state.hasNextSection, false);
    const n = states.length;
    reader.nextSection();
    assert.equal(speaker.cancels, 0);
    assert.deepEqual(speaker.spoken, ["Second"]);
    assert.equal(states.length, n);
  });

  test("a stale end after nextSection or stop is ignored", () => {
    const { speaker, reader } = setup();
    reader.start(doc, at(1, 0));
    reader.nextSection();
    speaker.staleEnd(0);
    assert.deepEqual(speaker.spoken, ["One a", "Second"]);
    assert.deepEqual(reader.state.at, at(2, 0));
    reader.stop();
    speaker.staleEnd(1);
    assert.deepEqual(speaker.spoken, ["One a", "Second"]);
    assert.equal(reader.state.status, "idle");
  });

  test("rapid nextSection lands on the last section clicked", () => {
    const script = [seg("heading", ["H1"]), seg("heading", ["H2"]), seg("paragraph", ["p"]), seg("heading", ["H3"])];
    const { speaker, reader } = setup();
    reader.start(script);
    reader.nextSection();
    reader.nextSection();
    speaker.staleEnd(0);
    speaker.staleEnd(1);
    assert.deepEqual(reader.state.at, at(3, 0));
    assert.deepEqual(speaker.spoken, ["H1", "H2", "H3"]);
    assert.equal(reader.state.hasNextSection, false);
  });

  test("stop cancels, goes idle and notifies", () => {
    const { speaker, reader, states } = setup();
    reader.start(doc);
    reader.stop();
    assert.equal(speaker.cancels, 1);
    assert.deepEqual(states.at(-1), { status: "idle", at: null, hasNextSection: false });
    const n = states.length;
    reader.stop();
    assert.equal(states.length, n);
  });

  test("an error from the current utterance stops the reading and is reported once", () => {
    const { speaker, reader, errors, states } = setup();
    reader.start(doc);
    speaker.fail("synthesis-failed");
    assert.deepEqual(errors, ["synthesis-failed"]);
    assert.equal(reader.state.status, "idle");
    assert.equal(states.at(-1)?.status, "idle");
    speaker.staleFail(0, "again");
    assert.deepEqual(errors, ["synthesis-failed"]);
    assert.deepEqual(speaker.spoken, ["Title"]);
  });

  test("an error from a cancelled utterance is ignored", () => {
    const { speaker, reader, errors } = setup();
    reader.start(doc);
    reader.pause();
    speaker.staleFail(0, "canceled");
    assert.deepEqual(errors, []);
    assert.equal(reader.state.status, "paused");
  });

  test("starting again stops the previous reading", () => {
    const { speaker, reader, finish } = setup();
    reader.start(doc);
    reader.start([seg("paragraph", ["New"])]);
    assert.equal(speaker.cancels, 1);
    speaker.staleEnd(0);
    assert.deepEqual(speaker.spoken, ["Title", "New"]);
    finish();
    assert.deepEqual(speaker.spoken, ["Title", "New"]);
    assert.equal(reader.state.status, "idle");
  });

  test("onchange fires for each state change and not when nothing changed", () => {
    const { speaker, reader, states } = setup();
    reader.start(doc, at(1, 0));
    assert.equal(states.length, 1);
    speaker.end(); // next piece, same sentence: nothing visible changed
    assert.equal(states.length, 1);
    speaker.end(); // next sentence
    assert.equal(states.length, 2);
    assert.deepEqual(states.map((s) => s.at), [at(1, 0), at(1, 1)]);
  });
});
