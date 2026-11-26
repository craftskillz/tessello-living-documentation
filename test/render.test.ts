// A Document rendered as HTML: source ranges, heading ids, and links and images that never carry an address.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseDocument } from "../src/lib/document.ts";
import { kanbanBlockText } from "../src/lib/kanban.ts";
import { htmlWrappers, kanbanBlockAt, kanbanBlockOf, renderDocument } from "../src/lib/render.ts";

const render = (text: string, path = "guide/intro.md") => renderDocument(parseDocument(text, path), path, {}, { softBreaks: false });

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
  const withFrontmatter = (text: string) => renderDocument(parseDocument(text, "liv-doc-main.md"), "liv-doc-main.md", {}, { frontmatter: true, softBreaks: false });

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

describe("kanbanBlockOf", () => {
  const block = (columns: string) => `<div data-ld-kanban data-columns="${columns}" data-colors="sky"></div>`;
  const of = (text: string) => kanbanBlockOf(parseDocument(text, "board.md"));

  test("a real block, at the top level, in a quote or in a list", () => {
    const expected = { columns: [{ label: "To do", color: "sky" }] };
    assert.deepEqual(of(`Intro\n\n${block("To do")}\n`), expected);
    assert.deepEqual(of(`> ${block("To do")}\n`), expected);
    assert.deepEqual(of(`- ${block("To do")}\n`), expected);
  });

  test("not in code, nor in a paragraph with text", () => {
    assert.equal(of("```html\n" + block("A") + "\n```\n"), null);
    assert.equal(of("    " + block("A") + "\n"), null);
    assert.equal(of("`" + block("A") + "`"), null);
    assert.equal(of(`Text ${block("A")} more\n`), null);
  });

  test("not inside a :::compare", () => {
    assert.equal(of(`:::compare\n${block("A")}\n:::\n`), null);
  });

  test("the first block of the Document", () => {
    assert.deepEqual(of(`${block("First")}\n\n${block("Second")}\n`)?.columns.map((c) => c.label), ["First"]);
  });

  test("not in the frontmatter", () => {
    assert.equal(of(`---\ndescription: '${block("A")}'\n---\nText\n`), null);
  });
});

describe("board rendering", () => {
  const block = '<div data-ld-kanban data-columns="To do" data-colors="sky"></div>';
  const model = parseDocument(`Intro\n\n${block}\n`, "board.md");

  test("with board, the Kanban block is left out and the text stays", () => {
    assert.equal(renderDocument(model, "board.md", {}, { softBreaks: false, board: true }), '<p data-src="0-5">Intro</p>');
  });

  test("by default the read-only preview shows", () => {
    assert.match(renderDocument(model, "board.md", {}, { softBreaks: false }), /class="ld-kanban"/);
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

describe("every newline as a line break", () => {
  const on = (text: string) => renderDocument(parseDocument(text, "a.md"), "a.md", {}, { softBreaks: true });
  const off = (text: string) => renderDocument(parseDocument(text, "a.md"), "a.md", {}, { softBreaks: false });

  test("a newline in a paragraph is a <br>", () => {
    assert.match(on("a\nb\n"), /<p data-src="0-3">a<br>\nb<\/p>/);
  });

  test("in a list item, a blockquote and a lazy continuation", () => {
    assert.match(on("- a\n  b\n"), /<li data-src="0-7">a<br>\nb<\/li>/);
    assert.match(on("> a\n> b\n"), /a<br>\nb<\/p>/);
    assert.match(on("> a\nb\n"), /a<br>\nb<\/p>/);
  });

  test("in a callout, a column and the rendered side of a compare block", () => {
    assert.match(on("> [!NOTE]\n> a\n> b\n"), /a<br>\nb/);
    assert.match(on("<!-- columns -->\n\nleft\nmore\n\n<!-- column -->\n\nright\n\n<!-- /columns -->\n"), /left<br>\nmore/);
    assert.match(on(":::compare\na\nb\n:::\n"), /ld-compare-render[^>]*>\s*<p[^>]*>a<br>\nb<\/p>/);
  });

  test("the source side of a compare block stays raw text", () => {
    assert.doesNotMatch(on(":::compare\na\nb\n:::\n").split("ld-compare-render")[0]!, /<br>/);
  });

  test("code blocks, inline code and Mermaid are untouched", () => {
    assert.doesNotMatch(on("```\na\nb\n```\n"), /<br>/);
    assert.doesNotMatch(on("x `a\nb` y\n"), /<code>a<br>/);
    assert.doesNotMatch(on("```mermaid\nA-->B\nB-->C\n```\n"), /<br>/);
  });

  test("the frontmatter block is code", () => {
    const html = renderDocument(parseDocument("---\ntitle: T\ntags: [a]\n---\nx\n", "a.md"), "a.md", {}, { softBreaks: true, frontmatter: true });
    assert.doesNotMatch(html, /<br>/);
  });

  test("off, it is plain CommonMark: two spaces and <br/> still break", () => {
    assert.match(off("a\nb\n"), /<p data-src="0-3">a\nb<\/p>/);
    assert.match(off("a  \nb\n"), /<p data-src="0-5">a<br>\nb<\/p>/);
    assert.match(on("a  \nb\n"), /<p data-src="0-5">a<br>\nb<\/p>/);
  });

  test("raw <br/> in the source is handled as before", () => {
    assert.equal(on("a<br/>b\n"), off("a<br/>b\n"));
  });

  test("a table renders the same on and off", () => {
    const table = "| a | b |\n|---|---|\n| 1 | 2 |\n";
    assert.equal(on(table), off(table));
  });

  test("every block keeps its range and every heading its id", () => {
    const text = "# Title\n\nline one\nline two\n\n- a\n  b\n\n> q\n> r\n\n## Next\n";
    const strip = (html: string) => html.replace(/<br>/g, "");
    const attrs = (html: string) => [...html.matchAll(/ (data-src|id)="([^"]*)"/g)].map((m) => m[0]);
    assert.deepEqual(attrs(on(text)), attrs(off(text)));
    assert.match(strip(on(text)), /id="title"/);
  });

  test("a footnote definition breaks too", () => {
    assert.match(on("x[^1]\n\n[^1]: a\n    b\n"), /a<br>\nb/);
  });
});

describe("line breaks keep the spaces around inline nodes", () => {
  test("a space before inline code survives a newline earlier in the text", () => {
    const html = renderDocument(parseDocument("a\nb `x`\n", "a.md"), "a.md", {}, { softBreaks: true });
    assert.match(html, /a<br>\nb <code>x<\/code>/);
  });
});

describe("raw HTML snippets", () => {
  test("a collapsible renders as details with its summary as text", () => {
    // "<details>\n<summary>More</summary>" is 0-33, "Hidden **text**" 35-50, "</details>" 52-62
    assert.equal(
      render("<details>\n<summary>More</summary>\n\nHidden **text**\n\n</details>\n"),
      '<details data-src="0-62"><summary>More</summary><p data-src="35-50">Hidden <strong>text</strong></p></details>',
    );
  });

  test("a collapsible takes attributes, strips the tags of its summary and needs a closing tag", () => {
    // "<details open>\n<summary>A <b>b</b></summary>" is 0-44, "x" 46-47, "</details>" 49-59
    assert.equal(
      render("<details open>\n<summary>A <b>b</b></summary>\n\nx\n\n</details>\n"),
      '<details data-src="0-59"><summary>A b</summary><p data-src="46-47">x</p></details>',
    );
    // unclosed: the opening stays out, "x" is 32-33
    assert.equal(render("<details>\n<summary>S</summary>\n\nx\n"), '<p data-src="32-33">x</p>');
  });

  test("a colored section keeps only the colours it can read", () => {
    // the opening tag is 0-101, "In" 103-105, "</div>" 107-113
    assert.equal(
      render('<div style="background:#eff6ff;border-left:4px solid #3b82f6;color:#1e3a5f;padding:1rem;margin:9px;">\n\nIn\n\n</div>\n'),
      '<div class="ld-colored-section" style="background:#eff6ff;border-left:4px solid #3b82f6;color:#1e3a5f" data-src="0-113"><p data-src="103-105">In</p></div>',
    );
    // the opening tag is 0-84, "In" 86-88, "</div>" 90-96: only the border colour is a colour
    assert.equal(
      render('<div style="background:url(x);border-left:4px solid red;color:expression(alert(1))">\n\nIn\n\n</div>\n'),
      '<div class="ld-colored-section" style="border-left:4px solid red" data-src="0-96"><p data-src="86-88">In</p></div>',
    );
  });

  test("a colored section without a closing tag stays out", () => {
    // the opening tag is 0-39, "x" 41-42
    assert.equal(render('<div style="border-left:4px solid red">\n\nx\n'), '<p data-src="41-42">x</p>');
  });

  test("they nest, and work in a quote and in a compare", () => {
    // the section is 0-95, the collapsible inside it 42-87 holding "x" at 74-75
    assert.equal(
      render('<div style="border-left:4px solid red;">\n\n<details>\n<summary>S</summary>\n\nx\n\n</details>\n\n</div>\n'),
      '<div class="ld-colored-section" style="border-left:4px solid red" data-src="0-95"><details data-src="42-87"><summary>S</summary><p data-src="74-75">x</p></details></div>',
    );
    assert.match(render("> <details>\n> <summary>S</summary>\n>\n> x\n>\n> </details>\n"), /<blockquote[^>]*>\n<details data-src="2-\d+"><summary>S/);
    assert.match(render(":::compare\n<details>\n<summary>S</summary>\n\nx\n\n</details>\n:::\n"), /ld-compare-render[^>]*>\n?<details data-src="11-/);
  });

  test("a compare block carries its whole range", () => {
    // ":::compare\na\n:::" is 0-16, and 3-19 after "x\n\n"
    assert.match(render(":::compare\na\n:::\n"), /^<div class="ld-compare" data-src="0-16">/);
    assert.match(render("x\n\n:::compare\na\n:::\n"), /<div class="ld-compare" data-src="3-19">/);
  });

  test("colored text and HTML links in a paragraph", () => {
    assert.equal(inline('a <span style="color:#3b82f6;">b</span> c'), 'a <span class="ld-colored-text" style="color:#3b82f6">b</span> c');
    assert.equal(inline('<span style="color:red;background:url(x)">b</span>'), '<span class="ld-colored-text" style="color:red">b</span>');
    assert.equal(inline('<span style="color:url(x)">b</span>'), '<span class="ld-colored-text">b</span>');
    assert.equal(
      inline('<a href="https://x.test" target="_blank">X</a>'),
      '<a href="https://x.test" target="_blank" rel="noopener noreferrer">X</a>',
    );
    assert.equal(inline("<a href='?doc=b'>B</a>"), '<a role="link" tabindex="0" data-doc="b.md">B</a>');
  });

  test("other raw HTML and unclosed inline shapes stay out", () => {
    assert.equal(render("<div>x</div>\n"), "");
    assert.equal(inline("a <span>y</span> b"), "a y b");
    assert.equal(inline('a <span style="color:red">y b'), "a y b");
  });

  test("htmlWrappers finds collapsibles and colored sections at every level, compare regions left out", () => {
    const text = '<div style="border-left:4px solid red;">\n\n<details>\n<summary>S</summary>\n\nx\n\n</details>\n\n</div>\n\n:::compare\n<details>\n<summary>S</summary>\n\nx\n\n</details>\n:::\n';
    assert.deepEqual(htmlWrappers(text), [
      { kind: "colored-section", from: 0, to: 95 },
      { kind: "collapsible", from: 42, to: 87 },
    ]);
  });
});

describe("kanbanBlockAt", () => {
  const line = '<div data-ld-kanban data-columns="To do|Doing" data-colors="sky|amber"></div>';
  const replaced = (text: string): string | null => {
    const found = kanbanBlockAt(parseDocument(text, "board.md"));
    return found && text.slice(0, found.range.from) + "NEW" + text.slice(found.range.to);
  };

  test("the range covers the block line exactly, at the top level", () => {
    assert.equal(replaced(`Intro\n\n${line}\n\nEnd\n`), "Intro\n\nNEW\n\nEnd\n");
  });

  test("with a frontmatter the range counts it", () => {
    assert.equal(replaced(`---\ntitle: T\n---\nIntro\n\n${line}\n`), "---\ntitle: T\n---\nIntro\n\nNEW\n");
  });

  test("in a quote or a list the marker stays out of the range", () => {
    assert.equal(replaced(`> ${line}\n`), "> NEW\n");
    assert.equal(replaced(`- ${line}\n`), "- NEW\n");
  });

  test("after a :::compare region the offsets still hold", () => {
    assert.equal(replaced(`:::compare\nleft\n---\nright\n:::\n\n${line}\n`), ":::compare\nleft\n---\nright\n:::\n\nNEW\n");
  });

  test("a block in a code fence is ignored, the next real one counts", () => {
    assert.equal(kanbanBlockAt(parseDocument("```html\n" + line + "\n```\n", "board.md")), null);
    assert.equal(replaced("```html\n" + line + "\n```\n\n" + line + "\n"), "```html\n" + line + "\n```\n\nNEW\n");
  });

  test("gives the block too, and null for no board", () => {
    assert.deepEqual(kanbanBlockAt(parseDocument(`${line}\n`, "b.md"))?.block, {
      columns: [{ label: "To do", color: "sky" }, { label: "Doing", color: "amber" }],
    });
    assert.equal(kanbanBlockAt(parseDocument("Just text\n", "b.md")), null);
  });

  test("replacing the range by kanbanBlockText gives the new board", () => {
    const text = `---\ntitle: T\n---\n> ${line}\n`;
    const found = kanbanBlockAt(parseDocument(text, "board.md"))!;
    const next = text.slice(0, found.range.from) + kanbanBlockText([{ label: "Q&A", color: "rose" }]) + text.slice(found.range.to);
    assert.equal(next, '---\ntitle: T\n---\n> <div data-ld-kanban data-columns="Q&amp;A" data-colors="rose"></div>\n');
  });
});
