// What `tessello sync` last did, read from the Module's `syncStatus` key.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NOT_RUNNING_AFTER, commitTime, repositoryPathOf, syncCommand, syncStateOf } from "../src/lib/sync.ts";

const NOW = Date.parse("2026-11-27T14:33:00Z");

describe("whether the synchronisation is running", () => {
  test("is true when the heartbeat is within three intervals", () => {
    const state = syncStateOf({ heartbeat: "2026-11-27T14:32:05Z", projects: {} }, "p", NOW);
    assert.equal(state.running, true);
  });

  test("is false once the heartbeat is older than three intervals", () => {
    const heartbeat = new Date(NOW - NOT_RUNNING_AFTER - 1000).toISOString();
    assert.equal(syncStateOf({ heartbeat, projects: {} }, "p", NOW).running, false);
  });

  test("is false when the heartbeat is missing, malformed or the status is absent", () => {
    assert.equal(syncStateOf(undefined, "p", NOW).running, false);
    assert.equal(syncStateOf("nope", "p", NOW).running, false);
    assert.equal(syncStateOf({ projects: {} }, "p", NOW).running, false);
    assert.equal(syncStateOf({ heartbeat: "yesterday-ish" }, "p", NOW).running, false);
    assert.equal(syncStateOf({ heartbeat: 5 }, "p", NOW).running, false);
  });

  test("is true when the heartbeat is in the future (clock skew)", () => {
    const heartbeat = new Date(NOW + 60_000).toISOString();
    assert.equal(syncStateOf({ heartbeat }, "p", NOW).running, true);
  });
});

const status = (project: unknown) => ({ heartbeat: "2026-11-27T14:32:05Z", projects: { p: project as never } });

describe("a Project's entry", () => {
  test("gives the repository, the last commit and the problem", () => {
    const state = syncStateOf(
      status({
        repository: "/Users/me/code/arolla",
        lastCommit: { at: "2026-11-27T14:31:50Z", id: "a1b2c3d", documents: ["docs/guide.md", "docs/api.md"] },
        problem: { kind: "not-a-repository", message: "Cannot sync.", since: "2026-11-27T14:00:00Z" },
      }),
      "p",
      NOW,
    );
    assert.equal(state.repository, "/Users/me/code/arolla");
    assert.deepEqual(state.lastCommit, { at: Date.parse("2026-11-27T14:31:50Z"), id: "a1b2c3d", documents: ["docs/guide.md", "docs/api.md"] });
    assert.deepEqual(state.problem, { kind: "not-a-repository", message: "Cannot sync.", since: Date.parse("2026-11-27T14:00:00Z") });
  });

  test("is empty for a Project with no entry", () => {
    const state = syncStateOf(status({}), "other", NOW);
    assert.deepEqual([state.repository, state.lastCommit, state.problem], [null, null, null]);
  });

  test("drops what is malformed instead of throwing", () => {
    const state = syncStateOf(
      status({ repository: 3, lastCommit: { at: "never", id: "a1b2c3d", documents: [] }, problem: { kind: "x" } }),
      "p",
      NOW,
    );
    assert.deepEqual([state.repository, state.lastCommit, state.problem], [null, null, null]);
    assert.equal(syncStateOf(status({ lastCommit: { at: "2026-11-27T14:31:50Z" } }), "p", NOW).lastCommit, null);
    assert.equal(syncStateOf(status("junk"), "p", NOW).lastCommit, null);
  });

  test("keeps only the documents that are strings", () => {
    const lastCommit = { at: "2026-11-27T14:31:50Z", id: "a1b2c3d", documents: ["a.md", 4, null, "b.md"] };
    assert.deepEqual(syncStateOf(status({ lastCommit }), "p", NOW).lastCommit?.documents, ["a.md", "b.md"]);
    assert.deepEqual(syncStateOf(status({ lastCommit: { ...lastCommit, documents: "a.md" } }), "p", NOW).lastCommit?.documents, []);
  });

  test("keeps a problem whose date is unreadable, dated from the heartbeat", () => {
    const problem = { kind: "x", message: "m", since: "soon" };
    assert.equal(syncStateOf(status({ problem }), "p", NOW).problem?.since, Date.parse("2026-11-27T14:32:05Z"));
    assert.equal(syncStateOf(status({ problem: { kind: "x", message: "m" } }), "p", NOW).problem?.since, Date.parse("2026-11-27T14:32:05Z"));
  });
});

describe("the repository's path for the command", () => {
  test("is the one sync used", () => {
    assert.equal(repositoryPathOf({ used: "/code/arolla", location: "/elsewhere", path: "docs" }), "/code/arolla");
  });

  test("else the typed location minus the Project's path in the repository", () => {
    assert.equal(repositoryPathOf({ used: null, location: "/code/arolla/docs/guides", path: "docs/guides" }), "/code/arolla");
    assert.equal(repositoryPathOf({ used: null, location: "/code/arolla/docs/guides/", path: "docs/guides/" }), "/code/arolla");
  });

  test("else the location itself when the Project is at the repository's root", () => {
    assert.equal(repositoryPathOf({ used: null, location: "/code/arolla/", path: "" }), "/code/arolla");
  });

  test("is null when the Project's path in the repository is unknown: the location may lie deeper than the root", () => {
    assert.equal(repositoryPathOf({ used: null, location: "/code/arolla/docs" }), null);
  });

  test("is null when nothing tells", () => {
    assert.equal(repositoryPathOf({ used: null }), null);
    assert.equal(repositoryPathOf({ used: null, location: "  " }), null);
  });

  test("is null when the location does not end with the Project's path", () => {
    assert.equal(repositoryPathOf({ used: null, location: "/code/arolla", path: "docs" }), null);
  });
});

describe("the command to start the synchronisation", () => {
  test("leaves a plain path as it is", () => {
    assert.equal(syncCommand("/Users/me/code/arolla"), "npx tessello sync --living-documentation /Users/me/code/arolla");
  });

  test("single-quotes a path with spaces or other shell characters", () => {
    assert.equal(syncCommand("/Users/me/my code"), "npx tessello sync --living-documentation '/Users/me/my code'");
    assert.equal(syncCommand("/a/$HOME"), "npx tessello sync --living-documentation '/a/$HOME'");
  });

  test("escapes a single quote inside the path", () => {
    assert.equal(syncCommand("/Users/o'neil/code"), "npx tessello sync --living-documentation '/Users/o'\\''neil/code'");
  });
});

describe("the commit time as the View shows it", () => {
  const now = new Date(2026, 10, 27, 16, 0).getTime();
  const at = (day: number, hour: number, minute: number) => new Date(2026, 10, day, hour, minute).getTime();

  test("says today for a commit of the reader's day", () => {
    assert.deepEqual(commitTime(at(27, 14, 31), now, "en"), { day: "today", time: "2:31 PM" });
    assert.deepEqual(commitTime(at(27, 14, 31), now, "fr"), { day: "aujourd’hui", time: "14:31" });
  });

  test("says yesterday for the day before, even a few hours ago", () => {
    assert.deepEqual(commitTime(at(26, 23, 50), at(27, 0, 10), "en"), { day: "yesterday", time: "11:50 PM" });
    assert.equal(commitTime(at(26, 9, 0), now, "fr").day, "hier");
  });

  test("shows a medium date for older days", () => {
    assert.deepEqual(commitTime(at(24, 9, 5), now, "en"), { day: "Nov 24, 2026", time: "9:05 AM" });
    assert.equal(commitTime(at(24, 9, 5), now, "fr").day, "24 nov. 2026");
  });
});
