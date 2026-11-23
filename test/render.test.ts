// A Document rendered as HTML: source ranges, heading ids, and links and images that never carry an address.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseDocument } from "../src/lib/document.ts";
import { renderDocument } from "../src/lib/render.ts";

const render = (text: string, path = "guide/intro.md") => renderDocument(parseDocument(text, path), path);

describe("source ranges", () => {
  test("a block carries its range in the full text, frontmatter included", () => {
    // "---\ntitle: T\n---\n" is 17 characters, so "# Hi" is 17-21 and "Some text" is 23-32.
    assert.equal(
      render("---\ntitle: T\n---\n# Hi\n\nSome text\n"),
      '<h1 id="hi" data-src="17-21">Hi</h1>\n<p data-src="23-32">Some text</p>',
    );
  });

  test("nested blocks carry their own range", () => {
    // 0-8 list, "- a" is 0-3, "- b" is 4-7
    assert.equal(
      render("- a\n- b\n"),
      '<ul data-src="0-7">\n<li data-src="0-3">a</li>\n<li data-src="4-7">b</li>\n</ul>',
    );
  });

  test("tables, quotes, code blocks and rules too", () => {
    const html = render("> q\n\n```\ncode\n```\n\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
    assert.match(html, /<blockquote data-src="0-3">/);
    assert.match(html, /<pre data-src="5-17"><code[^>]*>(<span[^>]*>)?code(<\/span>)?\n<\/code><\/pre>/);
    assert.match(html, /<hr data-src="19-22">/);
    assert.match(html, /<table data-src="24-/);
  });

  test("the range slices back the block's Markdown", () => {
    const text = "---\ntags: [a]\n---\nIntro\n\n1. one\n2. two\n";
    const ranges = [...render(text).matchAll(/<(p|ol) data-src="(\d+)-(\d+)"/g)].map((m) => text.slice(Number(m[2]), Number(m[3])));
    assert.deepEqual(ranges, ["Intro", "1. one\n2. two"]);
  });
});

describe("heading ids", () => {
  test("every heading gets the original's id", () => {
    assert.match(render("## What's New?\n"), /<h2 id="whats-new" data-src="0-14">/);
    assert.match(render("### Été *2026*\n"), /<h3 id="t-2026" /);
  });
});

const inline = (markdown: string, path?: string) => render(markdown, path).replace(/^<p data-src="\d+-\d+">/, "").replace(/<\/p>$/, "");

describe("links", () => {
  test("a link to a Document has no href, its path and anchor as data", () => {
    assert.equal(inline("[Go](other.md#part)"), '<a role="link" tabindex="0" data-doc="guide/other.md" data-anchor="part">Go</a>');
    assert.equal(inline("[Go](/ADRS/x.md)"), '<a role="link" tabindex="0" data-doc="ADRS/x.md">Go</a>');
    assert.equal(inline("[Go](/?doc=a%2Fb)"), '<a role="link" tabindex="0" data-doc="a/b.md">Go</a>');
  });

  test("a link within the Document has no href", () => {
    assert.equal(inline("[Up](#top)"), '<a role="link" tabindex="0" data-anchor="top">Up</a>');
  });

  test("footnote references are anchor links", () => {
    const html = render("Text[^1]\n\n[^1]: Note\n");
    assert.match(html, /<a role="link" tabindex="0" data-anchor="ld-fn-1" id="ld-fnref-1"[^>]*>1<\/a>/);
    assert.match(html, /<a role="link" tabindex="0" data-anchor="ld-fnref-1"[^>]*>/);
    assert.doesNotMatch(html, /href/);
  });

  test("an external link keeps its href and opens apart", () => {
    assert.equal(inline("[Web](https://example.com/a)"), '<a href="https://example.com/a" target="_blank" rel="noopener noreferrer">Web</a>');
  });

  test("a link to another file of the Project is a file link", () => {
    assert.equal(inline("[Spec](../files/spec%20v2.pdf)"), '<a role="link" tabindex="0" data-file="files/spec v2.pdf">Spec</a>');
  });

  test("an unresolvable link keeps its text, marked", () => {
    assert.equal(inline("[Out](../../x.md)"), '<span class="link-unresolved">Out</span>');
    assert.equal(inline("[Bad *one*](javascript:alert(1))"), '<span class="link-unresolved">Bad <em>one</em></span>');
  });
});

describe("images", () => {
  test("a Project image has no src, its path as data", () => {
    assert.equal(inline("![a cat](/images/cat.png)"), '<img data-image="images/cat.png" alt="a cat">');
    assert.equal(inline("![x](pics/a.png)"), '<img data-image="guide/pics/a.png" alt="x">');
  });

  test("an external image keeps its src", () => {
    assert.equal(inline("![x](https://example.com/a.png)"), '<img src="https://example.com/a.png" alt="x">');
  });

  test("an unresolvable image becomes its alt text, marked", () => {
    assert.equal(inline("![gone](../../a.png)"), '<span class="image-missing" role="img" aria-label="gone">gone</span>');
  });
});

describe("no address", () => {
  test("no href but external ones, whatever mix of links", () => {
    const html = render(
      [
        "[doc](a.md) [anchor](#x) [file](f.pdf) [none](../../z.md) [js](javascript:1) [q](http://h/?doc=y)",
        "[ext](https://example.com) [mail](mailto:a@b.c) ![p](/i.png) ![e](https://e.com/i.png)",
        "",
        "Note[^1]",
        "",
        "[^1]: [inside](b.md)",
        "",
      ].join("\n"),
    );
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(hrefs, ["https://example.com", "mailto:a@b.c"]);
    assert.doesNotMatch(html, /<img(?![^>]*(data-image|src="https:))/);
    assert.doesNotMatch(html, /<img[^>]*data-image[^>]*src=/);
  });
});
