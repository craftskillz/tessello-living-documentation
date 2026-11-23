// The date the Tree shows under each Document.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatTreeDate } from "../src/lib/dates.ts";

describe("a created date", () => {
  test("with its time is read as written, in the View's language", () => {
    const date = { kind: "created", at: "2026-03-04T14:30" } as const;
    assert.equal(formatTreeDate(date, "en"), "March 4, 2026 at 2:30 PM");
    assert.equal(formatTreeDate(date, "fr"), "4 mars 2026 à 14:30");
  });

  test("without a time shows the date only", () => {
    const date = { kind: "created", at: "2026-03-04" } as const;
    assert.equal(formatTreeDate(date, "en"), "March 4, 2026");
    assert.equal(formatTreeDate(date, "fr-FR"), "4 mars 2026");
  });
});

describe("a modified date", () => {
  test("shows the local date and time", () => {
    const at = new Date(2026, 2, 4, 14, 30).getTime();
    assert.equal(formatTreeDate({ kind: "modified", at }, "fr"), "4 mars 2026 à 14:30");
  });
});
