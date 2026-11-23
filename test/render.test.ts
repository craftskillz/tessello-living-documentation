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

describe("the frontmatter shown as a YAML block", () => {
  const withFrontmatter = (text: string) => renderDocument(parseDocument(text, "liv-doc-main.md"), "liv-doc-main.md", {}, { frontmatter: true });

  test("it opens the page as a highlighted YAML code block, then the body as usual", () => {
    // "---\norder:\n  - a.md\n---" is 23 characters, so the block is 0-23 and "# Hi" is 24-28.
    const html = withFrontmatter("---\norder:\n  - a.md\n---\n# Hi\n");
    assert.match(html, /^<pre data-src="0-23"><code class="hljs language-yaml">/);
    assert.match(html, /order/);
    assert.match(html, /a\.md/);
    assert.doesNotMatch(html, /---/);
    assert.match(html, /<\/code><\/pre>\n<h1 id="hi" data-src="24-28">Hi<\/h1>$/);
  });

  test("an invalid frontmatter is shown as text all the same", () => {
    // "---\ntags: [unclosed\n---" is 23 characters.
    const html = withFrontmatter("---\ntags: [unclosed\n---\nText\n");
    assert.match(html, /^<pre data-src="0-23"><code class="hljs language-yaml">/);
    assert.match(html, /unclosed/);
    assert.match(html, /<p data-src="24-28">Text<\/p>$/);
  });

  test("without the option, or without a frontmatter block, the output is the body alone", () => {
    const text = "---\norder: []\n---\n# Hi\n";
    assert.equal(render(text), '<h1 id="hi" data-src="18-22">Hi</h1>');
    assert.equal(withFrontmatter("# Hi\n"), '<h1 id="hi" data-src="0-4">Hi</h1>');
  });
});

describe("Mermaid diagrams", () => {
  test("a mermaid block is a placeholder holding the source, for the View to draw", () => {
    // "```mermaid\ngraph TD\n  A-->B & C\n```" is 36 characters.
    assert.equal(
      render("```mermaid\ngraph TD\n  A-->B & C\n```\n"),
      '<div class="ld-mermaid" data-mermaid="" data-src="0-35">graph TD\n  A-->B &#x26; C</div>',
    );
  });

  test("the language is read trimmed and in any case", () => {
    assert.match(render("```Mermaid\nA-->B\n```\n"), /^<div class="ld-mermaid" data-mermaid="" data-src="0-20">/);
  });

  test("the code directives apply to the placeholder as to a code block", () => {
    assert.equal(
      render("<!-- code-width: 1/2 -->\n<!-- code-align: right -->\n```mermaid\nA\n```\n"),
      '<div class="ld-mermaid ld-code-width-half ld-code-align-right" data-mermaid="" data-code-block-width="1/2" data-code-block-align="right" data-src="52-68">A</div>',
    );
  });

  test("in a compare block, a quote or a list too; inline code is untouched", () => {
    assert.match(render(":::compare\n```mermaid\nA\n```\n:::\n"), /<div class="ld-compare-render"[^>]*>\n?<div class="ld-mermaid" data-mermaid="" data-src="11-27">A<\/div>/);
    assert.match(render("> ```mermaid\n> A\n> ```\n"), /<blockquote data-src="0-22">\n<div class="ld-mermaid" data-mermaid="" data-src="2-22">A<\/div>/);
    assert.match(render("- ```mermaid\n  A\n  ```\n"), /<li data-src="0-22">\n?<div class="ld-mermaid"/);
    assert.equal(render("`mermaid`"), '<p data-src="0-9"><code>mermaid</code></p>');
  });
});

describe("Kanban preview", () => {
  const block = (columns: string, colors = "") => `<div data-ld-kanban data-columns="${columns}" data-colors="${colors}"></div>`;

  test("a Kanban block is a row of titled, colored columns", () => {
    const html = render(`Intro\n\n${block("To do|Q&amp;A", "sky|amber")}\n`);
    // "Intro" is 0-5; the block starts at 7 and is 79 characters long.
    assert.equal(
      html,
      '<p data-src="0-5">Intro</p>\n<div class="ld-kanban" data-kanban="" data-src="7-86">' +
        '<div class="ld-kanban-column ld-kanban-sky"><div class="ld-kanban-column-title">To do</div></div>' +
        '<div class="ld-kanban-column ld-kanban-amber"><div class="ld-kanban-column-title">Q&#x26;A</div></div></div>',
    );
  });

  test("it counts in a quote or a list, not in code", () => {
    assert.match(render(`> ${block("A")}\n`), /<blockquote[^>]*>\n<div class="ld-kanban"/);
    assert.match(render(`- ${block("A")}\n`), /<li[^>]*>\n?<div class="ld-kanban"/);
    assert.equal(render("```html\n" + block("A") + "\n```\n").includes("class=\"ld-kanban\""), false);
    assert.equal(render("    " + block("A") + "\n").includes("class=\"ld-kanban\""), false);
    assert.equal(render("`" + block("A") + "`").includes("class=\"ld-kanban\""), false);
  });

  test("a Kanban div inside a paragraph is not a board", () => {
    assert.equal(render(`Text ${block("A")} more\n`).includes("class=\"ld-kanban\""), false);
  });

  test("only the first block of the Document is shown", () => {
    const html = render(`${block("First")}\n\n${block("Second")}\n`);
    assert.match(html, /First/);
    assert.doesNotMatch(html, /Second/);
  });
});

describe("Tag markers", () => {
  const pill = (tag: string, title: string, src: string, label = tag) =>
    `<mark class="ld-tag-marker" title="${title}" data-tag="${tag}" data-src="${src}">${label}</mark>`;

  test("a lone unknown tag is a pill, titled with the whole tag", () => {
    // "Hello " is 6 characters, "<add-footnote>" 14 more.
    assert.equal(render("Hello <add-footnote>world.\n"), `<p data-src="0-26">Hello ${pill("add-footnote", "<add-footnote>", "6-20")}world.</p>`);
  });

  test("free text stays in the title; the name keeps its case", () => {
    assert.equal(render("<rewrite-section in three parts>, <Add-Footnote>\n"), `<p data-src="0-48">${pill("rewrite-section", "<rewrite-section in three parts>", "0-32")}, ${pill("Add-Footnote", "<Add-Footnote>", "34-48")}</p>`);
  });

  test("a tag inside raw inline code, pre, script, style or textarea is no pill", () => {
    for (const raw of ["code", "pre", "script", "style", "textarea"]) {
      assert.doesNotMatch(render(`Use <${raw}><todo></${raw}> here, and <Code><later é></Code>.\n`), /ld-tag-marker/, raw);
    }
    assert.match(render("<code>x</code> then <todo>\n"), /data-tag="todo"/);
  });

  test("free text with accents, which is text to the parser, is a pill too", () => {
    // "A <generate-image : la scène>" : the tag is 2-29.
    assert.equal(render("A <generate-image : la scène>\n"), `<p data-src="0-29">A ${pill("generate-image", "<generate-image : la scène>", "2-29", "generate-image")}</p>`);
  });

  test("a long name is cut in the pill and whole in the title", () => {
    const name = "abcdefghij-klmnopqrstuvwxy";
    assert.equal(render(`<${name}>\n`), `<p data-src="0-28">${pill(name, `<${name}>`, "0-28", "abcdefghij-klmnopqr…")}</p>`);
  });

  test("an HTML element is not a marker", () => {
    for (const tag of ["p", "span", "br", "details"]) assert.equal(render(`a <${tag}> b\n`).includes("ld-tag-marker"), false, tag);
  });

  test("a tag closed anywhere in the Document, even in code, is not a marker", () => {
    assert.equal(render("a <foo> b\n\n```\n</foo>\n```\n").includes("ld-tag-marker"), false);
  });

  test("code, fenced code and comments never hold markers", () => {
    assert.equal(render("`<add-footnote>`\n\n```\n<add-footnote>\n```\n\n<!-- <add-footnote> -->\n").includes("ld-tag-marker"), false);
  });

  test("an escaped or entity-written tag is plain text", () => {
    assert.equal(render("\\<add-footnote>\n").includes("ld-tag-marker"), false);
    assert.equal(render("&lt;add-footnote&gt;\n").includes("ld-tag-marker"), false);
  });

  test("a marker works in a table cell, a heading, a list, a quote and a compare block, after an entity too", () => {
    assert.match(render("| a |\n|---|\n| <todo> |\n"), /<td><mark class="ld-tag-marker".*?data-src="14-20">todo<\/mark>/);
    assert.match(render("# Title <todo>\n"), /<h1 id="title" data-src="0-14">Title <mark.*?data-src="8-14">todo<\/mark><\/h1>/);
    assert.match(render("- <todo>\n"), /<li data-src="0-8"><mark.*?data-src="2-8">/);
    assert.match(render("> a\n> <todo>\n"), /<mark.*?data-src="6-12">todo<\/mark>/);
    assert.match(render(":::compare\n<todo>\n:::\n"), /ld-compare-render[^>]*>\s*<p data-src="11-17"><mark.*?data-src="11-17">todo/);
    assert.match(render("Tom &amp; Jerry <todo>\n"), /<mark.*?data-src="16-22">todo/);
  });

  test("a line holding a tag is an HTML block: it becomes a paragraph of pills and the text between", () => {
    assert.equal(render("<add-footnote>\n"), `<p data-src="0-14">${pill("add-footnote", "<add-footnote>", "0-14")}</p>`);
    assert.equal(render("<add-footnote>\nHello world\n"), `<p data-src="0-26">${pill("add-footnote", "<add-footnote>", "0-14")}\nHello world</p>`);
  });

  test("an HTML block without a marker stays out, and so do its other tags and comments", () => {
    assert.equal(render("<div>\nhi\n</div>\n"), "");
    assert.equal(render("<todo>\n<!-- c -->\n<b>x</b>\n"), `<p data-src="0-26">${pill("todo", "<todo>", "0-6")}\nx</p>`);
  });

  test("the heading's id ignores the pill", () => {
    assert.match(render("# Plan <todo>\n"), /<h1 id="plan" /);
  });
});
