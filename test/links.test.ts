// Link and image resolution: where a Document's links and images point, from the Document's own path.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { entryMapper, headingId, resolveImage, resolveLink, rewriteLinks, unlinkDeletedLinks } from "../src/lib/links.ts";

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

describe("entry mapper", () => {
  test("maps a file, or a Folder and everything below it, and nothing else", () => {
    const file = entryMapper("a/x.md", "a/y.md", false);
    assert.equal(file("a/x.md"), "a/y.md");
    assert.equal(file("a/x.mdx"), null);
    assert.equal(file("a/x.md/z"), null);
    const folder = entryMapper("a", "b/c", true);
    assert.equal(folder("a"), "b/c");
    assert.equal(folder("a/x.md"), "b/c/x.md");
    assert.equal(folder("ab/x.md"), null);
  });
});

describe("rewriting links after a rename or move", () => {
  const encoded = (id: string) => encodeURIComponent(encodeURIComponent(id));

  test("links, images, reference definitions and ?doc= links to a renamed Document follow, fragments and queries kept", () => {
    const map = entryMapper("guide/x.md", "guide/renamed.md", false);
    const text = [
      "[rel](./guide/x.md#top)",
      "[bare](guide/x.md)",
      "[abs](/guide/x.md?v=1)",
      `[doc](?doc=${encoded("guide/x")}#h)`,
      "[ref]: ./guide/x.md",
      "![img](./guide/x.md)",
      "[other](./guide/y.md)",
    ].join("\n");
    assert.equal(
      rewriteLinks(text, "home.md", map),
      [
        "[rel](./guide/renamed.md#top)",
        "[bare](guide/renamed.md)",
        "[abs](/guide/renamed.md?v=1)",
        `[doc](?doc=guide%252Frenamed#h)`,
        "[ref]: ./guide/renamed.md",
        "![img](./guide/renamed.md)",
        "[other](./guide/y.md)",
      ].join("\n"),
    );
  });

  test("external links, mailto, //host and a lone #anchor are never touched", () => {
    const map = entryMapper("guide/x.md", "guide/z.md", false);
    const text = "[a](https://e.org/guide/x.md) [b](mailto:x@e.org) [c](//e.org/guide/x.md) [d](#guide/x.md)";
    assert.equal(rewriteLinks(text, "home.md", map), text);
  });

  test("links inside fenced code (``` or ~~~) are untouched", () => {
    const map = entryMapper("x.md", "y.md", false);
    const text = ["[a](x.md)", "```", "[b](x.md)", "```", "~~~", "[c](x.md)", "~~~", "[d](x.md)"].join("\n");
    assert.equal(
      rewriteLinks(text, "home.md", map),
      ["[a](y.md)", "```", "[b](x.md)", "```", "~~~", "[c](x.md)", "~~~", "[d](y.md)"].join("\n"),
    );
  });

  test("a renamed Folder keeps the shape of links through ..", () => {
    const map = entryMapper("guide", "manual", true);
    assert.equal(rewriteLinks("[a](../guide/x.md) [b](./x.md)", "guide/y.md", map), "[a](../manual/x.md) [b](./x.md)");
    assert.equal(rewriteLinks("[f](notes/../guide/)", "home.md", map), "[f](notes/../manual/)");
  });

  test("a moved Document: incoming links follow and its own relative links, images included, are adjusted", () => {
    const map = entryMapper("guide/x.md", "notes/deep/x.md", false);
    assert.equal(rewriteLinks("[x](./guide/x.md)", "home.md", map), "[x](./notes/deep/x.md)");
    assert.equal(rewriteLinks("[x](x.md)", "guide/z.md", map), "[x](../notes/deep/x.md)");
    assert.equal(
      rewriteLinks("[h](../home.md) [s](./z.md#a) ![i](../images/p.png) [w](https://w.org) [t](#top)", "guide/x.md", map),
      "[h](../../home.md) [s](../../guide/z.md#a) ![i](../../images/p.png) [w](https://w.org) [t](#top)",
    );
    assert.equal(rewriteLinks("[h](/home.md)", "guide/x.md", map), "[h](/home.md)");
  });

  test("a Document moved up a level: a/doc.md to b/c/doc.md", () => {
    const map = entryMapper("a/doc.md", "b/c/doc.md", false);
    assert.equal(rewriteLinks("[x](../x.md)", "a/doc.md", map), "[x](../../x.md)");
  });

  test("links between Documents that moved together inside a Folder stay byte-identical", () => {
    const map = entryMapper("guide", "archive/guide", true);
    const text = "[s](./z.md) [p](../guide/z.md)";
    assert.equal(rewriteLinks(text, "guide/x.md", map), text);
    assert.equal(rewriteLinks("[h](../home.md)", "guide/x.md", map), "[h](../../home.md)");
  });

  test("encoded segments stay encoded", () => {
    const map = entryMapper("my guide/x.md", "my guide/new name.md", false);
    assert.equal(rewriteLinks("[x](./my%20guide/x.md)", "home.md", map), "[x](./my%20guide/new%20name.md)");
  });

  test("a link climbing above the Project root is left alone", () => {
    const map = entryMapper("x.md", "y.md", false);
    assert.equal(rewriteLinks("[a](../x.md)", "doc.md", map), "[a](../x.md)");
  });

  test("a text nothing affects is returned byte for byte", () => {
    const text = "plain [a](./x.md) [b](../outside.md) text\r\n\n";
    assert.equal(rewriteLinks(text, "doc.md", entryMapper("y.md", "z.md", false)), text);
    assert.equal(rewriteLinks(text, "doc.md", () => null), text);
  });
});

describe("unlinkDeletedLinks", () => {
  const folderGone = (rel: string) => rel === "guide" || rel.startsWith("guide/");
  const docGone = (rel: string) => rel === "old.md";

  test("a link to a deleted Document becomes its text; other links and images stay", () => {
    const text = "See [the old one](old.md) and [new](new.md), ![pic](old.md) and [site](https://x.org/old.md).\n";
    assert.equal(
      unlinkDeletedLinks(text, "a.md", docGone),
      "See the old one and [new](new.md), ![pic](old.md) and [site](https://x.org/old.md).\n",
    );
  });

  test("targets resolve from the file: relative, absolute, encoded, with an anchor or a title, or as ?doc= ids", () => {
    const text = [
      "[a](../old.md#top)",
      "[b](/old.md)",
      "[c](../%6Fld.md)",
      '[d](../old.md "Title")',
      "[e](/?doc=old)",
      "[f](x.md)",
      "",
    ].join("\n");
    assert.equal(unlinkDeletedLinks(text, "sub/a.md", docGone), ["a", "b", "c", "d", "e", "[f](x.md)", ""].join("\n"));
  });

  test("a link to anything inside a deleted Folder goes too", () => {
    assert.equal(unlinkDeletedLinks("[x](guide/intro.md) [y](guide) [z](guides/a.md)", "a.md", folderGone), "x y [z](guides/a.md)");
  });

  test("reference definitions to a deleted entry are dropped, others kept", () => {
    const text = "Text [a][1].\n\n[1]: old.md\n[2]: new.md\n";
    assert.equal(unlinkDeletedLinks(text, "a.md", docGone), "Text [a][1].\n\n[2]: new.md\n");
  });

  test("fenced code is left untouched and a text without such links is returned as is", () => {
    const text = "```\n[a](old.md)\n[1]: old.md\n```\n[b](new.md)\n";
    assert.equal(unlinkDeletedLinks(text, "a.md", docGone), text);
  });
});
