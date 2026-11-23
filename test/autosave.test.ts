// Autosave: written from the spec (Editing rules 1-3), driven by a manual timer and hand-resolved saves.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createAutosave, type AutosaveOptions, type Timer } from "../src/lib/autosave.ts";

class ManualTimer implements Timer {
  now = 0;
  private next = 0;
  private pending = new Map<number, { at: number; run: () => void }>();
  set(run: () => void, ms: number): unknown {
    const id = this.next++;
    this.pending.set(id, { at: this.now + ms, run });
    return id;
  }
  clear(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const due = [...this.pending.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.pending.delete(due[0]);
      this.now = due[1].at;
      due[1].run();
    }
    this.now = target;
  }
}

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function setup(overrides: Partial<AutosaveOptions> = {}) {
  const timer = new ManualTimer();
  const calls: string[] = [];
  const running: Array<{ text: string; resolve: () => void; reject: (reason: unknown) => void }> = [];
  let overlapped = false;
  const save = (text: string) => {
    if (running.length > 0) overlapped = true;
    calls.push(text);
    return new Promise<void>((resolve, reject) => {
      const entry = {
        text,
        resolve: () => {
          running.splice(running.indexOf(entry), 1);
          resolve();
        },
        reject: (reason: unknown) => {
          running.splice(running.indexOf(entry), 1);
          reject(reason);
        },
      };
      running.push(entry);
    });
  };
  const autosave = createAutosave({ saved: "base", save, timer, ...overrides });
  return { autosave, timer, calls, running, overlapped: () => overlapped };
}

describe("autosave", () => {
  test("saves once the delay has passed since the last keystroke, not before", async () => {
    const { autosave, timer, calls } = setup();
    autosave.typed("a");
    timer.advance(999);
    assert.deepEqual(calls, []);
    autosave.typed("ab");
    timer.advance(999);
    assert.deepEqual(calls, []);
    timer.advance(1);
    assert.deepEqual(calls, ["ab"]);
  });

  test("text equal to the saved text never saves", async () => {
    const { autosave, timer, calls } = setup();
    autosave.typed("base");
    timer.advance(5000);
    autosave.typed("x");
    autosave.typed("base");
    timer.advance(5000);
    assert.deepEqual(calls, []);
    assert.equal(autosave.dirty, false);
  });

  test("text typed during a running save is saved right after it ends, never overlapping", async () => {
    const { autosave, timer, calls, running, overlapped } = setup();
    autosave.typed("one");
    timer.advance(1000);
    assert.equal(autosave.saving, true);
    autosave.typed("two");
    timer.advance(5000);
    assert.deepEqual(calls, ["one"]);
    running[0].resolve();
    await flushMicrotasks();
    assert.deepEqual(calls, ["one", "two"]);
    running[0].resolve();
    await flushMicrotasks();
    assert.equal(autosave.saving, false);
    assert.equal(autosave.dirty, false);
    assert.equal(overlapped(), false);
  });

  test("a failed save calls onerror, keeps the text dirty, and the next typing schedules again", async () => {
    const reasons: unknown[] = [];
    const { autosave, timer, calls, running } = setup({ onerror: (reason) => reasons.push(reason) });
    autosave.typed("one");
    timer.advance(1000);
    running[0].reject("boom");
    await flushMicrotasks();
    assert.deepEqual(reasons, ["boom"]);
    assert.equal(autosave.dirty, true);
    assert.equal(autosave.saving, false);
    timer.advance(5000);
    assert.deepEqual(calls, ["one"]);
    autosave.typed("one!");
    timer.advance(1000);
    assert.deepEqual(calls, ["one", "one!"]);
  });

  test("flush saves the latest text now and resolves true", async () => {
    const { autosave, calls, running } = setup();
    autosave.typed("one");
    const done = autosave.flush();
    assert.deepEqual(calls, ["one"]);
    running[0].resolve();
    assert.equal(await done, true);
    assert.equal(autosave.dirty, false);
  });

  test("flush cancels the wait, so the text is not saved twice", async () => {
    const { autosave, timer, calls, running } = setup();
    autosave.typed("one");
    const done = autosave.flush();
    running[0].resolve();
    await done;
    timer.advance(5000);
    assert.deepEqual(calls, ["one"]);
  });

  test("flush waits for a running save, then saves what was typed meanwhile", async () => {
    const { autosave, timer, calls, running, overlapped } = setup();
    autosave.typed("one");
    timer.advance(1000);
    autosave.typed("two");
    const done = autosave.flush();
    assert.deepEqual(calls, ["one"]);
    running[0].resolve();
    await flushMicrotasks();
    assert.deepEqual(calls, ["one", "two"]);
    running[0].resolve();
    assert.equal(await done, true);
    assert.equal(overlapped(), false);
  });

  test("flush resolves false when the save fails", async () => {
    const { autosave, running } = setup();
    autosave.typed("one");
    const done = autosave.flush();
    running[0].reject(new Error("conflict"));
    assert.equal(await done, false);
    assert.equal(autosave.dirty, true);
  });

  test("flush retries a text whose earlier save failed", async () => {
    const { autosave, timer, calls, running } = setup();
    autosave.typed("one");
    timer.advance(1000);
    running[0].reject("boom");
    await flushMicrotasks();
    const done = autosave.flush();
    assert.deepEqual(calls, ["one", "one"]);
    running[0].resolve();
    assert.equal(await done, true);
  });

  test("flush with nothing typed resolves true without saving", async () => {
    const { autosave, calls } = setup();
    assert.equal(await autosave.flush(), true);
    assert.deepEqual(calls, []);
  });

  test("flush while paused resolves false without saving", async () => {
    const { autosave, calls } = setup();
    autosave.typed("one");
    autosave.pause();
    assert.equal(await autosave.flush(), false);
    assert.deepEqual(calls, []);
  });

  test("pausing from onerror stops the follow-up save of text typed during the failing save", async () => {
    let autosave!: ReturnType<typeof setup>["autosave"];
    const ctx = setup({ onerror: () => autosave.pause() });
    autosave = ctx.autosave;
    autosave.typed("one");
    ctx.timer.advance(1000);
    autosave.typed("two");
    ctx.running[0].reject("conflict");
    await flushMicrotasks();
    ctx.timer.advance(5000);
    assert.deepEqual(ctx.calls, ["one"]);
    assert.equal(autosave.paused, true);
    autosave.typed("three");
    ctx.timer.advance(5000);
    assert.deepEqual(ctx.calls, ["one"]);
  });

  test("resume then flush saves the latest text", async () => {
    const { autosave, calls, running } = setup();
    autosave.typed("one");
    autosave.pause();
    autosave.resume();
    assert.equal(autosave.paused, false);
    const done = autosave.flush();
    assert.deepEqual(calls, ["one"]);
    running[0].resolve();
    assert.equal(await done, true);
  });

  test("reset takes a new saved text: nothing is dirty or pending", async () => {
    const { autosave, timer, calls } = setup();
    autosave.typed("one");
    autosave.reset("disk");
    assert.equal(autosave.dirty, false);
    timer.advance(5000);
    assert.deepEqual(calls, []);
    autosave.typed("disk");
    assert.equal(autosave.dirty, false);
  });

  test("a save finishing after reset does not replace the reset text", async () => {
    const { autosave, calls, running, timer } = setup();
    autosave.typed("one");
    timer.advance(1000);
    autosave.reset("disk");
    running[0].resolve();
    await flushMicrotasks();
    assert.equal(autosave.dirty, false);
    autosave.typed("one");
    assert.equal(autosave.dirty, true);
    assert.deepEqual(calls, ["one"]);
  });

  test("stop waits for the running save and nothing is saved afterwards", async () => {
    const { autosave, timer, calls, running } = setup();
    autosave.typed("one");
    timer.advance(1000);
    autosave.typed("two");
    let stopped = false;
    const done = autosave.stop().then(() => (stopped = true));
    await flushMicrotasks();
    assert.equal(stopped, false);
    running[0].resolve();
    await done;
    timer.advance(5000);
    autosave.typed("three");
    timer.advance(5000);
    assert.equal(await autosave.flush(), false);
    assert.deepEqual(calls, ["one"]);
  });

  test("saving after stop works again once reset", async () => {
    const { autosave, timer, calls } = setup();
    await autosave.stop();
    autosave.reset("base");
    autosave.typed("one");
    timer.advance(1000);
    assert.deepEqual(calls, ["one"]);
  });

  test("onchange fires as saving flips, and as dirty and paused change", async () => {
    const seen: string[] = [];
    let autosave!: ReturnType<typeof setup>["autosave"];
    const ctx = setup({ onchange: () => seen.push(`${autosave.saving}/${autosave.paused}/${autosave.dirty}`) });
    autosave = ctx.autosave;
    autosave.typed("one");
    ctx.timer.advance(1000);
    ctx.running[0].resolve();
    await flushMicrotasks();
    autosave.pause();
    assert.deepEqual(seen, ["false/false/true", "true/false/true", "true/false/false", "false/false/false", "false/true/false"]);
  });

  test("a custom delay is used", async () => {
    const { autosave, timer, calls } = setup({ delay: 200 });
    autosave.typed("one");
    timer.advance(200);
    assert.deepEqual(calls, ["one"]);
  });
});
