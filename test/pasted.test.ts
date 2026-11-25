// Pasted or dropped files: names and links for an image or file pasted or dropped into a Document.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pastedLink, cleanFileName, freeName, imageExtension, isImage, splitName, timestampName } from "../src/lib/pasted.ts";
import { resolveImage } from "../src/lib/links.ts";

describe("isImage", () => {
  test("is true for an image MIME type only", () => {
    assert.equal(isImage({ type: "image/png" }), true);
    assert.equal(isImage({ type: "application/pdf" }), false);
    assert.equal(isImage({ type: "" }), false);
  });
});

describe("imageExtension", () => {
  test("is the usual extension of a known image type", () => {
    assert.equal(imageExtension("image/png", "x"), "png");
    assert.equal(imageExtension("image/jpeg", "x"), "jpg");
    assert.equal(imageExtension("image/gif", "x"), "gif");
    assert.equal(imageExtension("image/webp", "x"), "webp");
    assert.equal(imageExtension("image/svg+xml", "x"), "svg");
    assert.equal(imageExtension("image/avif", "x"), "avif");
    assert.equal(imageExtension("image/bmp", "x"), "bmp");
  });

  test("falls back to the lower-cased extension of the file name, then to png", () => {
    assert.equal(imageExtension("image/x-icon", "favicon.ICO"), "ico");
    assert.equal(imageExtension("image/x-icon", "archive.tar.gz"), "gz");
    assert.equal(imageExtension("image/x-icon", "noextension"), "png");
    assert.equal(imageExtension("image/x-icon", ".hidden"), "png");
    assert.equal(imageExtension("", ""), "png");
  });
});

describe("timestampName", () => {
  test("is the local date and time, zero-padded, joined for a file name", () => {
    assert.equal(timestampName(new Date(2026, 10, 25, 14, 3, 7)), "2026-11-25_14-03-07");
    assert.equal(timestampName(new Date(2026, 0, 2, 0, 0, 0)), "2026-01-02_00-00-00");
  });
});

describe("freeName", () => {
  test("keeps the base when no file of that name exists", () => {
    assert.equal(freeName("shot", "png", []), "shot");
    assert.equal(freeName("shot", "png", ["shot.jpg", "other.png"]), "shot");
  });

  test("proposes -2, then -3, the first free one, when the file exists", () => {
    assert.equal(freeName("shot", "png", ["shot.png"]), "shot-2");
    assert.equal(freeName("shot", "png", ["shot.png", "shot-2.png"]), "shot-3");
    assert.equal(freeName("shot", "png", ["shot.png", "shot-3.png"]), "shot-2");
  });

  test("compares ignoring case", () => {
    assert.equal(freeName("Shot", "png", ["SHOT.PNG"]), "Shot-2");
  });

  test("compares the name itself for a file with no extension", () => {
    assert.equal(freeName("README", "", ["README"]), "README-2");
    assert.equal(freeName("README", "", ["README.md"]), "README");
  });
});

describe("splitName", () => {
  test("splits at the last dot", () => {
    assert.deepEqual(splitName("notes.txt"), { base: "notes", extension: "txt" });
    assert.deepEqual(splitName("archive.tar.gz"), { base: "archive.tar", extension: "gz" });
  });

  test("has no extension without a dot, with a leading dot only, or with a trailing dot", () => {
    assert.deepEqual(splitName("README"), { base: "README", extension: "" });
    assert.deepEqual(splitName(".env"), { base: ".env", extension: "" });
    assert.deepEqual(splitName("odd."), { base: "odd.", extension: "" });
  });
});

describe("cleanFileName", () => {
  test("keeps an acceptable name as it is", () => {
    assert.equal(cleanFileName("Report 2026 (final).pdf"), "Report 2026 (final).pdf");
  });

  test("replaces each refused character with an underscore", () => {
    assert.equal(cleanFileName('a/b\\c:d*e?f"g<h>i|j.txt'), "a_b_c_d_e_f_g_h_i_j.txt");
  });

  test("removes leading and trailing spaces and dots", () => {
    assert.equal(cleanFileName("  .. notes.txt. "), "notes.txt");
  });

  test("becomes file when nothing is left", () => {
    assert.equal(cleanFileName(" . . "), "file");
    assert.equal(cleanFileName(""), "file");
  });
});

describe("pastedLink", () => {
  test("is an image or a paperclip link, relative to the Document's folder", () => {
    assert.equal(pastedLink("a.md", "images/x.png", "image", "x"), "![x](images/x.png)");
    assert.equal(pastedLink("a.md", "files/notes.txt", "file", "notes.txt"), "[📎 notes.txt](files/notes.txt)");
  });

  test("climbs out of the Document's folders", () => {
    assert.equal(pastedLink("guides/setup/a.md", "images/x.png", "image", "x"), "![x](../../images/x.png)");
    assert.equal(pastedLink("guides/a.md", "images/x.png", "image", "x"), "![x](../images/x.png)");
  });

  test("shares the folders both paths have", () => {
    assert.equal(pastedLink("guides/a.md", "guides/images/x.png", "image", "x"), "![x](images/x.png)");
  });

  test("writes spaces, parentheses and percent signs in the path as escapes", () => {
    assert.equal(
      pastedLink("a.md", "images/my shot (1) 100%.png", "image", "x"),
      "![x](images/my%20shot%20%281%29%20100%25.png)",
    );
  });

  test("escapes brackets and backslashes in the label", () => {
    assert.equal(pastedLink("a.md", "images/x.png", "image", "a [b] c\\d"), "![a \\[b\\] c\\\\d](images/x.png)");
  });

  test("gives back the saved file when resolved from the Document", () => {
    const link = pastedLink("guides/a.md", "images/my shot (1).png", "image", "shot");
    const destination = /\]\((.*)\)$/.exec(link)![1]!;
    assert.deepEqual(resolveImage("guides/a.md", destination), { kind: "project", path: "images/my shot (1).png" });
  });
});
