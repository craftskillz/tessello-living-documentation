// Link and image resolution: where a Document's links and images point, from the Document's own path.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { headingId, resolveImage, resolveLink } from "../src/lib/links.ts";

describe("?doc= links", () => {
  test("open the Document named by the id, with its anchor", () => {
    assert.deepEqual(resolveLink("a/b.md", "http://localhost:4321/?doc=guide%2Fintro#setup"), {
      kind: "document",
      path: "guide/intro.md",
      anchor: "setup",
    });
    assert.deepEqual(resolveLink("a/b.md", "/?doc=x"), { kind: "document", path: "x.md", anchor: null });
    assert.deepEqual(resolveLink("a/b.md", "page?x=1&doc=y"), { kind: "document", path: "y.md", anchor: null });
  });
});

describe("relative .md links", () => {
  test("resolve against the linking Document's folder", () => {
    assert.deepEqual(resolveLink("guide/intro.md", "x.md"), { kind: "document", path: "guide/x.md", anchor: null });
    assert.deepEqual(resolveLink("guide/intro.md", "./x.md"), { kind: "document", path: "guide/x.md", anchor: null });
    assert.deepEqual(resolveLink("guide/intro.md", "../g/x.md"), { kind: "document", path: "g/x.md", anchor: null });
    assert.deepEqual(resolveLink("intro.md", "x.md"), { kind: "document", path: "x.md", anchor: null });
  });

  test("a leading slash means the Project root", () => {
    assert.deepEqual(resolveLink("guide/intro.md", "/ADRS/x.md"), { kind: "document", path: "ADRS/x.md", anchor: null });
  });

  test("a .. climbing above the root is unresolvable", () => {
    assert.deepEqual(resolveLink("intro.md", "../x.md"), { kind: "none" });
    assert.deepEqual(resolveLink("a/intro.md", "../../x.md"), { kind: "none" });
  });

  test("percent-encoded segments are decoded, the extension is case-insensitive, the anchor is kept", () => {
    assert.deepEqual(resolveLink("a.md", "My%20Notes.md"), { kind: "document", path: "My Notes.md", anchor: null });
    assert.deepEqual(resolveLink("a.md", "X.MD#part-2"), { kind: "document", path: "X.MD", anchor: "part-2" });
    assert.deepEqual(resolveLink("a.md", "x.md#"), { kind: "document", path: "x.md", anchor: null });
  });
});

describe("other links", () => {
  test("a #fragment alone stays in the same Document", () => {
    assert.deepEqual(resolveLink("a.md", "#setup"), { kind: "anchor", anchor: "setup" });
    assert.deepEqual(resolveLink("a.md", "#user-content-fn-1"), { kind: "anchor", anchor: "user-content-fn-1" });
    assert.deepEqual(resolveLink("a.md", "#"), { kind: "none" });
  });

  test("http, https and mailto are external, as written", () => {
    assert.deepEqual(resolveLink("a.md", "https://example.com/a?b=1#c"), { kind: "external", url: "https://example.com/a?b=1#c" });
    assert.deepEqual(resolveLink("a.md", "HTTP://example.com"), { kind: "external", url: "HTTP://example.com" });
    assert.deepEqual(resolveLink("a.md", "mailto:me@example.com"), { kind: "external", url: "mailto:me@example.com" });
  });

  test("a link to another file of the Project is a file", () => {
    assert.deepEqual(resolveLink("guide/a.md", "../files/My%20Spec.pdf"), { kind: "file", path: "files/My Spec.pdf" });
    assert.deepEqual(resolveLink("guide/a.md", "/data/x.csv#row"), { kind: "file", path: "data/x.csv" });
    assert.deepEqual(resolveLink("a.md", "../x.pdf"), { kind: "none" });
  });

  test("other schemes, empty links and a link to the Project folder itself are none", () => {
    assert.deepEqual(resolveLink("a.md", "javascript:alert(1)"), { kind: "none" });
    assert.deepEqual(resolveLink("a.md", " JavaScript:alert(1)"), { kind: "none" });
    assert.deepEqual(resolveLink("a.md", "ftp://example.com/x"), { kind: "none" });
    assert.deepEqual(resolveLink("a.md", "data:text/html,x"), { kind: "none" });
    assert.deepEqual(resolveLink("a.md", ""), { kind: "none" });
    assert.deepEqual(resolveLink("a.md", "/"), { kind: "none" });
  });
});

describe("images", () => {
  test("a leading slash is the Project root, else the Document's folder", () => {
    assert.deepEqual(resolveImage("guide/a.md", "/images/x.png"), { kind: "project", path: "images/x.png" });
    assert.deepEqual(resolveImage("guide/a.md", "pics/My%20Photo.png"), { kind: "project", path: "guide/pics/My Photo.png" });
    assert.deepEqual(resolveImage("guide/a.md", "../img/x.png"), { kind: "project", path: "img/x.png" });
  });

  test("http, https and data: images are external", () => {
    assert.deepEqual(resolveImage("a.md", "https://example.com/x.png"), { kind: "external", url: "https://example.com/x.png" });
    assert.deepEqual(resolveImage("a.md", "data:image/png;base64,AAAA"), { kind: "external", url: "data:image/png;base64,AAAA" });
  });

  test("climbing above the root, other schemes and empty sources are none", () => {
    assert.deepEqual(resolveImage("a.md", "../x.png"), { kind: "none" });
    assert.deepEqual(resolveImage("a.md", "javascript:x"), { kind: "none" });
    assert.deepEqual(resolveImage("a.md", "file:///etc/passwd"), { kind: "none" });
    assert.deepEqual(resolveImage("a.md", ""), { kind: "none" });
  });
});

describe("heading ids", () => {
  test("lowercase, punctuation and accents dropped, spaces to hyphens", () => {
    assert.equal(headingId("Getting Started"), "getting-started");
    assert.equal(headingId("What's new? (v2)"), "whats-new-v2");
    assert.equal(headingId("Été  2026"), "t-2026");
    assert.equal(headingId("  A - B  "), "a---b");
  });
});
