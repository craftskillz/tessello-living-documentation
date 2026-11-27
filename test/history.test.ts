// Versions: a Document's history read from the repository holding its Project, on the Test Host's disk holding a real `.git`.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { connect, type Files, type Folder, TesselloError } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { clampPeriod, DEFAULT_PERIOD, HistoryFailure, openHistory, suggestsGc } from "../src/lib/history.ts";

const MODULE = { id: "@craftskillz/living-documentation", version: "0.0.1" };
const DAY = 86_400_000;
/** The moment the History is read at in the tests. */
const NOW = Date.parse("2026-11-20T12:00:00Z");
const scratch: string[] = [];
after(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

interface Step {
  /** Author and committer date, ISO. */
  date: string;
  message: string;
  author?: string;
  /** Files written (text) or deleted (null) before committing. */
  files: Record<string, string | null>;
}

/** Runs `git` in `cwd` with a fixed identity and the dates given. */
function git(cwd: string, args: string[], date = "2026-01-01T00:00:00Z", author = "Ada Lovelace") {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: author,
      GIT_AUTHOR_EMAIL: "ada@example.com",
      GIT_COMMITTER_NAME: author,
      GIT_COMMITTER_EMAIL: "ada@example.com",
    },
  }).trim();
}

/** Every file under `dir`, `.git` included, as the Test Host's folder content; paths use `/`. */
function readTree(dir: string, base = ""): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(join(dir, base), { withFileTypes: true })) {
    const path = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, readTree(dir, path));
    else files[path] = new Uint8Array(readFileSync(join(dir, path)));
  }
  return files;
}

/** A repository made with the real `git` from `steps`, oldest first; its files, and the id of each commit. */
function repository(steps: Step[], options: { gc?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "history-"));
  scratch.push(dir);
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  const ids: string[] = [];
  for (const step of steps) {
    for (const [path, text] of Object.entries(step.files)) {
      if (text === null) rmSync(join(dir, path));
      else {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), text);
      }
    }
    git(dir, ["add", "-A"], step.date);
    git(dir, ["commit", "-m", step.message], step.date, step.author);
    ids.push(git(dir, ["rev-parse", "HEAD"]));
  }
  if (options.gc) git(dir, ["gc", "--aggressive", "--prune=now"]);
  return { files: readTree(dir), ids };
}

/** What a Project of the repository `files` sees: the Test Host with the repository `shop`, and the history opened for the Project at `projectPath` ("" for the repository itself). */
async function opened(files: Record<string, Uint8Array>, projectPath = "docs", wrap: (files: Files) => Pick<Files, "list" | "read"> = (each) => each) {
  const host = createTestHost({ module: MODULE, permissions: { folders: true } });
  const shop = host.folders.create("shop", files);
  host.folders.choose(projectPath ? host.folders.inside(shop, projectPath) : shop);
  const module = await connect({ transport: host.mount({ surface: "view" }).transport });
  const project = (await module.folders.request())!;
  host.folders.choose(shop);
  const repo = (await module.folders.request({ mustContain: project }))!;
  const history = await openHistory(wrap(module.files), repo, project);
  return { host, module, project, repo, history };
}

describe("the commits of a Document", () => {
  test("lists, newest first, the commits that changed it in the period, with short id, message, date and author", async () => {
    const { files, ids } = repository([
      { date: "2026-11-01T10:00:00Z", message: "Start the guide\n\nWith a body that is not shown", author: "Ada Lovelace", files: { "docs/a.md": "one\n" } },
      { date: "2026-11-10T10:00:00Z", message: "  Rewrite the guide  ", author: "Grace Hopper", files: { "docs/a.md": "two\n" } },
    ]);
    const { history } = await opened(files);

    const commits = await history.commits("a.md", 30, NOW);

    assert.deepEqual(commits, [
      { id: ids[1], shortId: ids[1]!.slice(0, 7), path: "a.md", message: "Rewrite the guide", date: Date.parse("2026-11-10T10:00:00Z"), author: "Grace Hopper" },
      { id: ids[0], shortId: ids[0]!.slice(0, 7), path: "a.md", message: "Start the guide", date: Date.parse("2026-11-01T10:00:00Z"), author: "Ada Lovelace" },
    ]);
  });

  test("leaves out the commits older than the period, and the period counts back from now", async () => {
    const { files, ids } = repository([
      { date: "2026-09-01T10:00:00Z", message: "Old", files: { "docs/a.md": "old\n" } },
      { date: "2026-11-15T10:00:00Z", message: "Recent", files: { "docs/a.md": "recent\n" } },
    ]);
    const { history } = await opened(files);

    assert.deepEqual((await history.commits("a.md", 30, NOW)).map((commit) => commit.id), [ids[1]]);
    assert.deepEqual((await history.commits("a.md", 90, NOW)).map((commit) => commit.id), [ids[1], ids[0]]);
    assert.deepEqual((await history.commits("a.md", 3, NOW)).map((commit) => commit.id), []);
  });

  test("lists only the commits that changed this Document", async () => {
    const { files, ids } = repository([
      { date: "2026-11-01T10:00:00Z", message: "Both", files: { "docs/a.md": "a1\n", "docs/b.md": "b1\n" } },
      { date: "2026-11-02T10:00:00Z", message: "Only b", files: { "docs/b.md": "b2\n" } },
      { date: "2026-11-03T10:00:00Z", message: "Elsewhere", files: { "other/c.md": "c\n" } },
      { date: "2026-11-04T10:00:00Z", message: "Only a", files: { "docs/a.md": "a2\n" } },
    ]);
    const { history } = await opened(files);

    assert.deepEqual((await history.commits("a.md", 30, NOW)).map((commit) => commit.id), [ids[3], ids[0]]);
    assert.deepEqual((await history.commits("b.md", 30, NOW)).map((commit) => commit.id), [ids[1], ids[0]]);
  });

  test("lists the commit that deleted the Document, and a Document in a subfolder of the Project", async () => {
    const { files, ids } = repository([
      { date: "2026-11-01T10:00:00Z", message: "Add", files: { "docs/guide/a.md": "a\n", "docs/keep.md": "k\n" } },
      { date: "2026-11-02T10:00:00Z", message: "Remove", files: { "docs/guide/a.md": null } },
    ]);
    const { history } = await opened(files);

    assert.deepEqual((await history.commits("guide/a.md", 30, NOW)).map((commit) => commit.id), [ids[1], ids[0]]);
  });

  test("reads packed objects too", async () => {
    const { files, ids } = repository(
      [
        { date: "2026-11-01T10:00:00Z", message: "One", files: { "docs/a.md": "one\n" } },
        { date: "2026-11-02T10:00:00Z", message: "Two", files: { "docs/a.md": "two\n" } },
      ],
      { gc: true },
    );
    assert.ok(Object.keys(files).some((path) => path.endsWith(".pack")));
    const { history } = await opened(files);

    assert.deepEqual((await history.commits("a.md", 30, NOW)).map((commit) => commit.id), [ids[1], ids[0]]);
    assert.equal(await history.fileAt(ids[0]!, "a.md"), "one\n");
  });
});

describe("the history of a renamed Document", () => {
  const lines = (...names: string[]) => names.map((name) => `${name}\n`).join("");
  const text = lines("l1", "l2", "l3", "l4");

  test("continues under the old name when the rename comes with an edit keeping half the lines", async () => {
    const { files, ids } = repository([
      { date: "2026-11-01T10:00:00Z", message: "Add", files: { "docs/old.md": text } },
      { date: "2026-11-02T10:00:00Z", message: "Edit", files: { "docs/old.md": lines("l1", "l2", "l3", "l4", "l5") } },
      { date: "2026-11-03T10:00:00Z", message: "Rename and edit", files: { "docs/old.md": null, "docs/new.md": lines("l1", "l2", "x", "y") } },
    ]);
    const { history } = await opened(files);

    const commits = await history.commits("new.md", 30, NOW);

    assert.deepEqual(commits.map((commit) => [commit.id, commit.path]), [[ids[2], "new.md"], [ids[1], "old.md"], [ids[0], "old.md"]]);
    assert.equal(await history.fileAt(commits[1]!.id, commits[1]!.path), lines("l1", "l2", "l3", "l4", "l5"));
    assert.equal(await history.fileAt(commits[2]!.id, commits[2]!.path), text);
  });

  test("follows a rename with identical content", async () => {
    const { files, ids } = repository([
      { date: "2026-11-01T10:00:00Z", message: "Add", files: { "docs/old.md": text } },
      { date: "2026-11-02T10:00:00Z", message: "Rename", files: { "docs/old.md": null, "docs/new.md": text } },
    ]);
    const { history } = await opened(files);

    assert.deepEqual((await history.commits("new.md", 30, NOW)).map((commit) => [commit.id, commit.path]), [[ids[1], "new.md"], [ids[0], "old.md"]]);
  });

  test("does not follow when less than half the lines are kept", async () => {
    const { files, ids } = repository([
      { date: "2026-11-01T10:00:00Z", message: "Add", files: { "docs/other.md": text } },
      { date: "2026-11-02T10:00:00Z", message: "Swap", files: { "docs/other.md": null, "docs/new.md": lines("l1", "a", "b", "c") } },
    ]);
    const { history } = await opened(files);

    assert.deepEqual((await history.commits("new.md", 30, NOW)).map((commit) => [commit.id, commit.path]), [[ids[1], "new.md"]]);
  });

  test("follows chained renames", async () => {
    const { files, ids } = repository([
      { date: "2026-11-01T10:00:00Z", message: "Add a", files: { "docs/a.md": text } },
      { date: "2026-11-02T10:00:00Z", message: "a to b", files: { "docs/a.md": null, "docs/b.md": text } },
      { date: "2026-11-03T10:00:00Z", message: "Edit b", files: { "docs/b.md": lines("l1", "l2", "l3", "l4", "l5") } },
      { date: "2026-11-04T10:00:00Z", message: "b to c", files: { "docs/b.md": null, "docs/c.md": lines("l1", "l2", "l3", "l4", "l5") } },
    ]);
    const { history } = await opened(files);

    assert.deepEqual(
      (await history.commits("c.md", 30, NOW)).map((commit) => [commit.id, commit.path]),
      [[ids[3], "c.md"], [ids[2], "b.md"], [ids[1], "b.md"], [ids[0], "a.md"]],
    );
  });

  test("follows a rename out of a subfolder of the Project", async () => {
    const { files, ids } = repository([
      { date: "2026-11-01T10:00:00Z", message: "Add", files: { "docs/guide/a.md": text } },
      { date: "2026-11-02T10:00:00Z", message: "Move", files: { "docs/guide/a.md": null, "docs/b.md": text } },
    ]);
    const { history } = await opened(files);

    assert.deepEqual((await history.commits("b.md", 30, NOW)).map((commit) => [commit.id, commit.path]), [[ids[1], "b.md"], [ids[0], "guide/a.md"]]);
  });

  test("does not take a file that is not Markdown or that lies outside the Project", async () => {
    const { files, ids } = repository([
      { date: "2026-11-01T10:00:00Z", message: "Add", files: { "docs/old.txt": text, "other/old.md": text } },
      { date: "2026-11-02T10:00:00Z", message: "Delete and create", files: { "docs/old.txt": null, "other/old.md": null, "docs/new.md": text } },
    ]);
    const { history } = await opened(files);

    assert.deepEqual((await history.commits("new.md", 30, NOW)).map((commit) => [commit.id, commit.path]), [[ids[1], "new.md"]]);
  });

  test("compares by default with the latest commit read at its own path", async () => {
    const { files, ids } = repository([
      { date: "2026-11-01T10:00:00Z", message: "Add", files: { "docs/old.md": text } },
      { date: "2026-11-02T10:00:00Z", message: "Rename", files: { "docs/old.md": null, "docs/new.md": text } },
    ]);
    const { history } = await opened(files);
    const commits = await history.commits("new.md", 30, NOW);

    assert.equal((await history.defaultCommit("new.md", text, commits))?.id, ids[0]);
    assert.equal((await history.defaultCommit("new.md", "edited\n", commits))?.id, ids[1]);
  });
});

describe("the Document at a commit", () => {
  test("is its text there, or null when it has no file at this path", async () => {
    const { files, ids } = repository([
      { date: "2026-11-01T10:00:00Z", message: "One", files: { "docs/a.md": "one \u00e9\n" } },
      { date: "2026-11-02T10:00:00Z", message: "Two", files: { "docs/a.md": "two\n", "docs/b.md": "b\n" } },
    ]);
    const { history } = await opened(files);

    assert.equal(await history.fileAt(ids[0]!, "a.md"), "one \u00e9\n");
    assert.equal(await history.fileAt(ids[1]!, "a.md"), "two\n");
    assert.equal(await history.fileAt(ids[0]!, "b.md"), null);
    assert.equal(await history.fileAt(ids[1]!, "missing/c.md"), null);
  });
});

describe("the commit compared by default", () => {
  const two = () =>
    repository([
      { date: "2026-11-01T10:00:00Z", message: "One", files: { "docs/a.md": "one\n" } },
      { date: "2026-11-02T10:00:00Z", message: "Two", files: { "docs/a.md": "two\n" } },
    ]);

  test("is the latest commit that changed the Document", async () => {
    const { files, ids } = two();
    const { history } = await opened(files);
    const commits = await history.commits("a.md", 30, NOW);

    assert.equal((await history.defaultCommit("a.md", "edited on disk\n", commits))?.id, ids[1]);
  });

  test("is the one before when the file on disk is identical to the latest", async () => {
    const { files, ids } = two();
    const { history } = await opened(files);
    const commits = await history.commits("a.md", 30, NOW);

    assert.equal((await history.defaultCommit("a.md", "two\n", commits))?.id, ids[0]);
  });

  test("is the latest when there is none before it", async () => {
    const { files, ids } = two();
    const { history } = await opened(files);
    const commits = await history.commits("a.md", 30, NOW);

    assert.equal((await history.defaultCommit("a.md", "two\n", commits.slice(0, 1)))?.id, ids[1]);
  });

  test("is none when no commit changed the Document", async () => {
    const { files } = two();
    const { history } = await opened(files);

    assert.equal(await history.defaultCommit("a.md", "two\n", []), null);
  });
});

describe("the period", () => {
  test("is brought into 1 to 3650 whole days, 30 when it is not a number", () => {
    assert.equal(clampPeriod(0), 1);
    assert.equal(clampPeriod(-4), 1);
    assert.equal(clampPeriod(5000), 3650);
    assert.equal(clampPeriod(Number.NaN), 180);
    assert.equal(clampPeriod(2.6), 3);
    assert.equal(clampPeriod(45), 45);
    assert.equal(DEFAULT_PERIOD, 180);
  });
});

describe("where the Project lies in the repository", () => {
  test("is found in a nested folder", async () => {
    const { files, ids } = repository([{ date: "2026-11-01T10:00:00Z", message: "Add", files: { "site/docs/a.md": "a\n", "readme.md": "r\n" } }]);
    const { history } = await opened(files, "site/docs");

    assert.deepEqual((await history.commits("a.md", 30, NOW)).map((commit) => commit.id), [ids[0]]);
    assert.equal(await history.fileAt(ids[0]!, "a.md"), "a\n");
  });

  test("is the repository itself when the Project folder is the granted one", async () => {
    const { files, ids } = repository([{ date: "2026-11-01T10:00:00Z", message: "Add", files: { "a.md": "a\n" } }]);
    const { history } = await opened(files, "");

    assert.deepEqual((await history.commits("a.md", 30, NOW)).map((commit) => commit.id), [ids[0]]);
  });

  test("is told apart from another folder of the same name by the files it holds", async () => {
    const { files, ids } = repository([
      { date: "2026-11-01T10:00:00Z", message: "Both", files: { "site/docs/a.md": "site\n", "blog/docs/a.md": "blog\n", "blog/docs/b.md": "b\n" } },
      { date: "2026-11-02T10:00:00Z", message: "Blog only", files: { "blog/docs/a.md": "blog 2\n" } },
    ]);

    const site = await opened(files, "site/docs");
    const blog = await opened(files, "blog/docs");

    assert.deepEqual((await site.history.commits("a.md", 30, NOW)).map((commit) => commit.id), [ids[0]]);
    assert.equal(await site.history.fileAt(ids[0]!, "a.md"), "site\n");
    assert.deepEqual((await blog.history.commits("a.md", 30, NOW)).map((commit) => commit.id), [ids[1], ids[0]]);
    assert.equal(await blog.history.fileAt(ids[0]!, "a.md"), "blog\n");
  });

  test("is not tracked when the repository holds no such folder: no commits, no file, and no failure", async () => {
    const { files, ids } = repository([{ date: "2026-11-01T10:00:00Z", message: "Add", files: { "docs/a.md": "a\n" } }]);
    // The Project folder exists on the disk but nothing of it was ever added to git.
    const withUntracked = { ...files, "notes/new.md": new TextEncoder().encode("n\n") };
    const { history } = await opened(withUntracked, "notes");

    assert.deepEqual(await history.commits("new.md", 30, NOW), []);
    assert.equal(await history.fileAt(ids[0]!, "new.md"), null);
  });
});

describe("a repository that cannot be read", () => {
  test("without a .git in the granted folder is not a repository", async () => {
    const { host, project, module } = await opened(repository([{ date: "2026-11-01T10:00:00Z", message: "Add", files: { "docs/a.md": "a\n" } }]).files);
    const bare = host.folders.create("bare", { "docs/a.md": new TextEncoder().encode("a\n") });
    host.folders.choose(bare);
    const folder = (await module.folders.request())!;

    await assert.rejects(
      openHistory(module.files, folder, project),
      (error) => error instanceof HistoryFailure && error.reason === "notRepository",
    );
  });

  test("when the Host says it is unavailable, fails as unavailable and tries again the next time", async () => {
    const { files, ids } = repository([{ date: "2026-11-01T10:00:00Z", message: "Add", files: { "docs/a.md": "a\n" } }]);
    let unavailable = false;
    const { history } = await opened(files, "docs", (real) => ({
      list: (...args) => real.list(...args),
      read: (async (folder: Folder, path: string, options?: { as?: "text" | "bytes" }) => {
        if (unavailable) throw new TesselloError("unavailable", "Allow the folder again");
        return real.read(folder, path, options as { as: "bytes" });
      }) as Files["read"],
    }));
    unavailable = true;

    await assert.rejects(history.commits("a.md", 30, NOW), (error) => error instanceof HistoryFailure && error.reason === "unavailable");

    unavailable = false;
    assert.deepEqual((await history.commits("a.md", 30, NOW)).map((commit) => commit.id), [ids[0]]);
  });

  test("a commit that does not exist fails", async () => {
    const { files } = repository([{ date: "2026-11-01T10:00:00Z", message: "Add", files: { "docs/a.md": "a\n" } }]);
    const { history } = await opened(files);

    await assert.rejects(history.fileAt("0".repeat(40), "a.md"), (error) => error instanceof HistoryFailure && error.reason === "failed");
  });
});

describe("the requests to the Host", () => {
  /** `files` counting what is asked: each call of list or read, by its arguments. */
  const counting = () => {
    const calls: string[] = [];
    const wrap = (real: Files): Pick<Files, "list" | "read"> => ({
      list: (folder, path) => (calls.push(`list ${folder.name} ${path ?? ""}`), real.list(folder, path)),
      read: ((folder: Folder, path: string, options?: { as?: "text" | "bytes" }) => (calls.push(`read ${folder.name} ${path}`), real.read(folder, path, options as { as: "bytes" }))) as Files["read"],
    });
    return { calls, wrap };
  };

  test("lists .git once and asks for each file at most once, across calls", async () => {
    const { files, ids } = repository(
      [
        { date: "2026-11-01T10:00:00Z", message: "One", files: { "site/docs/a.md": "one\n", "blog/docs/a.md": "x\n" } },
        { date: "2026-11-02T10:00:00Z", message: "Two", files: { "site/docs/a.md": "two\n" } },
      ],
    );
    const { calls, wrap } = counting();
    const { history } = await opened(files, "site/docs", wrap);

    await history.commits("a.md", 30, NOW);
    await history.commits("a.md", 30, NOW);
    await history.fileAt(ids[0]!, "a.md");
    await history.fileAt(ids[1]!, "a.md");
    await history.commits("a.md", 7, NOW);

    const repositoryCalls = calls.filter((call) => call.includes(" shop "));
    assert.equal(repositoryCalls.filter((call) => call === "list shop .git").length, 1);
    assert.deepEqual(repositoryCalls.filter((call) => call.startsWith("read")), [...new Set(repositoryCalls.filter((call) => call.startsWith("read")))]);
    assert.ok(repositoryCalls.some((call) => call.startsWith("read")));
    assert.ok(repositoryCalls.filter((call) => call.startsWith("read")).every((call) => call.startsWith("read shop .git/")));
  });

  test("never asks the Host for a path the listing of .git does not hold", async () => {
    const { files, ids } = repository([{ date: "2026-11-01T10:00:00Z", message: "One", files: { "docs/a.md": "one\n" } }]);
    const listed = new Set(Object.keys(files).filter((path) => path.startsWith(".git/")));
    const { calls, wrap } = counting();
    const { history } = await opened(files, "docs", wrap);

    await history.commits("a.md", 30, NOW);
    await history.fileAt(ids[0]!, "nothing.md");

    for (const call of calls.filter((each) => each.startsWith("read shop "))) assert.ok(listed.has(call.slice("read shop ".length)), call);
  });

  test("never writes, moves or deletes anything", async () => {
    const { files, ids } = repository([{ date: "2026-11-01T10:00:00Z", message: "One", files: { "docs/a.md": "one\n" } }], { gc: true });
    const forbidden: string[] = [];
    const { history } = await opened(files, "docs", (real) =>
      new Proxy(real, {
        get(target, name, receiver) {
          if (name === "write" || name === "move" || name === "delete") forbidden.push(String(name));
          return Reflect.get(target, name, receiver);
        },
      }),
    );

    const commits = await history.commits("a.md", 30, NOW);
    await history.fileAt(ids[0]!, "a.md");
    await history.defaultCommit("a.md", "one\n", commits);

    assert.deepEqual(forbidden, []);
  });
});

describe("the git gc hint", () => {
  test("counts the loose objects of the repository: one per object before git gc, none after", async () => {
    const steps: Step[] = [
      { date: "2026-11-01T10:00:00Z", message: "One", files: { "docs/a.md": "one\n" } },
      { date: "2026-11-02T10:00:00Z", message: "Two", files: { "docs/a.md": "two\n" } },
    ];
    // Two commits of one file in one folder: per commit a commit, a root tree, a docs tree and a blob.
    assert.equal((await opened(repository(steps).files)).history.looseObjects, 8);
    assert.equal((await opened(repository(steps, { gc: true }).files)).history.looseObjects, 0);
  });

  test("suggests git gc only when reading took more than 3 seconds and the repository has more than 1000 loose objects", () => {
    assert.equal(suggestsGc({ looseObjects: 6533, elapsed: 3001 }), true);
    assert.equal(suggestsGc({ looseObjects: 6533, elapsed: 3000 }), false);
    assert.equal(suggestsGc({ looseObjects: 1000, elapsed: 9000 }), false);
    assert.equal(suggestsGc({ looseObjects: 1001, elapsed: 9000 }), true);
    assert.equal(suggestsGc({ looseObjects: 0, elapsed: 60_000 }), false);
  });
});
