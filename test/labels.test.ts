// The label filter that rewrites the labels the Tree shows.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { compileLabelFilter, NO_LABEL_FILTER } from "../src/lib/labels.ts";

const DATE_PREFIX = String.raw`^\d{4}(_\d{2}){4}_`;

function filterOf(pattern: string, replacement = "") {
  const compiled = compileLabelFilter({ pattern, replacement });
  assert.ok(compiled.ok);
  return compiled.apply;
}

describe("a label filter", () => {
  test("strips a date prefix from a folder name and from a file name", () => {
    const apply = filterOf(DATE_PREFIX);
    assert.equal(apply("2026_04_11_13_25_crer_vos_dossiers"), "crer_vos_dossiers");
    assert.equal(apply("2026_04_11_13_25_crer_vos_dossiers.md"), "crer_vos_dossiers.md");
  });

  test("can use $1-style groups in the replacement", () => {
    const apply = filterOf(String.raw`^(\d+)-(.*)$`, "$2 ($1)");
    assert.equal(apply("12-intro"), "intro (12)");
  });

  test("replaces every match", () => {
    assert.equal(filterOf("_", " ")("crer_vos_dossiers"), "crer vos dossiers");
  });

  test("shows the original label when the result is empty or blank", () => {
    assert.equal(filterOf("^.*$")("notes"), "notes");
    assert.equal(filterOf("^notes$", "   ")("notes"), "notes");
  });

  test("leaves a label that does not match unchanged", () => {
    assert.equal(filterOf(DATE_PREFIX)("readme"), "readme");
  });

  test("with an empty pattern changes nothing", () => {
    const compiled = compileLabelFilter({ pattern: "", replacement: "x" });
    assert.ok(compiled.ok);
    assert.equal(compiled.apply("2026_04_11_13_25_a"), "2026_04_11_13_25_a");
    assert.deepEqual(compileLabelFilter(NO_LABEL_FILTER).ok, true);
  });

  test("with an invalid pattern is refused", () => {
    assert.deepEqual(compileLabelFilter({ pattern: "(", replacement: "" }), { ok: false });
    assert.deepEqual(compileLabelFilter({ pattern: "[a-", replacement: "" }), { ok: false });
  });

  test("gives the same result on repeated calls", () => {
    const apply = filterOf("_", "-");
    assert.equal(apply("a_b_c"), "a-b-c");
    assert.equal(apply("a_b_c"), "a-b-c");
    assert.equal(apply("a_b_c"), "a-b-c");
  });
});
