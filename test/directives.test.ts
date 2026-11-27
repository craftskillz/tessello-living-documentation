// Documents written with the original's formats: block directives (HTML comments), columns, compare, callouts,
// footnotes and code highlighting. Expected HTML is written from the original's behavior, not from the renderer.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseDocument } from "../src/lib/document.ts";
import { parseCardComment } from "../src/lib/directives.ts";
import { renderDocument } from "../src/lib/render.ts";

const render = (text: string, path = "guide/intro.md") => renderDocument(parseDocument(text, path), path, {}, { softBreaks: false });

const TABLE = "| a | b |\n|---|---|\n| 1 | 2 |\n";
const TABLE_HTML = "<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>1</td>\n<td>2</td>\n</tr>\n</tbody>\n</table></div>";

describe("table directives", () => {
  test("style, fill, border, rounded and color become classes and data attributes, in a scroll wrapper", () => {
    const text = `<!-- table-style: intermediate -->\n<!-- table-fill: striped -->\n<!-- table-border: bordered -->\n<!-- table-rounded -->\n<!-- table-color: info -->\n${TABLE}`;
    const start = text.indexOf("| a");
    assert.equal(
      render(text),
      `<div class="overflow-x-auto"><table class="table-style-intermediate table-fill-striped table-border-bordered table-rounded table-color-info" data-table-style="intermediate" data-table-fill="striped" data-table-border="bordered" data-table-rounded="" data-table-color="info" data-src="${start}-${text.length - 1}">\n${TABLE_HTML}`,
    );
  });

  test("rounded works alone, without borders", () => {
    const html = render(`<!-- table-rounded -->\n${TABLE}`);
    assert.match(html, /<table class="table-rounded" data-table-rounded="" /);
  });

  test("the fill reads from table-fill", () => {
    assert.match(render(`<!-- table-fill: full -->\n${TABLE}`), /<table class="table-fill-full" data-table-fill="full" /);
  });

  test("the legacy table-style: striped sets the fill", () => {
    assert.match(render(`<!-- table-style: striped -->\n${TABLE}`), /<table class="table-fill-striped" data-table-fill="striped" /);
  });

  test("the legacy table-style: full sets the full fill and rounded", () => {
    assert.match(render(`<!-- table-style: full -->\n${TABLE}`), /<table class="table-fill-full table-rounded" data-table-fill="full" data-table-rounded="" /);
  });

  test("a density and a legacy fill are read independently", () => {
    assert.match(
      render(`<!-- table-style: compact -->\n<!-- table-style: striped -->\n${TABLE}`),
      /<table class="table-style-compact table-fill-striped" data-table-style="compact" data-table-fill="striped" /,
    );
  });

  test("a table-rounded with a value, or an unknown fill, is ignored", () => {
    assert.doesNotMatch(render(`<!-- table-rounded: yes -->\n<!-- table-fill: dotted -->\n${TABLE}`), /table-rounded|table-fill/);
  });

  test("a table without directives is only wrapped", () => {
    assert.equal(render(TABLE), `<div class="overflow-x-auto"><table data-src="0-${TABLE.length - 1}">\n${TABLE_HTML}`);
  });

  test("the legacy table-style: bordered sets the border", () => {
    const html = render(`<!-- table-style: borderless -->\n${TABLE}`);
    assert.match(html, /<table class="table-border-borderless" data-table-border="borderless" /);
  });

  test("table-border: soft-bordered is rendered, and the last valid border wins", () => {
    assert.match(render(`<!-- table-border: soft-bordered -->\n${TABLE}`), /<table class="table-border-soft-bordered" data-table-border="soft-bordered" /);
    assert.match(render(`<!-- table-border: soft-bordered -->\n<!-- table-border: bordered -->\n${TABLE}`), /<table class="table-border-bordered" data-table-border="bordered" /);
    assert.match(render(`<!-- table-border: bordered -->\n<!-- table-border: soft-bordered -->\n<!-- table-border: dotted -->\n${TABLE}`), /<table class="table-border-soft-bordered" data-table-border="soft-bordered" /);
  });

  test("invalid values are ignored, valid ones around them kept", () => {
    const html = render(`<!-- table-style: fancy -->\n<!-- table-color: danger -->\n<!-- table-border: dotted -->\n${TABLE}`);
    assert.match(html, /<table class="table-color-danger" data-table-color="danger" /);
  });

  test("a blank line may separate the directives from the table", () => {
    assert.match(render(`<!-- table-style: compact -->\n\n${TABLE}`), /<table class="table-style-compact" data-table-style="compact" /);
  });

  test("a directive applies to the next block only", () => {
    assert.doesNotMatch(render(`<!-- table-style: compact -->\n\nText\n\n${TABLE}`), /table-style/);
  });

  test("the directive is not output, and works inside a blockquote", () => {
    const html = render(`> <!-- table-color: success -->\n>\n> | a |\n> |---|\n> | 1 |\n`);
    assert.match(html, /<blockquote data-src="0-\d+">\n<div class="overflow-x-auto"><table class="table-color-success" data-table-color="success" /);
    assert.doesNotMatch(html, /<!--|table-style/);
  });

  test("empty cells hold a non-breaking space", () => {
    assert.match(render("| a | b |\n|---|---|\n| 1 |   |\n"), /<td>1<\/td>\n<td> <\/td>/);
  });

  test("a directive written in a fenced code block stays text", () => {
    assert.equal(
      render("```text\n<!-- table-style: compact -->\n```\n"),
      '<pre data-src="0-41"><code class="hljs language-text">&#x3C;!-- table-style: compact -->\n</code></pre>',
    );
  });
});

describe("image directives", () => {
  test("width and alignment become classes and data attributes on the image", () => {
    assert.equal(
      render("<!-- image-width: 3/4 -->\n<!-- image-align: center -->\n![a cat](pics/cat.png)\n"),
      '<p data-src="55-77"><img data-image="guide/pics/cat.png" alt="a cat" class="ld-image-width-three-quarters ld-image-align-center" data-image-width="3/4" data-image-align="center"></p>',
    );
  });

  test("each width has its class", () => {
    const classes = ["full", "3/4", "2/3", "1/2", "1/3", "1/4"].map((w) => /class="ld-image-width-([a-z-]+)"/.exec(render(`<!-- image-width: ${w} -->\n![x](a.png)`))?.[1]);
    assert.deepEqual(classes, ["full", "three-quarters", "two-thirds", "half", "third", "quarter"]);
  });

  test("invalid values are ignored", () => {
    assert.equal(render("<!-- image-width: 80% -->\n<!-- image-align: middle -->\n![x](a.png)"), '<p data-src="55-66"><img data-image="guide/a.png" alt="x"></p>');
  });

  test("a blank line may separate the directive from the image", () => {
    assert.match(render("<!-- image-align: right -->\n\n![x](a.png)"), /class="ld-image-align-right" data-image-align="right"/);
  });

  test("the directive does not reach the next image", () => {
    assert.doesNotMatch(render("<!-- image-align: right -->\n\n![x](a.png)\n\n![y](b.png)").split("</p>")[1]!, /class/);
  });
});

describe("code directives", () => {
  test("width and alignment become classes and data attributes on the pre", () => {
    assert.match(
      render("<!-- code-width: 1/2 -->\n<!-- code-align: right -->\n```ts\nlet a = 1;\n```\n"),
      /^<pre class="ld-code-width-half ld-code-align-right" data-code-block-width="1\/2" data-code-block-align="right" data-src="52-72"><code/,
    );
  });

  test("invalid values are ignored", () => {
    assert.match(render("<!-- code-width: wide -->\n```\nx\n```\n"), /^<pre data-src="/);
  });

  test("a Mermaid block takes the mermaid-width and mermaid-align its form writes, as code-width and code-align", () => {
    const html = render("<!-- mermaid-width: 1/2 -->\n<!-- mermaid-align: center -->\n```mermaid\ngraph TD\n```\n");
    assert.match(html, /^<div class="ld-mermaid ld-code-width-half ld-code-align-center" data-mermaid="" data-code-block-width="1\/2" data-code-block-align="center" data-src="\d+-\d+">/);
    assert.doesNotMatch(html, /<!--/);
    assert.match(render("<!-- code-width: 1/3 -->\n```mermaid\ngraph TD\n```\n"), /^<div class="ld-mermaid ld-code-width-third"/);
  });

  test("mermaid directives before a block of other code are ignored", () => {
    assert.match(render("<!-- mermaid-width: 1/2 -->\n```ts\nx\n```\n"), /^<pre data-src="/);
  });
});

const INFO_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>';
const SUCCESS_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

describe("quote directives (callouts)", () => {
  test("a type alone only styles the blockquote", () => {
    assert.equal(render("<!-- quote-type: warning -->\n> Careful\n"), '<blockquote class="ld-callout ld-callout-warning" data-src="29-38">\n<p data-src="31-38">Careful</p>\n</blockquote>');
  });

  test("aliases map to their canonical type", () => {
    const types = ["note", "tip", "caution", "danger", "info", "success", "warning", "error"].map(
      (t) => /ld-callout-([a-z]+)/.exec(render(`<!-- quote-type: ${t} -->\n> x`))?.[1],
    );
    assert.deepEqual(types, ["info", "success", "warning", "error", "info", "success", "warning", "error"]);
  });

  test("a title is a header row above the body", () => {
    assert.equal(
      render("<!-- quote-type: tip -->\n<!-- quote-title: Heads up -->\n> Body\n"),
      '<blockquote class="ld-callout ld-callout-success" data-src="56-62"><div class="ld-callout-header"><span class="ld-callout-title">Heads up</span></div>\n<p data-src="58-62">Body</p>\n</blockquote>',
    );
  });

  test("a title without a type is a callout with no type class", () => {
    assert.match(render("<!-- quote-title: Why -->\n> Because\n"), /^<blockquote class="ld-callout" data-src="\d+-\d+"><div class="ld-callout-header"><span class="ld-callout-title">Why<\/span><\/div>/);
  });

  test("an icon and a title share the header row", () => {
    assert.match(
      render("<!-- quote-type: tip -->\n<!-- quote-icon -->\n<!-- quote-title: Idea -->\n> Body\n"),
      new RegExp(`<div class="ld-callout-header"><span class="ld-callout-icon">${SUCCESS_ICON.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</span><span class="ld-callout-title">Idea</span></div>`),
    );
  });

  test("an icon without a title goes inline at the start of the first paragraph", () => {
    assert.equal(
      render("<!-- quote-icon -->\n> Body\n"),
      `<blockquote class="ld-callout" data-src="20-26">\n<p data-src="22-26"><span class="ld-callout-icon ld-callout-icon-inline">${INFO_ICON}</span>Body</p>\n</blockquote>`,
    );
  });

  test("an invalid type is ignored but the title still makes a callout", () => {
    assert.match(render("<!-- quote-type: wow -->\n<!-- quote-title: T -->\n> x\n"), /^<blockquote class="ld-callout" /);
  });

  test("a plain blockquote is untouched, and a directive does not reach a later one", () => {
    assert.equal(render("> plain\n"), '<blockquote data-src="0-7">\n<p data-src="2-7">plain</p>\n</blockquote>');
    assert.doesNotMatch(render("<!-- quote-type: tip -->\n\nText\n\n> later\n"), /ld-callout/);
  });

  test("the header text is escaped", () => {
    assert.match(render("<!-- quote-title: a <b> & c -->\n> x\n"), /<span class="ld-callout-title">a &#x3C;b> &#x26; c<\/span>/);
  });
});

describe("column layouts", () => {
  const COLS = (open: string, ...columns: string[]) => `<!-- ${open} -->\n${columns.map((c) => `<!-- col -->\n${c}\n`).join("")}<!-- /layout-columns -->\n`;

  test("a ratio sets the grid and each column holds its blocks", () => {
    // "<!-- layout-columns: 2/1 -->\n" is 29 characters, "<!-- col -->\n" is 13: "Left" is 42-46.
    assert.equal(
      render(COLS("layout-columns: 2/1", "Left", "Right")),
      '<div class="ld-columns" style="grid-template-columns: 2fr 1fr;" data-src="0-90"><div class="ld-column"><p data-src="42-46">Left</p></div><div class="ld-column"><p data-src="60-65">Right</p></div></div>',
    );
  });

  test("a column may hold several blocks, and any directive applies inside it", () => {
    const html = render(COLS("layout-columns: 1/1", "# Title\n\n<!-- table-style: compact -->\n" + TABLE, "Right"));
    assert.match(html, /<div class="ld-column"><h1 id="title" data-src="\d+-\d+">Title<\/h1><div class="overflow-x-auto"><table class="table-style-compact"/);
  });

  test("three columns", () => {
    const html = render(COLS("layout-columns: 1/2/1", "A", "B", "C"));
    assert.match(html, /^<div class="ld-columns" style="grid-template-columns: 1fr 2fr 1fr;" data-src="\d+-\d+">/);
    assert.equal(html.match(/<div class="ld-column">/g)?.length, 3);
  });

  test("no ratio, or one that does not match the column count, gives equal columns", () => {
    assert.match(render(COLS("layout-columns", "A", "B")), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    assert.match(render(COLS("layout-columns: 3/1/1", "A", "B")), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });

  test("a single number is the column count of an equal grid", () => {
    assert.match(render(COLS("layout-columns: 3", "A", "B")), /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  });

  test("options become classes", () => {
    assert.match(
      render(COLS("layout-columns: 1/1 | vertical-align: center | text-align: justify | gap: lg", "A", "B")),
      /^<div class="ld-columns ld-valign-center ld-text-justify ld-gap-lg" style="grid-template-columns: 1fr 1fr;" data-src="\d+-\d+">/,
    );
  });

  test("invalid options are ignored", () => {
    assert.match(render(COLS("layout-columns: 1/1 | vertical-align: middle | gap: xl", "A", "B")), /^<div class="ld-columns" style=/);
  });

  test("the grid's data-src runs from the opening comment to the end of the closing comment", () => {
    // "Intro\n\n" is 7 characters; the layout of the first test is 90 long ("<!-- /layout-columns -->" ends it): 7-97.
    assert.match(render("Intro\n\n" + COLS("layout-columns: 2/1", "Left", "Right")), /<div class="ld-columns" style="grid-template-columns: 2fr 1fr;" data-src="7-97">/);
  });

  test("without a closing comment the blocks stay as they are and no comment is output", () => {
    assert.equal(render("<!-- layout-columns: 1/1 -->\n<!-- col -->\nA\n\n<!-- col -->\nB\n"), '<p data-src="42-43">A</p>\n<p data-src="58-59">B</p>');
  });

  test("blocks before the layout are not part of it", () => {
    assert.match(render("Intro\n\n" + COLS("layout-columns", "A", "B")), /^<p data-src="0-5">Intro<\/p>\n<div class="ld-columns"/);
  });
});

describe("compare blocks", () => {
  test("the raw source sits beside its rendering", () => {
    // ":::compare\n" is 11 characters, so "**bold**" is 11-19.
    assert.equal(
      render(":::compare\n**bold**\n:::\n"),
      '<div class="ld-compare" data-src="0-23"><div class="ld-compare-source" data-label="Markdown"><pre><code class="language-markdown">**bold**</code></pre></div><div class="ld-compare-render" data-label="Result"><p data-src="11-19"><strong>bold</strong></p></div></div>',
    );
  });

  test("the labels come from the caller", () => {
    const html = renderDocument(parseDocument(":::compare\nx\n:::\n", "a.md"), "a.md", { footnotes: "Notes", footnoteBack: "Back", compareSource: "Source", compareRender: "Rendu" }, { softBreaks: false });
    assert.match(html, /data-label="Source"/);
    assert.match(html, /data-label="Rendu"/);
  });

  test("the source is escaped", () => {
    assert.match(render(":::compare\n<b>&</b>\n:::\n"), /<code class="language-markdown">&#x3C;b>&#x26;&#x3C;\/b><\/code>/);
  });

  test("inner code with a blank line does not disturb the rest, and every block keeps its range", () => {
    const text = "---\ntitle: T\n---\nBefore\n\n:::compare\n# Inner\n\n```js\na();\n\nb();\n```\n\n| x |\n|---|\n| 1 |\n:::\n\nAfter\n";
    const html = render(text);
    const slices = [...html.matchAll(/<(h1|pre|table|p) [^>]*?data-src="(\d+)-(\d+)"/g)].map((m) => `${m[1]}:${text.slice(Number(m[2]), Number(m[3]))}`);
    assert.deepEqual(slices, ["p:Before", "h1:# Inner", "pre:```js\na();\n\nb();\n```", "table:| x |\n|---|\n| 1 |", "p:After"]);
    assert.match(html, /<code class="language-markdown"># Inner\n\n```js\na\(\);\n\nb\(\);\n```\n\n\| x \|\n\|---\|\n\| 1 \|<\/code>/);
  });

  test("directives apply to the inner blocks", () => {
    const html = render(":::compare\n<!-- quote-type: tip -->\n> Hi\n\n<!-- table-color: info -->\n| a |\n|---|\n| 1 |\n:::\n");
    assert.match(html, /<div class="ld-compare-render" data-label="Result"><blockquote class="ld-callout ld-callout-success"/);
    assert.match(html, /<table class="table-color-info"/);
  });

  test("a directive does not cross a compare block", () => {
    assert.doesNotMatch(render("<!-- table-style: compact -->\n:::compare\nx\n:::\n\n| a |\n|---|\n| 1 |\n"), /table-style/);
  });

  test("a compare written inside a fenced code block stays code", () => {
    assert.doesNotMatch(render("```\n:::compare\nx\n:::\n```\n"), /ld-compare/);
  });

  test("a compare that is never closed is plain text", () => {
    assert.doesNotMatch(render(":::compare\nx\n"), /ld-compare/);
  });

  test("a compare in a column layout", () => {
    const html = render("<!-- layout-columns: 1/1 -->\n<!-- col -->\n:::compare\n**b**\n:::\n<!-- col -->\nB\n<!-- /layout-columns -->\n");
    assert.match(html, /^<div class="ld-columns"[^>]*><div class="ld-column"><div class="ld-compare" data-src="42-62">/);
  });
});

describe("footnotes", () => {
  test("references and notes link to each other by anchor, with the labels given", () => {
    const html = render("Text[^1]\n\n[^1]: The note\n");
    assert.match(html, /<sup><a role="link" tabindex="0" data-anchor="ld-fn-1" id="ld-fnref-1" [^>]*>1<\/a><\/sup>/);
    assert.match(html, /<h2 class="ld-footnotes-label" id="footnote-label">Footnotes<\/h2>/);
    assert.match(html, /<li id="ld-fn-1" [^>]*>\n<p [^>]*>The note <a role="link" tabindex="0" data-anchor="ld-fnref-1" [^>]*aria-label="Back to reference"[^>]*>/);
    assert.doesNotMatch(html, /href/);
  });

  test("the labels come from the caller", () => {
    const labels = { footnotes: "Notes", footnoteBack: "Retour", compareSource: "S", compareRender: "R" };
    const html = renderDocument(parseDocument("A[^1]\n\n[^1]: n\n", "a.md"), "a.md", labels, { softBreaks: false });
    assert.match(html, />Notes<\/h2>/);
    assert.match(html, /aria-label="Retour"/);
  });

  test("notes are numbered in order of reference and their ids follow their labels", () => {
    const html = render("A[^b] B[^a]\n\n[^a]: first\n[^b]: second\n");
    assert.match(html, /data-anchor="ld-fn-b" id="ld-fnref-b"[^>]*>1<\/a><\/sup> B<sup><a[^>]*data-anchor="ld-fn-a" id="ld-fnref-a"[^>]*>2<\/a>/);
  });
});

describe("code highlighting", () => {
  test("a block with a language gets highlight spans, the pre keeps its range", () => {
    assert.equal(
      render("```ts\nconst a: number = 1;\n```\n"),
      '<pre data-src="0-30"><code class="hljs language-ts"><span class="hljs-keyword">const</span> <span class="hljs-attr">a</span>: <span class="hljs-built_in">number</span> = <span class="hljs-number">1</span>;\n</code></pre>',
    );
  });

  test("a block without a language is detected", () => {
    assert.match(render("```\nfunction f() { return 1; }\n```\n"), /<code class="hljs language-[\w-]+">.*<span class="hljs-keyword">return<\/span>/);
  });

  test("mermaid is not highlighted: it is a placeholder for the diagram pass", () => {
    assert.equal(render("```mermaid\ngraph TD\n  A --> B\n```\n"), '<div class="ld-mermaid" data-mermaid="" data-src="0-33">graph TD\n  A --> B</div>');
  });
});

describe("raw HTML and comments", () => {
  test("raw HTML and unknown comments are left out", () => {
    assert.equal(render("<!-- just a note -->\n\n<div>raw</div>\n\nText\n"), '<p data-src="38-42">Text</p>');
  });
});

describe("cards", () => {
  test("the comment: a title first, then its options; the close; anything else is no card comment", () => {
    assert.deepEqual(parseCardComment(" card: My title | style: deck | width: 1/2 | align: right "), { kind: "open", options: { title: "My title", style: "deck", color: null, width: "1/2", align: "right" } });
    assert.deepEqual(parseCardComment("card"), { kind: "open", options: { title: null, style: null, color: null, width: null, align: null } });
    assert.deepEqual(parseCardComment("card | style: bristol"), { kind: "open", options: { title: null, style: "bristol", color: null, width: null, align: null } });
    assert.deepEqual(parseCardComment("card: Note: read me | align: center"), { kind: "open", options: { title: "Note: read me", style: null, color: null, width: null, align: "center" } });
    assert.deepEqual(parseCardComment("card: T | style: neon | width: 40% | align: top"), { kind: "open", options: { title: "T", style: null, color: null, width: null, align: null } });
    assert.deepEqual(parseCardComment(" /card "), { kind: "close" });
    assert.equal(parseCardComment("cards"), null);
    assert.equal(parseCardComment("table-style: compact"), null);
  });

  test("a colour from the palette is read, any other is ignored", () => {
    assert.equal((parseCardComment("card: T | color: sky") as { options: { color: string | null } }).options.color, "sky");
    assert.equal((parseCardComment("card: T | color: Navy") as { options: { color: string | null } }).options.color, "navy");
    assert.equal((parseCardComment("card: T | color: #ff0000") as { options: { color: string | null } }).options.color, null);
  });

  test("a coloured card carries its colour as a class, after its style", () => {
    assert.match(render("<!-- card: T | style: bristol | color: mint | width: 1/2 -->\nX\n<!-- /card -->\n"), /^<div class="ld-card ld-card-bristol ld-card-color-mint ld-card-width-half" data-src=/);
  });

  test("a card wraps its blocks under its title, with its style, width and alignment as classes", () => {
    // "<!-- card: Hello | style: bristol | width: 1/2 | align: right -->\n\n" is 67 characters: "Body" is 67-71, "<!-- /card -->" 73-87.
    assert.equal(
      render("<!-- card: Hello | style: bristol | width: 1/2 | align: right -->\n\nBody\n\n<!-- /card -->\n"),
      '<div class="ld-card ld-card-bristol ld-card-width-half ld-card-align-right" data-src="0-87"><div class="ld-card-title">Hello</div><div class="ld-card-body"><p data-src="67-71">Body</p></div></div>',
    );
  });

  test("a bare card is plain, full width, without a title", () => {
    assert.equal(render("<!-- card -->\nBody\n<!-- /card -->\n"), '<div class="ld-card ld-card-plain" data-src="0-33"><div class="ld-card-body"><p data-src="14-18">Body</p></div></div>');
  });

  test("the title is text, never markup", () => {
    assert.match(render("<!-- card: <b>x</b> & y -->\nBody\n<!-- /card -->\n"), /<div class="ld-card-title">&#x3C;b>x&#x3C;\/b> &#x26; y<\/div>/);
  });

  test("directives apply inside a card, and a card's comment is not a directive of the block after it", () => {
    const html = render("<!-- card: T -->\n<!-- table-style: compact -->\n" + TABLE + "\n<!-- /card -->\n");
    assert.match(html, /<div class="ld-card-body"><div class="overflow-x-auto"><table class="table-style-compact"/);
  });

  test("cards nest, and go inside and around column layouts", () => {
    const nested = render("<!-- card: Out -->\n\n<!-- card: In -->\n\nX\n\n<!-- /card -->\n\nY\n\n<!-- /card -->\n");
    assert.match(nested, /^<div class="ld-card ld-card-plain" data-src="\d+-\d+"><div class="ld-card-title">Out<\/div><div class="ld-card-body"><div class="ld-card ld-card-plain" data-src="\d+-\d+"><div class="ld-card-title">In<\/div><div class="ld-card-body"><p data-src="\d+-\d+">X<\/p><\/div><\/div><p data-src="\d+-\d+">Y<\/p><\/div><\/div>$/);
    const inColumns = render("<!-- layout-columns -->\n<!-- col -->\n<!-- card: A -->\nA\n<!-- /card -->\n<!-- col -->\nB\n<!-- /layout-columns -->\n");
    assert.match(inColumns, /<div class="ld-column"><div class="ld-card ld-card-plain" data-src="\d+-\d+"><div class="ld-card-title">A<\/div>/);
    const aroundColumns = render("<!-- card: C -->\n<!-- layout-columns -->\n<!-- col -->\nA\n<!-- col -->\nB\n<!-- /layout-columns -->\n<!-- /card -->\n");
    assert.match(aroundColumns, /<div class="ld-card-body"><div class="ld-columns"/);
  });

  test("without a closing comment the blocks stay as they are and no comment is output", () => {
    assert.equal(render("<!-- card: T -->\nA\n"), '<p data-src="17-18">A</p>');
  });
});
