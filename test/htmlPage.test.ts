// A Document as an HTML page of a template (rules R1, R6-R8, R16): structure, view mode and standalone mode.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseDocument } from "../src/lib/document.ts";
import { htmlTemplateOf, type HtmlTemplate } from "../src/lib/htmlTemplates.ts";
import { htmlPage, standaloneHtml, type HtmlPage } from "../src/lib/htmlPage.ts";

const SHEET = htmlTemplateOf("interview-sheet")!;
const ARTICLE = htmlTemplateOf("article")!;

type Standalone = { images: Record<string, string>; diagrams: string[] };

function build(text: string, options: { template?: HtmlTemplate; standalone?: Standalone; softBreaks?: boolean; path?: string } = {}): HtmlPage {
  const path = options.path ?? "notes/page.md";
  return htmlPage(parseDocument(text, path), path, options.template ?? SHEET, {}, { softBreaks: options.softBreaks ?? false, standalone: options.standalone });
}

const sectionIds = (html: string) => [...html.matchAll(/<section class="ld-section" id="([^"]*)"/g)].map((match) => match[1]);

describe("title", () => {
  test("a leading # heading is the title and leaves the content", () => {
    const page = build("# Plain title\n\nIntro.\n\n## One\n\nText.\n");
    assert.equal(page.title, "Plain title");
    assert.match(page.html, /<header class="sheet-header"><h1>Plain title<\/h1><\/header>/);
    assert.doesNotMatch(page.html, /<h1[^>]*>Plain title<\/h1>\s*<div class="ld-lead"/);
    assert.equal(page.html.match(/<h1\b/g)?.length, 1);
  });

  test("Tag markers and emphasis do not reach the title", () => {
    const page = build("# Big *idea* <draft> here\n\nBody\n", {});
    assert.equal(page.title, "Big idea  here");
    assert.match(page.html, /<h1>Big idea {2}here<\/h1>/);
  });

  test("without a leading # heading, the title is the Document's and nothing is removed", () => {
    const page = build("---\ntitle: From frontmatter\n---\nIntro\n\n# Later heading\n");
    assert.equal(page.title, "From frontmatter");
    assert.match(page.html, /<h1>From frontmatter<\/h1>/);
    assert.match(page.html, /<h1 id="later-heading"[^>]*>Later heading<\/h1>/);
  });

  test("a ## heading first is not a title", () => {
    const page = build("## Start\n\nText\n", { path: "notes/start.md" });
    assert.equal(page.title, "start");
    assert.deepEqual(sectionIds(page.html), ["start"]);
  });

  test("the title is escaped, never markup", () => {
    const page = build("---\ntitle: <b> & \"x\"\n---\nText\n");
    assert.equal(page.title, '<b> & "x"');
    assert.match(page.html, /<h1>&#x3C;b> &#x26; "x"<\/h1>/);
    assert.match(page.html, /aria-label="<b> &#x26; &#x22;x&#x22;"/);
  });
});

describe("lead and sections", () => {
  test("the nodes before the first ## form the lead", () => {
    const page = build("# T\n\nFirst.\n\nSecond.\n\n## One\n\nBody\n");
    assert.match(page.html, /<main><div class="ld-lead"><p data-src="\d+-\d+">First\.<\/p>\s*<p data-src="\d+-\d+">Second\.<\/p><\/div><section class="ld-section" id="one">/);
  });

  test("no lead when nothing comes before the first ##", () => {
    const page = build("# T\n\n## One\n\nBody\n");
    assert.doesNotMatch(page.html, /ld-lead/);
  });

  test("with no ## everything is the lead and there is no section", () => {
    const page = build("# T\n\nJust text.\n");
    assert.match(page.html, /<div class="ld-lead">/);
    assert.deepEqual(sectionIds(page.html), []);
  });

  test("a section holds its ## and everything up to the next ##, and the ## loses its id", () => {
    const page = build("# T\n\n## One\n\nA\n\n### Sub\n\nB\n\n## Two\n\nC\n");
    assert.match(
      page.html,
      /<section class="ld-section" id="one"><h2 data-src="\d+-\d+">One<\/h2>\s*<p[^>]*>A<\/p>\s*<h3 id="sub"[^>]*>Sub<\/h3>\s*<p[^>]*>B<\/p><\/section><section class="ld-section" id="two"><h2 data-src="\d+-\d+">Two<\/h2>\s*<p[^>]*>C<\/p><\/section>/,
    );
    assert.doesNotMatch(page.html, /<h2 id=/);
  });

  test("anchors: accents dropped, lowercased, runs of other characters become -", () => {
    const page = build("## Première étape: Ça, marche!\n\n## ---\n\n## !!!\n");
    assert.deepEqual(sectionIds(page.html), ["premiere-etape-ca-marche", "section", "section-2"]);
  });

  test("a repeated heading gets -2, -3", () => {
    const page = build("## Première\n\n## Première\n\n## première\n");
    assert.deepEqual(sectionIds(page.html), ["premiere", "premiere-2", "premiere-3"]);
  });

  test("the anchor leaves Tag markers out", () => {
    const page = build("## Plan <draft> now\n");
    assert.deepEqual(sectionIds(page.html), ["plan-now"]);
  });

  test("a ## inside a quote or a code block does not start a section", () => {
    const page = build("# T\n\n> ## Quoted\n\n```md\n## Fenced\n```\n\n## Real\n\nText\n");
    assert.deepEqual(sectionIds(page.html), ["real"]);
    assert.match(page.html, /<div class="ld-lead"><blockquote[^>]*>\s*<h2[^>]*>Quoted<\/h2>/);
  });
});

describe("table of contents", () => {
  test("one item per section, with the heading text and no markers", () => {
    const page = build("# T\n\n## One <draft>\n\n## *Two*\n");
    assert.match(
      page.html,
      /<nav class="sheet-nav" aria-label="T"><ol><li><a role="link" tabindex="0" data-anchor="one">One<\/a><\/li><li><a role="link" tabindex="0" data-anchor="two">Two<\/a><\/li><\/ol><\/nav>/,
    );
  });

  test("the nav is empty without a section, so nav:empty hides it", () => {
    assert.match(build("# T\n\nText\n").html, /<nav class="sheet-nav" aria-label="T"><\/nav>/);
  });
});

describe("templates", () => {
  test("the article uses its own header and nav classes", () => {
    const page = build("# T\n\n## One\n", { template: ARTICLE });
    assert.match(page.html, /^<header class="article-header"><h1>T<\/h1><\/header><div class="layout"><nav class="article-nav" aria-label="T">.*<\/nav><main>.*<\/main><\/div>$/s);
  });

  test("the css is the template's, then the shared page styles", () => {
    const page = build("# T\n", { template: ARTICLE });
    assert.ok(page.css.startsWith(ARTICLE.css));
    assert.ok(page.css.indexOf(".ld-callout-header") > ARTICLE.css.length);
    assert.match(page.css, /\.ld-columns \{/);
    assert.match(page.css, /\.ld-card-bristol \{/);
    assert.match(page.css, /\.ld-card-deck \{/);
    assert.match(page.css, /\.ld-compare \{/);
    assert.match(page.css, /\.ld-kanban \{/);
    assert.match(page.css, /\.image-missing \{/);
    assert.match(page.css, /\.ld-tag-marker \{/);
  });

  test("the css has no :root, html or body selector and no dark rules", () => {
    for (const template of [SHEET, ARTICLE]) {
      const css = build("# T\n", { template }).css;
      assert.doesNotMatch(css, /^\s*(:root|html|body)\b/m);
      assert.doesNotMatch(css, /data-mode|\.document\b/);
    }
  });

  test("the language is the Document's, null without one", () => {
    assert.equal(build("---\nlanguage: fr\n---\n# T\n").language, "fr");
    assert.equal(build("# T\n").language, null);
  });
});

describe("directives, footnotes and markers come out as in the reading view", () => {
  test("a callout, a column layout and a Tag marker", () => {
    const page = build("## One\n\n<!-- quote-type: info -->\n> Careful\n\n<!-- layout-columns -->\nLeft\n<!-- column -->\nRight\n<!-- /layout-columns -->\n\nA <todo> here\n");
    assert.match(page.html, /<blockquote class="ld-callout ld-callout-info"/);
    assert.match(page.html, /<div class="ld-columns"/);
    assert.match(page.html, /<mark class="ld-tag-marker"/);
  });

  test("a card, in its style and width", () => {
    const page = build("## One\n\n<!-- card: Recipe | style: deck | width: 1/2 -->\n\nStep\n\n<!-- /card -->\n");
    assert.match(page.html, /<div class="ld-card ld-card-deck ld-card-width-half"[^>]*><div class="ld-card-title">Recipe<\/div><div class="ld-card-body"><p[^>]*>Step<\/p><\/div><\/div>/);
  });

  test("footnotes follow the last section", () => {
    const page = build("## One\n\nText[^1]\n\n[^1]: Note\n");
    assert.match(page.html, /<section data-footnotes class="footnotes">/);
    assert.match(page.html, /Note/);
  });

  test("raw HTML never comes out, so no script", () => {
    const page = build("## One\n\n<script>alert(1)</script>\n\nText\n");
    assert.doesNotMatch(page.html, /<script/i);
  });
});

describe("view mode", () => {
  const SOURCE = [
    "# T",
    "",
    "## One",
    "",
    "[other](other.md#part) [file](files/a.pdf) [up](#one) [ext](https://example.com/x) [mail](mailto:a@b.c) [bad](javascript:alert(1))",
    "",
    "![alt](images/a.png)",
    "",
    "## Two",
  ].join("\n");

  test("no href other than an external one appears anywhere, the table of contents included", () => {
    const page = build(SOURCE);
    const hrefs = [...page.html.matchAll(/\shref="([^"]*)"/g)].map((match) => match[1]);
    assert.deepEqual(hrefs, ["https://example.com/x", "mailto:a@b.c"]);
  });

  test("links keep the reading view's form plus data-md, and blocks and images keep their data attributes", () => {
    const page = build(SOURCE, { path: "notes/page.md" });
    assert.match(page.html, /<a role="link" tabindex="0" data-doc="notes\/other\.md" data-anchor="part" data-md="other\.md#part">other<\/a>/);
    assert.match(page.html, /<a role="link" tabindex="0" data-file="notes\/files\/a\.pdf" data-md="files\/a\.pdf">file<\/a>/);
    assert.match(page.html, /<a role="link" tabindex="0" data-anchor="one" data-md="#one">up<\/a>/);
    assert.match(page.html, /<img data-image="notes\/images\/a\.png" alt="alt" data-md="images\/a\.png">/);
    assert.doesNotMatch(page.html, /<img[^>]* src=/);
    assert.match(page.html, /<p data-src="\d+-\d+">/);
  });

  test("the images the page shows are listed once each, in order", () => {
    const page = build("![a](images/a.png)\n\n![b](b.png)\n\n![a again](images/a.png)\n\n![web](https://example.com/w.png)\n", { path: "n/p.md" });
    assert.deepEqual(page.images, ["n/images/a.png", "n/b.png"]);
  });

  test("a Mermaid block stays a placeholder holding its source", () => {
    const page = build("```mermaid\ngraph TD; A-->B\n```\n");
    assert.match(page.html, /<div class="ld-mermaid" data-mermaid="" data-src="\d+-\d+">graph TD; A-->B<\/div>/);
  });
});

describe("standalone mode", () => {
  const standalone = (images: Record<string, string> = {}, diagrams: string[] = []): Standalone => ({ images, diagrams });

  test("the table of contents and anchor links get an href to the section", () => {
    const page = build("# T\n\n## Première partie\n\nSee [here](#première-partie) and [there](#sub).\n\n### Sub\n", { standalone: standalone() });
    assert.match(page.html, /<nav[^>]*><ol><li><a href="#premiere-partie">Première partie<\/a><\/li><\/ol><\/nav>/);
    assert.match(page.html, /<a href="#premiere-partie">here<\/a>/);
    assert.match(page.html, /<a href="#sub">there<\/a>/);
    assert.doesNotMatch(page.html, /role="link"|data-anchor/);
  });

  test("links to other Documents or files become their text in a span", () => {
    const page = build("## One\n\n[other *doc*](other.md#part) and [file](a.pdf) and [web](https://example.com/x)\n", { standalone: standalone() });
    assert.match(page.html, /<span>other <em>doc<\/em><\/span> and <span>file<\/span> and /);
    assert.match(page.html, /<a href="https:\/\/example\.com\/x" target="_blank" rel="noopener noreferrer">web<\/a>/);
    assert.doesNotMatch(page.html, /data-doc|data-file/);
  });

  test("an image gets its data URL and loses data-image", () => {
    const page = build("## One\n\n![alt](images/a.png)\n", { path: "n/p.md", standalone: standalone({ "n/images/a.png": "data:image/png;base64,AAAA" }) });
    assert.match(page.html, /<img alt="alt" src="data:image\/png;base64,AAAA">/);
    assert.doesNotMatch(page.html, /data-image/);
    assert.deepEqual(page.images, ["n/images/a.png"]);
  });

  test("an image missing from the map becomes the missing-image span with its alt text", () => {
    const page = build("## One\n\n![Lost one](images/a.png)\n", { path: "n/p.md", standalone: standalone() });
    assert.match(page.html, /<span class="image-missing" role="img" aria-label="Lost one">Lost one<\/span>/);
    assert.doesNotMatch(page.html, /<img/);
  });

  test("Mermaid placeholders are replaced in document order by the drawn diagrams", () => {
    const page = build("## One\n\n```mermaid\nA\n```\n\n```mermaid\nB\n```\n", { standalone: standalone({}, ['<svg id="first"></svg>', '<svg id="second"></svg>']) });
    assert.match(page.html, /<svg id="first"><\/svg>[\s\S]*<svg id="second"><\/svg>/);
    assert.doesNotMatch(page.html, /data-mermaid/);
  });

  test("a diagram that was not drawn falls back to a pre with its source", () => {
    const page = build("## One\n\n```mermaid\nA\n```\n\n```mermaid\nB-->C\n```\n", { standalone: standalone({}, ["<svg></svg>"]) });
    assert.match(page.html, /<svg><\/svg>[\s\S]*<pre><code>B-->C<\/code><\/pre>/);
  });

  test("a column layout carries no source range", () => {
    const page = build("## One\n\n<!-- layout-columns -->\n<!-- col -->\nLeft\n<!-- col -->\nRight\n<!-- /layout-columns -->\n", { standalone: standalone() });
    assert.match(page.html, /<div class="ld-columns"/);
    assert.doesNotMatch(page.html, /data-src/);
  });

  test("source ranges are removed", () => {
    const page = build("# T\n\nLead <todo>\n\n## One\n\n- a\n", { standalone: standalone() });
    assert.doesNotMatch(page.html, /data-src/);
    assert.match(page.html, /<mark class="ld-tag-marker"/);
  });
});

describe("standaloneHtml", () => {
  const file = (text: string) => standaloneHtml(build(text, { template: ARTICLE, standalone: { images: {}, diagrams: [] } }));

  test("a whole document with the language, the title and one inlined style", () => {
    const html = file("---\nlanguage: fr\ntitle: Mon <titre>\n---\n## Un\n\nTexte\n");
    assert.match(html, /^<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n/);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(html, /<title>Mon &lt;titre&gt;<\/title>/);
    assert.equal(html.match(/<style>/g)?.length, 1);
    assert.match(html, /<style>\n[\s\S]*--accent: #1d4e89;[\s\S]*<\/style>/);
    assert.match(html, /<body class="ld-html-page">\n<header class="article-header">/);
    assert.match(html, /<\/body>\n<\/html>\n$/);
  });

  test("no lang without a language, no script, no external stylesheet", () => {
    const html = file("# T\n\n<script>x</script>\n\n## One\n");
    assert.match(html, /<html>\n/);
    assert.doesNotMatch(html, /<script|<link/i);
  });
});

describe("standalone footnotes", () => {
  test("a footnote reference keeps its id, so the back-link reaches it", () => {
    const model = parseDocument("# T\n\nText[^1].\n\n[^1]: Note.\n", "t.md");
    const page = htmlPage(model, "t.md", htmlTemplateOf("article")!, {}, { softBreaks: false, standalone: { images: {}, diagrams: [] } });
    const ref = /<a [^>]*href="#ld-fn-1"[^>]*>/.exec(page.html)?.[0] ?? "";
    assert.match(ref, /id="ld-fnref-1"/);
    assert.doesNotMatch(ref, /role=|tabindex=/);
    assert.match(page.html, /href="#ld-fnref-1"/);
  });
});

describe("links and images as written (editing)", () => {
  const text = "# T\n\n[A](other.md) ![x](images/a.png)\n\n## S\n\nText\n";
  test("the view page keeps data-md", () => {
    assert.match(build(text).html, /data-md="other.md"/);
    assert.match(build(text).html, /data-md="images\/a.png"/);
  });
  test("the standalone page does not", () => {
    const html = build(text, { standalone: { images: { "notes/images/a.png": "data:x" }, diagrams: [] } }).html;
    assert.doesNotMatch(html, /data-md/);
  });
});
