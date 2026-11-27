// Snippet blocks: locating the snippet a click means, and editing it (spec: Documents and snippets, items 3 and 4).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type ConnectedModule, connect, TesselloError } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { parseDocument } from "../src/lib/document.ts";
import { applyEdits, type TextRange } from "../src/lib/edits.ts";
import { openProject } from "../src/lib/project.ts";
import { renderDocument } from "../src/lib/render.ts";
import { buildSnippet, parseSnippet } from "../src/lib/snippets.ts";
import { deleteBlock, insertAfter, replaceBlock, saveSnippet, snippetAt, snippetBlocks } from "../src/lib/snippetBlocks.ts";

/** The article the View shows for `text`. */
const render = (text: string) => renderDocument(parseDocument(text, "a.md"), "a.md", {}, { softBreaks: false });

/** The data-src of the first element of `html` matching the opening-tag pattern `tag` (a regular expression source such as `h1` or `div class="ld-compare"`). */
function srcOf(html: string, tag: string, nth = 0): TextRange {
  const found = [...html.matchAll(new RegExp(`<${tag}(?=[\\s>])[^>]*? data-src="(\\d+)-(\\d+)"`, "g"))][nth];
  assert.ok(found, `no <${tag}> with a data-src in ${html}`);
  return { from: Number(found[1]), to: Number(found[2]) };
}

const insertedAfter = (text: string, after: TextRange | null, markdown: string) => applyEdits(text, [insertAfter(text, after, markdown)]);
const replaced = (text: string, block: { range: TextRange; prefix: string }, markdown: string) => applyEdits(text, [replaceBlock(text, block, markdown)]);
const deleted = (text: string, block: { range: TextRange; prefix: string }) => applyEdits(text, [deleteBlock(text, block)]);

describe("locating the snippet of a click", () => {
  test("a heading of the article is the block whose range is its data-src, offsets counting the frontmatter", () => {
    // "---\ntitle: T\n---\n" is 17 characters, so "# Hi" is 17-21 and "Some text" is 23-32.
    const text = "---\ntitle: T\n---\n# Hi\n\nSome text\n";

    const block = snippetAt(text, [srcOf(render(text), "h1")]);

    assert.deepEqual(block, { kind: "heading-1", element: { from: 17, to: 21 }, range: { from: 17, to: 21 }, prefix: "", markdown: "# Hi" });
    assert.equal(snippetAt(text, [{ from: 23, to: 32 }]), null);
  });

  test("a top-level block is recognized from its Markdown shape", () => {
    const sources = [
      "# One", "## Two", "### Three", "#### Four", "##### Five", "---", "- a\n- b", "1. x\n2. y", "> q",
      "[Go](https://x.y)", "[Doc](?doc=a%2Fb)", "[Anchor](#top)", "[Both](?doc=a%2Fb#top)", "![alt](img.png)",
      '<a href="https://x.y" target="_blank">T</a>', '<span style="color:#3b82f6;">hi</span>', "Plain paragraph", "Setext\n======", "    indented code",
      "```js\ncode\n```", "```text\n├── a\n└── b\n```", "| a |\n| --- |\n| 1 |",
    ];
    const text = `${sources.join("\n\n")}\n`;
    const expected = [
      "heading-1", "heading-2", "heading-3", "heading-4", null, "separator", "unordered-list", "ordered-list", "blockquote",
      "link", "doc-link", "anchor-link", "anchor-doc-link", "image", "link", "colored-text", null, null, null,
      "code-block", "tree", "table",
    ];

    const found = snippetBlocks(text);

    assert.deepEqual(found.map((each) => each.kind), expected.filter((kind) => kind !== null));
    // Each block's Markdown is its source, as written.
    assert.deepEqual(found.map((each) => each.markdown), sources.filter((_, index) => expected[index] !== null));
    // Each block's element is where the article puts its data-src.
    const html = render(text);
    assert.deepEqual(srcOf(html, "p", 1), found.find((each) => each.kind === "link")!.element);
    assert.deepEqual(srcOf(html, "table"), found.at(-1)!.element);
  });

  test("a Kanban block, an emoji line, text in a list item and a paragraph with more than a link are not snippets", () => {
    const text = '<div data-ld-kanban data-columns="A" data-colors="sky"></div>\n\nSee [Go](https://x.y) now\n\n- # In a list\n\n~~~js\ncode\n~~~\n';

    assert.deepEqual(snippetBlocks(text).map((each) => each.kind), ["unordered-list"]);
  });

  test("a snippet's directive comments belong to its range, not to its element", () => {
    // "Intro" is 0-5; the comment "<!-- image-width: 1/2 -->" is 7-32; "![alt](a.png)" is 33-46.
    const text = "Intro\n\n<!-- image-width: 1/2 -->\n![alt](a.png)\n";

    const block = snippetAt(text, [srcOf(render(text), "p", 1)]);

    assert.deepEqual(block, {
      kind: "image",
      element: { from: 33, to: 46 },
      range: { from: 7, to: 46 },
      prefix: "",
      markdown: "<!-- image-width: 1/2 -->\n![alt](a.png)",
    });
  });

  test("a code block in a list item is edited with the item's indentation removed", () => {
    // "- item\n" is 0-6 (newline at 6), the blank line 7, "  ```js" 8-15, "  let a;" 16-24, "  ```" 25-30.
    const text = "- item\n\n  ```js\n  let a;\n  ```\n";
    const html = render(text);

    const block = snippetAt(text, [srcOf(html, "pre"), srcOf(html, "li"), srcOf(html, "ul")]);

    assert.deepEqual(block, { kind: "code-block", element: { from: 10, to: 30 }, range: { from: 10, to: 30 }, prefix: "  ", markdown: "```js\nlet a;\n```" });
  });

  test("a code block in a quote keeps its quote markers out of the Markdown; a tree is told by its drawing", () => {
    // Lines of 9, 7, 1, 7 and 5 characters: the fence runs from 2 to 33.
    const text = "> ```text\n> ├── a\n>\n> └── b\n> ```\n";

    const block = snippetAt(text, [{ from: 2, to: 33 }, { from: 0, to: 33 }]);

    assert.deepEqual(block, { kind: "tree", element: { from: 2, to: 33 }, range: { from: 2, to: 33 }, prefix: "> ", markdown: "```text\n├── a\n\n└── b\n```" });
  });

  test("a table directly in a quote is edited as a table; the quote's own range edits the quote", () => {
    // Quote lines: 31, 11, 15 and 11 characters. The comment is 2-31, the table 34-71.
    const text = "> <!-- table-style: striped -->\n> | a | b |\n> | --- | --- |\n> | 1 | 2 |\n";
    const quote = srcOf(render(text), "blockquote");

    assert.deepEqual(snippetAt(text, [{ from: 34, to: 71 }, quote]), {
      kind: "table",
      element: { from: 34, to: 71 },
      range: { from: 2, to: 71 },
      prefix: "> ",
      markdown: "<!-- table-style: striped -->\n| a | b |\n| --- | --- |\n| 1 | 2 |",
    });
    assert.equal(snippetAt(text, [quote])?.kind, "blockquote");
  });

  test("a table is not offered inside a list, nor a heading inside a quote", () => {
    assert.deepEqual(snippetBlocks("- | a |\n  | --- |\n  | 1 |\n\n> # Quoted\n").map((each) => each.kind), ["unordered-list", "blockquote"]);
  });

  test("a collapsible is edited as a whole; so is whatever sits inside it, except a code block", () => {
    // "<details>" 0-9, "<summary>Sum</summary>" 10-32, "# Inner" 34-41, "```js\nx\n```" 43-54, "</details>" 56-66.
    const text = "<details>\n<summary>Sum</summary>\n\n# Inner\n\n```js\nx\n```\n\n</details>\n";
    const html = render(text);
    const details = srcOf(html, "details");

    assert.deepEqual(details, { from: 0, to: 66 });
    assert.deepEqual(snippetAt(text, [srcOf(html, "h1"), details]), { kind: "collapsible", element: details, range: details, prefix: "", markdown: text.trimEnd() });
    assert.deepEqual(snippetAt(text, [srcOf(html, "pre"), details]), { kind: "code-block", element: { from: 43, to: 54 }, range: { from: 43, to: 54 }, prefix: "", markdown: "```js\nx\n```" });
  });

  test("of nested wrappers the outermost is the snippet", () => {
    const section = '<div style="background:#eff6ff;border-left:4px solid #3b82f6;color:#1e3a5f;padding:1rem;">\n\nIn\n\n</div>';
    const text = `<details>\n<summary>S</summary>\n\n${section}\n\n</details>\n\n${section}\n`;
    const html = render(text);
    const [outer, inner] = [srcOf(html, "details"), srcOf(html, 'div class="ld-colored-section"')];

    assert.equal(snippetAt(text, [srcOf(html, "p"), inner, outer])?.kind, "collapsible");
    assert.equal(snippetAt(text, [srcOf(html, "p"), inner])?.kind, "colored-section");
    assert.deepEqual(snippetAt(text, [inner])?.element, inner);
  });

  test("a compare block is one snippet whose text is never a snippet of its own", () => {
    // ":::compare" 0-10, "# Not a heading" 11-26, ":::" 27-30.
    const text = ":::compare\n# Not a heading\n:::\n\nAfter\n";

    const found = snippetBlocks(text);

    assert.deepEqual(found, [{ kind: "compare", element: { from: 0, to: 30 }, range: { from: 0, to: 30 }, prefix: "", markdown: ":::compare\n# Not a heading\n:::" }]);
    assert.deepEqual(srcOf(render(text), 'div class="ld-compare"'), found[0]!.element);
  });

  test("a click on a range that is no snippet's element finds nothing; the innermost snippet wins otherwise", () => {
    const text = "> Quote\n";

    assert.equal(snippetAt(text, [{ from: 1, to: 4 }]), null);
    assert.equal(snippetAt(text, []), null);
  });

  test("a Document with Windows line endings gives its Markdown with newlines", () => {
    // "# A" is 0-3, the fence 7-20.
    const text = "# A\r\n\r\n```js\r\nx\r\n```\r\n";

    assert.deepEqual(snippetBlocks(text).map((each) => [each.kind, each.range, each.markdown]), [
      ["heading-1", { from: 0, to: 3 }, "# A"],
      ["code-block", { from: 7, to: 20 }, "```js\nx\n```"],
    ]);
  });
});

describe("inserting after a block", () => {
  test("one blank line on each side, however the neighbours were separated", () => {
    assert.equal(insertedAfter("# A\n\nB\n", { from: 0, to: 3 }, "---"), "# A\n\n---\n\nB\n");
    assert.equal(insertedAfter("# A\nB\n", { from: 0, to: 3 }, "---"), "# A\n\n---\n\nB\n");
    assert.equal(insertedAfter("# A\n\n\n\nB\n", { from: 0, to: 3 }, "---"), "# A\n\n---\n\nB\n");
  });

  test("after the last block, one blank line before and a final newline after", () => {
    assert.equal(insertedAfter("# A\n", { from: 0, to: 3 }, "---"), "# A\n\n---\n");
    assert.equal(insertedAfter("# A", { from: 0, to: 3 }, "---"), "# A\n\n---\n");
    assert.equal(insertedAfter("# A\n\n\n", { from: 0, to: 3 }, "---\n"), "# A\n\n---\n");
  });

  test("with no block, at the end of the Document", () => {
    assert.equal(insertedAfter("", null, "---"), "---\n");
    assert.equal(insertedAfter("\n\n", null, "---"), "---\n");
    assert.equal(insertedAfter("# A\n\nB\n", null, "# C"), "# A\n\nB\n\n# C\n");
    assert.equal(insertedAfter("---\na: b\n---\n", null, "# C"), "---\na: b\n---\n\n# C\n");
  });

  test("the file's line endings are kept", () => {
    assert.equal(insertedAfter("# A\r\n\r\nB\r\n", { from: 0, to: 3 }, "x\ny"), "# A\r\n\r\nx\r\ny\r\n\r\nB\r\n");
    assert.equal(insertedAfter("# A\r\n", null, "x\ny"), "# A\r\n\r\nx\r\ny\r\n");
  });
});

describe("replacing a block", () => {
  test("the range's source is replaced and nothing else", () => {
    assert.equal(replaced("# A\n\nB\n", { range: { from: 0, to: 3 }, prefix: "" }, "# New"), "# New\n\nB\n");
  });

  test("the prefix goes back before every line but the first, blank lines without trailing spaces", () => {
    const inList = "- item\n\n  ```js\n  let a;\n  ```\n";
    assert.equal(replaced(inList, { range: { from: 10, to: 30 }, prefix: "  " }, "```js\nlet b;\n\nlet c;\n```"), "- item\n\n  ```js\n  let b;\n\n  let c;\n  ```\n");

    const inQuote = "> ```text\n> ├── a\n>\n> └── b\n> ```\n";
    assert.equal(replaced(inQuote, { range: { from: 2, to: 33 }, prefix: "> " }, "```text\n├── x\n\n└── y\n```"), "> ```text\n> ├── x\n>\n> └── y\n> ```\n");
  });

  test("the file's line endings are kept", () => {
    assert.equal(replaced("# A\r\n\r\nB\r\n", { range: { from: 7, to: 8 }, prefix: "" }, "x\ny"), "# A\r\n\r\nx\r\ny\r\n");
  });
});

describe("deleting a block", () => {
  const at = (from: number, to: number) => ({ range: { from, to }, prefix: "" });

  test("its neighbours keep one blank line between them", () => {
    assert.equal(deleted("# A\n\nB\n\nC\n", at(5, 6)), "# A\n\nC\n");
    assert.equal(deleted("# A\n\nB\n\nC\n", at(0, 3)), "B\n\nC\n");
    assert.equal(deleted("# A\n\n\n\nB\n\n\nC\n", at(7, 8)), "# A\n\nC\n");
  });

  test("the last block leaves the text ending with one newline; the only block leaves nothing", () => {
    assert.equal(deleted("# A\n\nB\n\nC\n", at(8, 9)), "# A\n\nB\n");
    assert.equal(deleted("# A\n\n\n\nB\n", at(7, 8)), "# A\n");
    assert.equal(deleted("# A\n", at(0, 3)), "");
    assert.equal(deleted("---\na: b\n---\n# A\n", at(13, 16)), "---\na: b\n---\n");
  });

  test("the directive comments in its range go with it", () => {
    assert.equal(deleted("<!-- image-width: 1/2 -->\n![a](b)\n\nX\n", at(0, 33)), "X\n");
  });

  test("the file's line endings are kept", () => {
    assert.equal(deleted("# A\r\n\r\nB\r\n\r\nC\r\n", at(7, 8)), "# A\r\n\r\nC\r\n");
  });
});

describe("saving a snippet change on a Project", () => {
  /** A Project opened on a folder holding `files`, with the Test Host to change its disk as an agent would. */
  async function projectOf(files: Record<string, string>, options?: { wrap?: (module: ConnectedModule) => ConnectedModule }) {
    const host = createTestHost({ module: { id: "@craftskillz/living-documentation", version: "0.0.1" }, permissions: { folders: true } });
    const disk = host.folders.create("docs", files);
    host.folders.choose(disk);
    const module = await connect({ transport: host.mount({ surface: "view" }).transport });
    const folder = (await module.folders.request())!;
    return { host, disk, project: openProject(options?.wrap?.(module) ?? module, folder) };
  }

  const DOCUMENT = "# A\n\nB\n\n# C\n";
  const heading = { range: { from: 0, to: 3 }, prefix: "" };

  test("a change on an unchanged Document is saved", async () => {
    const { host, disk, project } = await projectOf({ "a.md": DOCUMENT });
    const base = await project.read("a.md");

    const saved = await saveSnippet(project, "a.md", base, { kind: "replace", block: heading, markdown: "# Z" });

    assert.equal(saved.kind, "saved");
    assert.equal(host.folders.read(disk, "a.md"), "# Z\n\nB\n\n# C\n");
    assert.equal(saved.kind === "saved" && saved.text, "# Z\n\nB\n\n# C\n");
    assert.equal(saved.kind === "saved" && saved.version, (await project.read("a.md")).version);
  });

  test("an insert and a delete are saved the same way", async () => {
    const { host, disk, project } = await projectOf({ "a.md": DOCUMENT });

    await saveSnippet(project, "a.md", await project.read("a.md"), { kind: "insert", after: { from: 5, to: 6 }, markdown: "---" });
    assert.equal(host.folders.read(disk, "a.md"), "# A\n\nB\n\n---\n\n# C\n");

    await saveSnippet(project, "a.md", await project.read("a.md"), { kind: "delete", block: { range: { from: 5, to: 6 }, prefix: "" } });
    assert.equal(host.folders.read(disk, "a.md"), "# A\n\n---\n\n# C\n");
  });

  test("when an agent changed the Document elsewhere, the block is found again and Retry saves there", async () => {
    const { host, disk, project } = await projectOf({ "a.md": DOCUMENT });
    const base = await project.read("a.md");
    host.folders.write(disk, "a.md", `Intro\n\n${DOCUMENT}`);

    const result = await saveSnippet(project, "a.md", base, { kind: "replace", block: heading, markdown: "# Z" });

    assert.equal(result.kind, "moved");
    assert.ok(result.kind === "moved");
    assert.equal(result.base.text, `Intro\n\n${DOCUMENT}`);
    assert.deepEqual(result.change, { kind: "replace", block: { range: { from: 7, to: 10 }, prefix: "" }, markdown: "# Z" });
    assert.equal(host.folders.read(disk, "a.md"), `Intro\n\n${DOCUMENT}`);

    const retried = await saveSnippet(project, "a.md", result.base, result.change);

    assert.equal(retried.kind, "saved");
    assert.equal(host.folders.read(disk, "a.md"), "Intro\n\n# Z\n\nB\n\n# C\n");
  });

  test("a delete is moved the same way", async () => {
    const { host, disk, project } = await projectOf({ "a.md": DOCUMENT });
    const base = await project.read("a.md");
    host.folders.write(disk, "a.md", `Intro\n\n${DOCUMENT}`);

    const result = await saveSnippet(project, "a.md", base, { kind: "delete", block: heading });

    assert.ok(result.kind === "moved");
    assert.deepEqual(result.change, { kind: "delete", block: { range: { from: 7, to: 10 }, prefix: "" } });
  });

  test("when an agent changed the block itself, the User gets the Markdown to copy", async () => {
    const { host, disk, project } = await projectOf({ "a.md": DOCUMENT });
    const base = await project.read("a.md");
    host.folders.write(disk, "a.md", "# A, reworded\n\nB\n\n# C\n");

    assert.deepEqual(await saveSnippet(project, "a.md", base, { kind: "replace", block: heading, markdown: "# Z" }), { kind: "gone", markdown: "# Z" });
    assert.deepEqual(await saveSnippet(project, "a.md", base, { kind: "insert", after: heading.range, markdown: "---" }), { kind: "gone", markdown: "---" });
    assert.deepEqual(await saveSnippet(project, "a.md", base, { kind: "delete", block: heading }), { kind: "gone", markdown: null });
    assert.equal(host.folders.read(disk, "a.md"), "# A, reworded\n\nB\n\n# C\n");
  });

  test("a Document deleted on disk is gone", async () => {
    const { host, disk, project } = await projectOf({ "a.md": DOCUMENT });
    const base = await project.read("a.md");
    host.folders.remove(disk, "a.md");

    assert.deepEqual(await saveSnippet(project, "a.md", base, { kind: "replace", block: heading, markdown: "# Z" }), { kind: "gone", markdown: "# Z" });
    assert.deepEqual(await saveSnippet(project, "a.md", base, { kind: "insert", after: null, markdown: "---" }), { kind: "gone", markdown: "---" });
  });

  test("an insert at the end goes to the new end after an agent's edit", async () => {
    const { host, disk, project } = await projectOf({ "a.md": "# A\n" });
    const base = await project.read("a.md");
    host.folders.write(disk, "a.md", "# A\n\nmore\n");

    const result = await saveSnippet(project, "a.md", base, { kind: "insert", after: null, markdown: "---" });

    assert.ok(result.kind === "moved");
    assert.deepEqual(result.change, { kind: "insert", after: null, markdown: "---" });
    await saveSnippet(project, "a.md", result.base, result.change);
    assert.equal(host.folders.read(disk, "a.md"), "# A\n\nmore\n\n---\n");
  });

  test("an insert after a block follows the block where it now is", async () => {
    const { host, disk, project } = await projectOf({ "a.md": DOCUMENT });
    const base = await project.read("a.md");
    host.folders.write(disk, "a.md", `Intro\n\n${DOCUMENT}`);

    const result = await saveSnippet(project, "a.md", base, { kind: "insert", after: { from: 5, to: 6 }, markdown: "---" });

    assert.ok(result.kind === "moved");
    assert.deepEqual(result.change, { kind: "insert", after: { from: 12, to: 13 }, markdown: "---" });
  });

  test("of identical blocks, the one nearest to the old place is the block", async () => {
    // "# A" is at 0 and at 8.
    const { host, disk, project } = await projectOf({ "a.md": "# A\n\nB\n\n# A\n" });
    const base = await project.read("a.md");
    host.folders.write(disk, "a.md", "n\n\n# A\n\nB\n\n# A\n");

    const result = await saveSnippet(project, "a.md", base, { kind: "replace", block: { range: { from: 8, to: 11 }, prefix: "" }, markdown: "# Z" });

    assert.ok(result.kind === "moved");
    assert.deepEqual(result.change, { kind: "replace", block: { range: { from: 11, to: 14 }, prefix: "" }, markdown: "# Z" });
  });

  test("any other failure rejects unchanged", async () => {
    const failing = (module: ConnectedModule): ConnectedModule => ({
      ...module,
      files: { ...module.files, write: async () => { throw new TesselloError("quota_exceeded", "full"); } },
    });
    const { disk, host, project } = await projectOf({ "a.md": DOCUMENT }, { wrap: failing });
    const base = await project.read("a.md");

    await assert.rejects(saveSnippet(project, "a.md", base, { kind: "replace", block: heading, markdown: "# Z" }), { code: "quota_exceeded" });
    assert.equal(host.folders.read(disk, "a.md"), DOCUMENT);
  });
});

const PIE = '```mermaid\npie title DOC WORKFLOW\n         "Drafting" : 50\n         "Reviewing" : 30\n```';
const LAYOUT = "<!-- layout-columns: 1/1 -->\n<!-- col -->\nLeft\n<!-- col -->\nRight\n<!-- /layout-columns -->";
// "<!-- layout-columns: 1/1 -->\n" is 29 characters, "<!-- col -->\n" 13: "Left" is 42-46, "Right" 60-65, the closing comment 66-90.
const kindsOf = (text: string) => snippetBlocks(text).map((each) => each.kind);

describe("Mermaid, attachment and layout blocks", () => {
  test("a chart the Mermaid Builder wrote is a mermaid block; any other diagram stays a code block", () => {
    const block = snippetBlocks(`${PIE}\n`)[0]!;
    assert.deepEqual({ kind: block.kind, range: block.range, markdown: block.markdown }, { kind: "mermaid", range: { from: 0, to: PIE.length }, markdown: PIE });
    assert.deepEqual(kindsOf("```mermaid\nsequenceDiagram\n    participant A\n    A ->> B: Hi\n```\n"), ["code-block"]);
  });

  test("a mermaid block with a width directive is a code block whose range starts at the directive", () => {
    const text = `Intro\n\n<!-- mermaid-width: full -->\n${PIE}\n`;
    const [block] = snippetBlocks(text);
    assert.equal(block!.kind, "code-block");
    assert.deepEqual(block!.range, { from: 7, to: text.length - 1 });
    assert.equal(block!.element.from, 36);
  });

  test("a chart inside a collapsible is a mermaid block", () => {
    const text = `<details>\n<summary>S</summary>\n\n${PIE}\n\n</details>\n`;
    assert.ok(kindsOf(text).includes("mermaid"));
  });

  test("a paragraph that is one link starting with the paperclip is an attachment; a plain link is a link; inside a list it is no block", () => {
    assert.deepEqual(snippetBlocks("[📎 a.pdf](files/a.pdf)\n\n[a](https://x.y)\n").map((each) => [each.kind, each.markdown]), [["attachment", "[📎 a.pdf](files/a.pdf)"], ["link", "[a](https://x.y)"]]);
    assert.deepEqual(kindsOf("- [📎 a.pdf](files/a.pdf)\n"), ["unordered-list"]);
  });

  test("a layout is a block over its comments, and what a column holds is found too", () => {
    const text = `${LAYOUT}\n`;
    const [layout] = snippetBlocks(text);
    assert.deepEqual(layout, { kind: "columns", element: { from: 0, to: 90 }, range: { from: 0, to: 90 }, prefix: "", markdown: LAYOUT });
    const withTable = `# T\n\n<!-- layout-columns -->\n<!-- col -->\n| a |\n| --- |\n| 1 |\n\n<!-- col -->\nText\n\n<!-- /layout-columns -->\n`;
    assert.deepEqual(kindsOf(withTable), ["heading-1", "columns", "table"]);
  });

  test("a click on a paragraph of a column edits the layout, on a table of a column the table", () => {
    const text = "<!-- layout-columns -->\n<!-- col -->\nText\n\n<!-- col -->\n| a |\n| --- |\n| 1 |\n\n<!-- /layout-columns -->\n";
    const html = render(text);
    const layout = srcOf(html, 'div class="ld-columns"');
    assert.equal(snippetAt(text, [srcOf(html, "p"), layout])!.kind, "columns");
    assert.equal(snippetAt(text, [srcOf(html, "table"), layout])!.kind, "table");
  });

  test("a collapsible in a column is picked, not the layout", () => {
    const text = "<!-- layout-columns -->\n<!-- col -->\n<details>\n<summary>S</summary>\n\nBody\n\n</details>\n\n<!-- col -->\nB\n\n<!-- /layout-columns -->\n";
    const html = render(text);
    const layout = srcOf(html, 'div class="ld-columns"');
    const inner = srcOf(html, "p");
    assert.equal(snippetAt(text, [inner, srcOf(html, "details"), layout])!.kind, "collapsible");
  });

  test("the grid's data-src is the layout block's element", () => {
    const text = `Intro\n\n${LAYOUT}\n\nOutro\n`;
    assert.deepEqual(srcOf(render(text), 'div class="ld-columns"'), snippetBlocks(text).find((each) => each.kind === "columns")!.element);
  });

  test("a rebuilt layout changes only its header line", () => {
    const text = `Intro\n\n${LAYOUT}\n`;
    const block = snippetBlocks(text).find((each) => each.kind === "columns")!;
    const data = parseSnippet("columns", block.markdown, {} as never);
    assert.equal(
      replaced(text, block, buildSnippet({ ...(data as Extract<typeof data, { kind: "columns" }>), gap: "lg" }, {} as never)),
      "Intro\n\n<!-- layout-columns: 1/1 | gap: lg -->\n<!-- col -->\nLeft\n<!-- col -->\nRight\n<!-- /layout-columns -->\n",
    );
  });

  test("deleting a layout removes all of it and keeps one blank line between its neighbours", () => {
    const text = `Before\n\n${LAYOUT}\n\nAfter\n`;
    assert.equal(deleted(text, snippetBlocks(text).find((each) => each.kind === "columns")!), "Before\n\nAfter\n");
  });
});

describe("card blocks", () => {
  const CARD = "<!-- card: T | style: deck -->\n\nBody\n\n<!-- /card -->";

  test("a card is a block over its comments, its data-src the rendered card's", () => {
    const text = `Intro\n\n${CARD}\n\nOutro\n`;
    const card = snippetBlocks(text).find((each) => each.kind === "card")!;
    assert.deepEqual(card, { kind: "card", element: { from: 7, to: 7 + CARD.length }, range: { from: 7, to: 7 + CARD.length }, prefix: "", markdown: CARD });
    assert.deepEqual(srcOf(render(text), 'div class="ld-card ld-card-deck"'), card.element);
  });

  test("a click on a paragraph of a card edits the card, on a table of a card the table", () => {
    const text = "<!-- card: T -->\n\nText\n\n| a |\n| --- |\n| 1 |\n\n<!-- /card -->\n";
    const html = render(text);
    const card = srcOf(html, 'div class="ld-card ld-card-plain"');
    assert.equal(snippetAt(text, [srcOf(html, "p"), card])!.kind, "card");
    assert.equal(snippetAt(text, [srcOf(html, "table"), card])!.kind, "table");
  });

  test("the card's comment is not a directive of the table right after it", () => {
    const text = "<!-- card: T -->\n| a |\n| --- |\n| 1 |\n<!-- /card -->\n";
    const table = snippetBlocks(text).find((each) => each.kind === "table")!;
    assert.equal(table.range.from, text.indexOf("| a |"));
  });

  test("nested cards and a card in a column are blocks each, paired with their own closing", () => {
    const nested = "<!-- card: Out -->\n\n<!-- card: In -->\n\nX\n\n<!-- /card -->\n\n<!-- /card -->\n";
    const cards = snippetBlocks(nested).filter((each) => each.kind === "card");
    assert.deepEqual(cards.map((each) => nested.slice(each.range.from, each.range.to)), [nested.trimEnd(), "<!-- card: In -->\n\nX\n\n<!-- /card -->"]);
    const inColumns = "<!-- layout-columns -->\n<!-- col -->\n<!-- card: A -->\nA\n<!-- /card -->\n<!-- col -->\nB\n<!-- /layout-columns -->\n";
    assert.deepEqual(kindsOf(inColumns), ["columns", "card"]);
  });

  test("a rebuilt card changes only its header line", () => {
    const text = `Intro\n\n${CARD}\n`;
    const block = snippetBlocks(text).find((each) => each.kind === "card")!;
    const data = parseSnippet("card", block.markdown, {} as never);
    assert.equal(applyEdits(text, [replaceBlock(text, block, buildSnippet({ ...data, title: "New" } as never, {} as never))]), `Intro\n\n<!-- card: New | style: deck -->\n\nBody\n\n<!-- /card -->\n`);
  });
});
