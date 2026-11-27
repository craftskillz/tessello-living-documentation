// Format: the conservative Markdown reformat of the editor's Format button (ticket 36).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatMarkdown } from "../src/lib/format.ts";

/** `input` formats to `expected`, and formatting `expected` again changes nothing (idempotence). */
function formats(input: string, expected: string): void {
  const once = formatMarkdown(input);
  assert.equal(once, expected);
  assert.equal(formatMarkdown(once), once, "not idempotent");
}

describe("lines", () => {
  test("trailing spaces and tabs are removed", () => {
    formats("one \t\ntwo\t\n", "one\ntwo\n");
  });

  test("a hard line break becomes exactly two spaces", () => {
    formats("one     \ntwo   \nthree\n", "one  \ntwo  \nthree\n");
  });

  test("two spaces that break no line are removed: on a heading, before a blank line, at the end", () => {
    formats("# Title  \n\npara  \n\nlast  \n", "# Title\n\npara\n\nlast\n");
  });

  test("a whitespace-only line becomes empty, and runs of blank lines collapse to one", () => {
    formats("a\n\n \n\t\n\nb\n", "a\n\nb\n");
  });

  test("the text ends with exactly one newline", () => {
    formats("a", "a\n");
    formats("a\n\n\n\n", "a\n");
  });

  test("leading blank lines are dropped", () => {
    formats("\n\na\n", "a\n");
  });

  test("empty or whitespace-only text gives an empty text", () => {
    formats("", "");
    formats(" \n\t\n\n", "");
  });

  test("the line ending is preserved", () => {
    formats("a  \r\nb\r\n\r\n\r\n\r\nc \r\n", "a  \r\nb\r\n\r\nc\r\n");
  });
});

describe("tables", () => {
  test("cells are padded to the column width, with the pipes and the delimiter row normalised", () => {
    formats(
      "a|b\n-|-\nlonger cell|x\n",
      "| a           | b   |\n| ----------- | --- |\n| longer cell | x   |\n",
    );
  });

  test("alignment colons are kept and the cells follow the alignment", () => {
    formats(
      "| l | c | r |\n|:--|:-:|--:|\n| aaaa | bbbb | cccc |\n| x | y | z |\n",
      "| l    |   c   |    r |\n| :--- | :---: | ---: |\n| aaaa | bbbb  | cccc |\n| x    |   y   |    z |\n",
    );
  });

  test("a centred cell puts the extra space on the right", () => {
    formats("|h|\n|:-:|\n|ab|\n|abcd|\n", "|   h   |\n| :---: |\n|  ab   |\n| abcd  |\n");
  });

  test("a short row gets empty cells; extra cells are kept", () => {
    formats("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |\n", "| a   | b   |\n| --- | --- |\n| 1   |     |\n| 1   | 2   | 3 |\n");
  });

  test("escaped pipes stay in their cell; a pipe in a code span splits like GFM", () => {
    formats("| a | b |\n|---|---|\n| x \\| y | z |\n", "| a      | b   |\n| ------ | --- |\n| x \\| y | z   |\n");
    formats(
      "| a | b |\n|---|---|\n| `x\\|y` | z |\n",
      "| a      | b   |\n| ------ | --- |\n| `x\\|y` | z   |\n",
    );
  });

  test("wide characters and emoji count for two columns, combining marks for none", () => {
    formats(
      "| a | b |\n|---|---|\n| 日本 | é |\n| 😀 | xx |\n",
      "| a    | b   |\n| ---- | --- |\n| 日本 | é   |\n| 😀   | xx  |\n",
    );
  });

  test("a table in a blockquote or a list item keeps its prefix", () => {
    formats("> | a | b |\n> |-|-|\n> | longer | x |\n", "> | a      | b   |\n> | ------ | --- |\n> | longer | x   |\n");
    formats("- item\n\n  | a | b |\n  |-|-|\n  | longer | x |\n", "- item\n\n  | a      | b   |\n  | ------ | --- |\n  | longer | x   |\n");
    formats("- | a | b |\n  |-|-|\n  | longer | x |\n", "- | a      | b   |\n  | ------ | --- |\n  | longer | x   |\n");
  });
});

describe("regions left as they are", () => {
  test("a Card block's comments stay as written, its content is formatted", () => {
    formats("<!-- card: T | style: deck -->\n\n|a|b|\n|-|-|\n|1|2|\n\n\n<!-- /card -->\n", "<!-- card: T | style: deck -->\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n\n<!-- /card -->\n");
  });

  test("the frontmatter is untouched", () => {
    formats("---\ntitle: x   \nlist:  \n\n\n  - a\n---\n\n\n\nbody  \n", "---\ntitle: x   \nlist:  \n\n\n  - a\n---\n\nbody\n");
  });

  test("fenced code keeps its content, blank lines and trailing whitespace", () => {
    const fenced = "```md\n| a | b |\n|-|-|\n\n\n  x   \n```";
    formats(`before  \n\n\n${fenced}\n\n\nafter \n`, `before\n\n${fenced}\n\nafter\n`);
    const tilde = "~~~\n|a|b|\n|-|-|\n\n\ty\t\n~~~";
    formats(`${tilde}\n`, `${tilde}\n`);
  });

  test("a fence inside a list item or a quote is untouched too", () => {
    formats("- item\n\n  ```\n  a  \n\n\n  b\n  ```\n", "- item\n\n  ```\n  a  \n\n\n  b\n  ```\n");
    formats("> ```\n> |a|b|\n> |-|-|\n> ```\n", "> ```\n> |a|b|\n> |-|-|\n> ```\n");
  });

  test("an indented code block is untouched", () => {
    formats("text\n\n    code  \n\n\n    |a|b|\n    |-|-|\n\nend\n", "text\n\n    code  \n\n\n    |a|b|\n    |-|-|\n\nend\n");
  });

  test("a block of HTML is untouched, inline HTML is not", () => {
    formats("<pre>\n  x   \n\n\n  |a|b|\n</pre>\n\nSome <b>bold</b>\t\n", "<pre>\n  x   \n\n\n  |a|b|\n</pre>\n\nSome <b>bold</b>\n");
  });

  test("a table is found next to text, and the text around it is only trimmed", () => {
    formats(
      "# Title  \n\nIntro \n\n|a|b|\n|-|-|\n|1|2|\n\n\nOutro\n",
      "# Title\n\nIntro\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n\nOutro\n",
    );
  });

  test("a table whose delimiter row does not match its header is not a table and is left alone", () => {
    formats("| a | b |\n|---|\n| 1 | 2 |\n", "| a | b |\n|---|\n| 1 | 2 |\n");
  });
});
