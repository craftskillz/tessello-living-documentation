// Search: instant title matches, full-text matches with excerpts from the body, and the Tree restricted to the matches.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { parseDocument } from "../src/lib/document.ts";
import { openProject, type TreeEntry } from "../src/lib/project.ts";
import { createLiveSearch, FULL_TEXT_DELAY_MS, filterTree, matchDocument, searchProject, titleMatches, titleResults, type SearchResult } from "../src/lib/search.ts";

async function projectOf(files: Record<string, string>) {
  const host = createTestHost({ module: { id: "@craftskillz/living-documentation", version: "0.0.1" }, permissions: { folders: true } });
  const disk = host.folders.create("docs", files);
  host.folders.choose(disk);
  const module = await connect({ transport: host.mount({ surface: "view" }).transport });
  const folder = (await module.folders.request())!;
  return { host, disk, project: openProject(module, folder) };
}

const match = (text: string, query: string) => matchDocument(parseDocument(text, "doc.md"), query);

describe("title search", () => {
  test("a title matches ignoring case and accents", () => {
    assert.equal(titleMatches("Élève", "eleve"), true);
    assert.equal(titleMatches("Guide", "GUI"), true);
    assert.equal(titleMatches("Guide", "elève"), false);
  });

  test("the query is trimmed and an empty query matches nothing", () => {
    assert.equal(titleMatches("Guide", "  gui "), true);
    assert.equal(titleMatches("Guide", "   "), false);
    assert.equal(titleMatches("Guide", ""), false);
  });

  test("titleResults finds Documents at any depth in Tree order, never manifests or files", () => {
    const tree: TreeEntry[] = [
      { kind: "manifest", name: "liv-doc-main.md", path: "liv-doc-main.md" },
      { kind: "document", name: "a.md", path: "a.md", hidden: false, title: "Zèbre", date: { kind: "modified", at: 0 } },
      { kind: "folder", name: "f", path: "f", hidden: false, children: [
        { kind: "file", name: "zebra.png", path: "f/zebra.png" },
        { kind: "document", name: "b.md", path: "f/b.md", hidden: false, title: "Autre", date: { kind: "modified", at: 0 } },
        { kind: "document", name: "c.md", path: "f/c.md", hidden: false, title: "ZEBRA two", date: { kind: "modified", at: 0 } },
      ] },
    ];
    assert.deepEqual(titleResults(tree, "zebr"), [{ path: "a.md", excerpt: "" }, { path: "f/c.md", excerpt: "" }]);
  });
});

describe("full-text match", () => {
  test("matches title, Tags (list and comma string), description, Type and body", () => {
    assert.ok(match("# Élève\n", "eleve"));
    assert.ok(match("---\ntags: [alpha, Béta]\n---\n# T\n", "beta"));
    assert.ok(match("---\ntags: red, green\n---\n# T\n", "GREEN"));
    assert.ok(match("---\ndescription: About cats\n---\n# T\n", "cats"));
    assert.ok(match("---\ntype: runbook\n---\n# T\n", "runbo"));
    assert.ok(match("# T\n\nSome body text\n", "body"));
    assert.equal(match("# T\n\nSome body\n", "absent"), null);
  });

  test("an empty query matches nothing", () => {
    assert.equal(match("# T\n\nbody\n", "  "), null);
  });

  test("field names and other raw frontmatter never match", () => {
    const text = "---\nowner: alice\ntitle: T\n---\nBody\n";
    assert.equal(match(text, "owner"), null);
    assert.equal(match(text, "alice"), null);
    assert.equal(match(text, "title"), null);
    assert.equal(match(text, "---"), null);
  });

  test("invalid YAML still matches by its display fields, not its raw text", () => {
    const text = "---\ndescription: findable\nbroken: [unclosed\n---\nBody\n";
    assert.ok(match(text, "findable"));
    assert.equal(match(text, "unclosed"), null);
  });

  test("a match outside the body has an empty excerpt", () => {
    assert.deepEqual(match("---\ndescription: About cats\n---\nBody\n", "cats"), { excerpt: "" });
  });

  test("the excerpt never shows frontmatter even when the description also matches", () => {
    const result = match("---\ndescription: cats\nowner: alice\n---\nAll about cats here\n", "cats");
    assert.deepEqual(result, { excerpt: "All about cats here" });
  });
});

describe("excerpt", () => {
  const filler = (n: number, ch: string) => ch.repeat(n);

  test("shows 60 characters before and 90 after the match, with an ellipsis on each cut side", () => {
    const body = `${filler(100, "a")}NEEDLE${filler(200, "b")}`;
    assert.deepEqual(match(`# T\n\n${body}`, "needle"), { excerpt: `…${filler(60, "a")}NEEDLE${filler(90, "b")}…` });
  });

  test("has no ellipsis on a side that reaches the text's end, and newline runs become one space", () => {
    assert.deepEqual(match("line one\n\n\nneedle\nline three", "needle"), { excerpt: "line one needle line three" });
  });

  test("keeps the right window when accents precede the match", () => {
    const body = `${"é".repeat(70)}needle${"x".repeat(5)}`;
    assert.deepEqual(match(body, "NEEDLE"), { excerpt: `…${"é".repeat(60)}needlexxxxx` });
  });

  test("keeps the right window when characters change length on folding", () => {
    const body = `${"ﬁ".repeat(70)}needle end`;
    assert.deepEqual(match(body, "needle"), { excerpt: `…${"ﬁ".repeat(60)}needle end` });
    assert.deepEqual(match(`${"İ".repeat(70)}needle`, "needle"), { excerpt: `…${"İ".repeat(60)}needle` });
  });

  test("matches an accented query against unaccented text and shows the original text", () => {
    assert.deepEqual(match("Le café est chaud", "CAFÉ"), { excerpt: "Le café est chaud" });
    assert.deepEqual(match("Le cafe est chaud", "café"), { excerpt: "Le cafe est chaud" });
  });
});

describe("filterTree", () => {
  test("keeps matching Documents and the Folders leading to them, dropping empty Folders, manifests and files", () => {
    const doc = (path: string): TreeEntry => ({ kind: "document", name: path.split("/").pop()!, path, hidden: false, title: path, date: { kind: "modified", at: 0 } });
    const tree: TreeEntry[] = [
      { kind: "manifest", name: "liv-doc-main.md", path: "liv-doc-main.md" },
      doc("a.md"),
      { kind: "folder", name: "f", path: "f", hidden: false, children: [
        { kind: "manifest", name: "liv-doc-main.md", path: "f/liv-doc-main.md" },
        { kind: "file", name: "x.png", path: "f/x.png" },
        doc("f/b.md"),
        { kind: "folder", name: "g", path: "f/g", hidden: false, children: [doc("f/g/c.md")] },
      ] },
      { kind: "folder", name: "empty", path: "empty", hidden: false, children: [doc("empty/d.md")] },
    ];

    const filtered = filterTree(tree, new Set(["f/g/c.md", "f/b.md", "liv-doc-main.md"]));

    assert.deepEqual(filtered, [
      { kind: "folder", name: "f", path: "f", hidden: false, children: [
        doc("f/b.md"),
        { kind: "folder", name: "g", path: "f/g", hidden: false, children: [doc("f/g/c.md")] },
      ] },
    ]);
  });
});

describe("searchProject", () => {
  test("reads the Documents of the given Tree and returns the matches in Tree order (Folders first)", async () => {
    const { project } = await projectOf({
      "a.md": "# A\n\nthe needle here\n",
      "b.md": "# B\n\nnothing\n",
      "f/c.md": "---\ndescription: Needle in description\n---\n# C\n",
      "f/d.md": "# D\n\nanother NEEDLE\n",
    });

    const results = await searchProject(project, await project.tree(), "needle");

    assert.deepEqual(results, [
      { path: "f/c.md", excerpt: "" },
      { path: "f/d.md", excerpt: "# D another NEEDLE" },
      { path: "a.md", excerpt: "# A the needle here" },
    ]);
  });

  test("an empty query finds nothing", async () => {
    const { project } = await projectOf({ "a.md": "# A\n" });
    assert.deepEqual(await searchProject(project, await project.tree(), " "), []);
  });

  test("a Document removed since the Tree was read is skipped", async () => {
    const { host, disk, project } = await projectOf({ "a.md": "needle\n", "b.md": "needle\n" });
    const tree = await project.tree();
    host.folders.remove(disk, "a.md");

    assert.deepEqual(await searchProject(project, tree, "needle"), [{ path: "b.md", excerpt: "needle" }]);
  });

  test("any other failing read rejects the whole search", async () => {
    const failing = { read: async () => { throw new Error("disk on fire"); } };
    const tree: TreeEntry[] = [{ kind: "document", name: "a.md", path: "a.md", hidden: false, title: "A", date: { kind: "modified", at: 0 } }];
    await assert.rejects(searchProject(failing, tree, "x"), /disk on fire/);
  });
});

/** A manual clock and a full-text search the test answers by hand. */
function liveSearch() {
  const timers = new Map<number, { at: number; run: () => void }>();
  let now = 0;
  let next = 0;
  const shown: (SearchResult[] | null)[] = [];
  const failures: unknown[] = [];
  const asked: { query: string; answer: (results: SearchResult[]) => void; fail: (error: unknown) => void }[] = [];
  const live = createLiveSearch({
    titles: (query) => [{ path: `title:${query}`, excerpt: "" }],
    fullText: (query) => new Promise((answer, fail) => asked.push({ query, answer, fail })),
    onresults: (results) => shown.push(results),
    onfailure: (error) => failures.push(error),
    timer: {
      set: (run, ms) => (timers.set(++next, { at: now + ms, run }), next),
      clear: (handle) => void timers.delete(handle as number),
    },
  });
  const advance = (ms: number) => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) (timers.delete(id), timer.run());
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return { live, shown, failures, asked, advance, settle };
}

describe("live search", () => {
  test("title results come at once, full-text results after the pause", async () => {
    const { live, shown, asked, advance, settle } = liveSearch();
    live.search("gui");
    assert.deepEqual(shown, [[{ path: "title:gui", excerpt: "" }]]);
    advance(FULL_TEXT_DELAY_MS - 1);
    assert.equal(asked.length, 0);
    advance(1);
    assert.deepEqual(asked.map((each) => each.query), ["gui"]);
    asked[0]!.answer([{ path: "a.md", excerpt: "x" }]);
    await settle();
    assert.deepEqual(shown.at(-1), [{ path: "a.md", excerpt: "x" }]);
  });

  test("refresh (the Tree changed) searches the current query again at once, ignoring the older answer", async () => {
    const { live, shown, asked, advance, settle } = liveSearch();
    live.search("gui");
    advance(FULL_TEXT_DELAY_MS);
    live.refresh();
    assert.deepEqual(asked.map((each) => each.query), ["gui", "gui"]);
    asked[0]!.answer([{ path: "old.md", excerpt: "" }]);
    asked[1]!.answer([{ path: "new.md", excerpt: "" }]);
    await settle();
    assert.equal(shown.some((results) => results?.[0]?.path === "old.md"), false);
    assert.deepEqual(shown.at(-1), [{ path: "new.md", excerpt: "" }]);
  });

  test("refresh without a query does nothing", () => {
    const { live, shown, asked } = liveSearch();
    live.refresh();
    live.search("g");
    live.search("");
    live.refresh();
    assert.equal(asked.length, 0);
    assert.deepEqual(shown, [[{ path: "title:g", excerpt: "" }], null]);
  });

  test("typing again restarts the pause and ignores the older answer", async () => {
    const { live, shown, asked, advance, settle } = liveSearch();
    live.search("g");
    advance(FULL_TEXT_DELAY_MS);
    live.search("gu");
    asked[0]!.answer([{ path: "old.md", excerpt: "" }]);
    await settle();
    assert.equal(shown.some((results) => results?.[0]?.path === "old.md"), false);
    advance(FULL_TEXT_DELAY_MS - 1);
    assert.equal(asked.length, 1);
    advance(1);
    assert.equal(asked.length, 2);
  });

  test("a blank query gives null, cancels the pending search and ignores a late answer", async () => {
    const { live, shown, asked, advance, settle } = liveSearch();
    live.search("g");
    live.search("  ");
    assert.equal(shown.at(-1), null);
    advance(FULL_TEXT_DELAY_MS);
    assert.equal(asked.length, 0);
    live.search("h");
    advance(FULL_TEXT_DELAY_MS);
    live.search("");
    asked[0]!.answer([{ path: "late.md", excerpt: "" }]);
    await settle();
    assert.equal(shown.at(-1), null);
  });

  test("a failure of the current full-text search is reported; an older failure is not", async () => {
    const { live, failures, shown, asked, advance, settle } = liveSearch();
    live.search("a");
    advance(FULL_TEXT_DELAY_MS);
    live.search("ab");
    asked[0]!.fail(new Error("old"));
    await settle();
    assert.equal(failures.length, 0);
    advance(FULL_TEXT_DELAY_MS);
    asked[1]!.fail(new Error("boom"));
    await settle();
    assert.equal((failures[0] as Error).message, "boom");
    assert.deepEqual(shown.at(-1), [{ path: "title:ab", excerpt: "" }]);
  });

  test("dispose stops everything", async () => {
    const { live, shown, asked, advance, settle } = liveSearch();
    live.search("a");
    advance(FULL_TEXT_DELAY_MS);
    live.dispose();
    asked[0]!.answer([{ path: "x.md", excerpt: "" }]);
    await settle();
    assert.equal(shown.length, 1);
    live.search("b");
    assert.equal(shown.length, 1);
  });
});
