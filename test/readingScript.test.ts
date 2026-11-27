// The reading script: what is spoken and highlighted for a rendered Document, plus languages and voices.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseDocument } from "../src/lib/document.ts";
import { renderDocumentTree } from "../src/lib/render.ts";
import {
  announcementLanguage,
  chooseVoice,
  languagesWithVoice,
  piecesOf,
  readingCharacters,
  readingLanguage,
  readingScript,
  readingStart,
  sentencesOf,
  voicesFor,
  type ReadingLabels,
  type ReadingNode,
} from "../src/lib/readingScript.ts";

const labels: ReadingLabels = { code: "Code block.", table: "Table.", diagram: "Diagram.", image: "Image: {alt}.", imageNoAlt: "Image." };

type Hast = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: Hast[] };

/** A hast node seen as a ReadingNode: attribute names are mapped back to their hast property names. */
function wrap(node: Hast): ReadingNode {
  if (node.type === "text") return { nodeType: 3, nodeName: "#text", childNodes: [], data: node.value };
  const properties = node.properties ?? {};
  return {
    nodeType: 1,
    nodeName: (node.tagName ?? "article").toUpperCase(),
    childNodes: (node.children ?? []).map(wrap),
    getAttribute(name) {
      const key = name === "class" ? "className" : name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      const value = properties[key];
      if (value === undefined || value === null || value === false) return null;
      return Array.isArray(value) ? value.join(" ") : value === true ? "" : String(value);
    },
  };
}

const rendered = (markdown: string) =>
  wrap(renderDocumentTree(parseDocument(markdown, "doc.md"), "doc.md", {}, { softBreaks: true }) as Hast);
const script = (markdown: string, lang = "en") => readingScript(rendered(markdown), lang, labels);
const h = (tag: string, attrs: Record<string, string> = {}, ...children: (string | ReadingNode)[]): ReadingNode => ({
  nodeType: 1,
  nodeName: tag.toUpperCase(),
  getAttribute: (name) => attrs[name] ?? null,
  childNodes: children.map((c) => (typeof c === "string" ? { nodeType: 3, nodeName: "#text", childNodes: [], data: c } : c)),
});

describe("the walk", () => {
  test("order and kinds of a whole Document", () => {
    const segments = script(
      [
        "# Title",
        "",
        "A paragraph.",
        "",
        "- one",
        "  - nested",
        "- two",
        "",
        "> quoted",
        "",
        "```js",
        "const a = 1;",
        "```",
        "",
        "| a | b |",
        "|---|---|",
        "| 1 | 2 |",
        "",
        "```mermaid",
        "graph TD",
        "```",
        "",
        "![a cat](cat.png)",
        "",
        "![](none.png)",
        "",
        "Last.",
      ].join("\n"),
    );
    assert.deepEqual(
      segments.map((s) => [s.kind, s.announced, s.text]),
      [
        ["heading", false, "Title"],
        ["text", false, "A paragraph."],
        ["text", false, "one"],
        ["text", false, "nested"],
        ["text", false, "two"],
        ["text", false, "quoted"],
        ["code", true, "Code block."],
        ["table", true, "Table."],
        ["diagram", true, "Diagram."],
        ["image", true, "Image: a cat."],
        ["image", true, "Image."],
        ["text", false, "Last."],
      ],
    );
  });

  test("an announced segment is one sentence, spoken as its label", () => {
    const [code] = script("```\nx\n```\n");
    assert.deepEqual(code.sentences, [{ text: "Code block.", start: 0, end: 11, pieces: ["Code block."] }]);
  });

  test("a footnote marker is skipped and its text is read as a paragraph", () => {
    const segments = script("Claim[^1] stands.\n\n[^1]: The note.\n");
    const texts = segments.map((s) => s.text);
    assert.ok(texts.includes("Claim stands."), texts.join("|"));
    assert.ok(texts.includes("The note."), texts.join("|"));
    assert.ok(!texts.some((t) => t.includes("↩")));
  });

  test("a soft line break splits sentences", () => {
    const [segment] = script("first line\nsecond line\n");
    assert.equal(segment.text, "first line\nsecond line");
    assert.deepEqual(
      segment.sentences.map((s) => [s.text, segment.text.slice(s.start, s.end)]),
      [
        ["first line", "first line"],
        ["second line", "second line"],
      ],
    );
  });

  test("an inline image inside a paragraph with text contributes nothing", () => {
    const segments = readingScript(h("div", {}, h("p", {}, "See ", h("img", { alt: "x" }), " here.")), "en", labels);
    assert.deepEqual(segments.map((s) => [s.kind, s.text]), [["text", "See here."]]);
  });

  test("a bare img, an image-missing element, buttons and svg", () => {
    const root = h(
      "div",
      {},
      h("img", { alt: "logo" }),
      h("span", { class: "image-missing", "aria-label": "gone.png" }),
      h("p", {}, "Text", h("button", {}, "Copy"), h("svg", {}, "icon")),
    );
    assert.deepEqual(readingScript(root, "en", labels).map((s) => [s.kind, s.text]), [
      ["image", "Image: logo."],
      ["image", "Image: gone.png."],
      ["text", "Text"],
    ]);
  });

  test("details: the summary first, then the content; hr skipped", () => {
    const root = h("div", {}, h("details", {}, h("summary", {}, "More"), h("p", {}, "Hidden text."), h("hr")), h("hr"));
    assert.deepEqual(readingScript(root, "en", labels).map((s) => s.text), ["More", "Hidden text."]);
  });

  test("a pre wrapped in a div, and a table in an overflow wrapper", () => {
    const root = h("div", {}, h("div", {}, h("pre", {}, "x")), h("div", { class: "overflow-x-auto" }, h("table")));
    assert.deepEqual(readingScript(root, "en", labels).map((s) => s.kind), ["code", "table"]);
  });
});

describe("readingCharacters", () => {
  test("each character of the text comes from the matching character of a text node", () => {
    const segments = script("Some *emphasised* text[^1] here.\nNext   line.\n\n- item with `code`\n\n[^1]: note\n");
    for (const segment of segments) {
      const characters = readingCharacters(segment.element);
      assert.equal(characters.length, segment.text.length, segment.text);
      for (const [i, c] of characters.entries()) {
        const source = c.node.data![c.offset];
        if (segment.text[i] === " " || segment.text[i] === "\n") continue;
        assert.equal(source, segment.text[i], `${segment.text} @${i}`);
      }
    }
  });

  test("a line break maps to the character before it", () => {
    const [segment] = script("ab\ncd\n");
    const characters = readingCharacters(segment.element);
    assert.equal(segment.text, "ab\ncd");
    assert.deepEqual(characters[2], characters[1]);
  });
});

describe("sentences", () => {
  test("French sentences", () => {
    assert.deepEqual(sentencesOf("Bonjour. Ça va ? Oui.", "fr"), [
      { start: 0, end: 8 },
      { start: 9, end: 16 },
      { start: 17, end: 21 },
    ]);
  });

  test("an invalid locale falls back to English", () => {
    assert.equal(sentencesOf("One. Two.", "not a locale!!").length, 2);
  });

  test("a sentence keeps its offsets and is one piece when short", () => {
    const [segment] = script("Hello there. Bye.\n");
    assert.deepEqual(segment.sentences, [
      { text: "Hello there.", start: 0, end: 12, pieces: ["Hello there."] },
      { text: "Bye.", start: 13, end: 17, pieces: ["Bye."] },
    ]);
  });

  test("an overlong sentence stays one Sentence with several pieces", () => {
    const long = `${"word, ".repeat(60)}end.`;
    const [segment] = script(`${long}\n`);
    assert.equal(segment.sentences.length, 1);
    assert.ok(segment.sentences[0].pieces.length > 1);
  });
});

describe("piecesOf", () => {
  test("cuts at the last comma before the limit", () => {
    assert.deepEqual(piecesOf("aaaa, bbbb cccc", 10), ["aaaa,", "bbbb cccc"]);
  });
  test("without punctuation cuts at the last space", () => {
    assert.deepEqual(piecesOf("aaaa bbbb cccc", 10), ["aaaa bbbb", "cccc"]);
  });
  test("without space cuts hard", () => {
    assert.deepEqual(piecesOf("abcdefghijkl", 5), ["abcde", "fghij", "kl"]);
  });
  test("a short sentence is one piece; the default limit is 200", () => {
    assert.deepEqual(piecesOf("Short."), ["Short."]);
    assert.ok(piecesOf("x ".repeat(300)).every((p) => p.length <= 200));
  });
});

describe("languages and voices", () => {
  test("readingLanguage: aliases, case, any code, none", () => {
    assert.equal(readingLanguage({ Language: " English " }), "en");
    assert.equal(readingLanguage({ langue: "Français" }), "fr");
    assert.equal(readingLanguage({ lang: "FRENCH" }), "fr");
    assert.equal(readingLanguage({ locale: "es-MX" }), "es-MX");
    assert.equal(readingLanguage({ lang: "de" }), "de");
    assert.equal(readingLanguage({ language: "  ", lang: "fr" }), "fr");
    assert.equal(readingLanguage({ language: 3, title: "x" }), null);
    assert.equal(readingLanguage({}), null);
  });

  test("announcementLanguage", () => {
    assert.equal(announcementLanguage("fr-CA", "en"), "fr");
    assert.equal(announcementLanguage("EN", "fr"), "en");
    assert.equal(announcementLanguage("de", "fr"), "fr");
    assert.equal(announcementLanguage("es-MX", "en"), "en");
  });

  const voices = [
    { name: "A", lang: "en-GB", default: false },
    { name: "B", lang: "en_US", default: false },
    { name: "C", lang: "en-US", default: true },
    { name: "D", lang: "fr-FR", default: true },
    { name: "E", lang: "de-DE", default: false },
    { name: "F", lang: "en-GB", default: true },
  ];

  test("voicesFor: exact language first, then same primary, default first in each", () => {
    assert.deepEqual(voicesFor("en-GB", voices).map((v) => v.name), ["F", "A", "C", "B"]);
    assert.deepEqual(voicesFor("EN", voices).map((v) => v.name), ["C", "F", "A", "B"]);
    assert.deepEqual(voicesFor("ja", voices), []);
  });

  test("languagesWithVoice: interface language first, the rest sorted", () => {
    assert.deepEqual(languagesWithVoice(voices, "fr"), ["fr", "de", "en"]);
    assert.deepEqual(languagesWithVoice(voices, "en"), ["en", "de", "fr"]);
    assert.deepEqual(languagesWithVoice(voices.slice(0, 2), "fr"), ["en"]);
  });
});

/** The text node containing `needle`, and the offset of `needle` in it. */
function find(root: ReadingNode, needle: string): { node: ReadingNode; offset: number } {
  const visit = (node: ReadingNode): { node: ReadingNode; offset: number } | null => {
    if (node.nodeType === 3) {
      const offset = (node.data ?? "").indexOf(needle);
      return offset >= 0 ? { node, offset } : null;
    }
    for (const child of Array.from(node.childNodes)) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };
  const found = visit(root);
  assert.ok(found, `no text node contains "${needle}"`);
  return found;
}

describe("starting from a selection", () => {
  const french = "Une première phrase. Une seconde phrase utile. Et la suite.";

  test("a selection inside a word starts at the beginning of that word, the sentence keeps only its end", () => {
    const root = rendered(french);
    const original = readingScript(root, "fr", labels);
    const start = readingStart(root, original, find(root, "conde"));
    assert.ok(start);
    assert.deepEqual(start.from, { segment: 0, sentence: 1 });
    const sentences = start.script[0].sentences;
    assert.equal(sentences[1].text, "seconde phrase utile.");
    assert.deepEqual(sentences[1].pieces, ["seconde phrase utile."]);
    assert.equal(sentences[1].start, 25);
    assert.equal(sentences[1].end, 46);
    assert.deepEqual(sentences[0], original[0].sentences[0]);
    assert.deepEqual(sentences[2], original[0].sentences[2]);
  });

  test("a selection inside a code block starts with that block's announcement", () => {
    const root = rendered("Avant.\n\n```js\nconst a = 1;\n```\n\nAprès.");
    const original = readingScript(root, "fr", labels);
    const start = readingStart(root, original, find(root, "const"));
    assert.ok(start);
    assert.deepEqual(start.from, { segment: 1, sentence: 0 });
    assert.equal(start.script[1].sentences[0].text, "Code block.");
    assert.deepEqual(start.script, original);
  });

  test("a selection on a footnote marker starts at the next readable text", () => {
    const root = rendered("Un mot[^1] la suite.\n\n[^1]: La note.");
    const original = readingScript(root, "fr", labels);
    const start = readingStart(root, original, find(root, "1"));
    assert.ok(start);
    assert.equal(original[0].text, "Un mot la suite.");
    const { segment, sentence } = start.from;
    assert.equal(start.script[segment].sentences[sentence].text, "la suite.");
  });

  test("a selection on unread text just before an announced block starts with its announcement", () => {
    const skipped = h("button", {}, "Copy");
    const root = h("article", {}, h("p", {}, "Avant."), h("div", {}, skipped), h("pre", {}, "const a = 1;"), h("p", {}, "Après."));
    const original = readingScript(root, "fr", labels);
    const start = readingStart(root, original, find(skipped, "Copy"));
    assert.ok(start);
    assert.deepEqual(start.from, { segment: 1, sentence: 0 });
    assert.equal(start.script[1].text, "Code block.");
  });

  test("a point on the whitespace between two sentences starts at the next sentence", () => {
    const root = rendered(french);
    const original = readingScript(root, "fr", labels);
    const space = find(root, " Une seconde");
    const start = readingStart(root, original, space);
    assert.ok(start);
    assert.deepEqual(start.from, { segment: 0, sentence: 1 });
    assert.equal(start.script[0].sentences[1].text, "Une seconde phrase utile.");
    assert.equal(start.script[0].sentences[1].start, 21);
  });

  test("an element boundary means just before that child", () => {
    const paragraph = h("p", {}, "Un. ", h("em", {}, "Deux"), " trois.");
    const root = h("article", {}, paragraph);
    const original = readingScript(root, "en", labels);
    const start = readingStart(root, original, { node: paragraph, offset: 1 });
    assert.ok(start);
    assert.deepEqual(start.from, { segment: 0, sentence: 1 });
    assert.equal(start.script[0].sentences[1].text, "Deux trois.");
    const end = readingStart(root, original, { node: paragraph, offset: 3 });
    assert.equal(end, null);
  });

  test("an element boundary of the root itself starts at the first readable text", () => {
    const root = h("article", {}, h("p", {}, "Un."), h("p", {}, "Deux."));
    const start = readingStart(root, readingScript(root, "en", labels), { node: root, offset: 1 });
    assert.ok(start);
    assert.deepEqual(start.from, { segment: 1, sentence: 0 });
  });

  test("a node outside the root starts nowhere: the reading begins at the start", () => {
    const root = h("article", {}, h("p", {}, "Un."));
    const title = h("h1", {}, "Titre");
    assert.equal(readingStart(root, readingScript(root, "en", labels), { node: title, offset: 0 }), null);
  });

  test("a point after the last readable text starts nowhere", () => {
    const root = rendered("Un. Deux.");
    const original = readingScript(root, "en", labels);
    const found = find(root, "Deux.");
    assert.equal(readingStart(root, original, { node: found.node, offset: "Un. Deux.".length }), null);
  });

  test("a word after an apostrophe starts after it", () => {
    const root = h("article", {}, h("p", {}, "Voir l'arbre vert."));
    const start = readingStart(root, readingScript(root, "fr", labels), find(root, "rbre"));
    assert.ok(start);
    assert.equal(start.script[0].sentences[0].text, "arbre vert.");
  });

  test("a trimmed overlong sentence gets its pieces recomputed", () => {
    const long = Array.from({ length: 60 }, (_, i) => `Mot${String(i).padStart(2, "0")}`).join(" ") + ".";
    const root = h("article", {}, h("p", {}, "Court. " + long));
    const original = readingScript(root, "en", labels);
    assert.ok(original[0].sentences[1].pieces.length > 1);
    const start = readingStart(root, original, find(root, "ot50"));
    assert.ok(start);
    const trimmed = start.script[0].sentences[1];
    assert.equal(trimmed.text, "Mot50 Mot51 Mot52 Mot53 Mot54 Mot55 Mot56 Mot57 Mot58 Mot59.");
    assert.deepEqual(trimmed.pieces, [trimmed.text]);
  });

  test("the input script is not mutated", () => {
    const root = rendered(french);
    const original = readingScript(root, "fr", labels);
    const copy = structuredClone(original.map(({ element: _e, ...rest }) => rest));
    readingStart(root, original, find(root, "conde"));
    assert.deepEqual(original.map(({ element: _e, ...rest }) => rest), copy);
  });
});

describe("chooseVoice", () => {
  const voices = [
    { name: "Anglais", lang: "en-US", default: true },
    { name: "Thomas", lang: "fr-FR", default: false },
    { name: "Amelie", lang: "fr-CA", default: true },
  ];

  test("the kept voice is used when it reads the language", () => {
    assert.equal(chooseVoice("fr", voices, "Thomas")?.name, "Thomas");
  });

  test("a kept voice that is missing or reads another language gives the default first voice", () => {
    assert.equal(chooseVoice("fr", voices, "Disparue")?.name, "Amelie");
    assert.equal(chooseVoice("fr", voices, "Anglais")?.name, "Amelie");
    assert.equal(chooseVoice("fr", voices, undefined)?.name, "Amelie");
  });

  test("no voice reads the language: null", () => {
    assert.equal(chooseVoice("de", voices, "Thomas"), null);
  });
});
