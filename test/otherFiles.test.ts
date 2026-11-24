// How a file that is not a Document is shown, and what counts as an image: pure.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isImageName, MAX_TEXT_BYTES, previewOf } from "../src/lib/otherFiles.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("isImageName", () => {
  test("is decided by the extension, ignoring case", () => {
    for (const name of ["a.png", "a.JPG", "a.jpeg", "a.gif", "a.webp", "a.svg", "a.ico", "a.bmp", "a.avif"]) assert.equal(isImageName(name), true, name);
    for (const name of ["a.pdf", "png", "a.md", "a.mp4"]) assert.equal(isImageName(name), false, name);
  });
});

describe("previewOf", () => {
  test("images are previewed with their MIME type", () => {
    assert.deepEqual(previewOf("a.svg", bytes("<svg/>")), { kind: "image", mime: "image/svg+xml" });
    assert.deepEqual(previewOf("a.JPG", new Uint8Array([1])), { kind: "image", mime: "image/jpeg" });
    assert.deepEqual(previewOf("a.ico", new Uint8Array([1])), { kind: "image", mime: "image/x-icon" });
    assert.deepEqual(previewOf("a.png", new Uint8Array([1])), { kind: "image", mime: "image/png" });
  });

  test("videos are previewed with their MIME type", () => {
    assert.deepEqual(previewOf("a.mov", new Uint8Array([1])), { kind: "video", mime: "video/quicktime" });
    assert.deepEqual(previewOf("a.ogv", new Uint8Array([1])), { kind: "video", mime: "video/ogg" });
    assert.deepEqual(previewOf("a.avi", new Uint8Array([1])), { kind: "video", mime: "video/x-msvideo" });
    assert.deepEqual(previewOf("a.mkv", new Uint8Array([1])), { kind: "video", mime: "video/x-matroska" });
    assert.deepEqual(previewOf("a.MP4", new Uint8Array([1])), { kind: "video", mime: "video/mp4" });
    assert.deepEqual(previewOf("a.webm", new Uint8Array([1])), { kind: "video", mime: "video/webm" });
  });

  test("documents and archives are binary by their extension, even when they look like text", () => {
    assert.deepEqual(previewOf("a.pdf", bytes("plain")), { kind: "binary" });
    assert.deepEqual(previewOf("a.ZIP", bytes("plain")), { kind: "binary" });
    assert.deepEqual(previewOf("a.mp3", bytes("plain")), { kind: "binary" });
  });

  test("any other file with a NUL byte in its first 8000 bytes is binary", () => {
    assert.deepEqual(previewOf("a.dat", new Uint8Array([65, 0, 66])), { kind: "binary" });
    const late = new Uint8Array(8001).fill(65);
    late[8000] = 0;
    assert.deepEqual(previewOf("a.dat", late).kind, "text");
  });

  test("any other file is text", () => {
    assert.deepEqual(previewOf("notes.txt", bytes("héllo\n")), { kind: "text", text: "héllo\n", truncated: false });
    assert.deepEqual(previewOf("Makefile", bytes("")), { kind: "text", text: "", truncated: false });
  });

  test("a text up to 1 MiB is whole; a larger one is cut at 1 MiB", () => {
    assert.equal(MAX_TEXT_BYTES, 1048576);
    const exact = previewOf("a.txt", new Uint8Array(1048576).fill(97));
    assert.ok(exact.kind === "text" && !exact.truncated && exact.text.length === 1048576);
    const larger = previewOf("a.txt", new Uint8Array(1048577).fill(97));
    assert.ok(larger.kind === "text" && larger.truncated && larger.text.length === 1048576);
  });

  test("the cut leaves no broken character", () => {
    // "é" is two bytes: the cut falls between them.
    const file = new Uint8Array(1048577).fill(97);
    file.set([0xc3, 0xa9], 1048575);
    const preview = previewOf("a.txt", file);
    assert.ok(preview.kind === "text" && preview.truncated);
    assert.equal(preview.text.length, 1048575);
    assert.ok(!preview.text.includes("�"));
  });
});
