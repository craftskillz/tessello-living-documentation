// The date the Tree shows under each Document, in the View's language.

import type { TreeDate } from "./project.ts";

/**
 * A created date is shown as written, never converted to another time zone (so it is read and formatted as UTC), with its
 * time when it has one; a modified date is shown in the reader's own time zone.
 */
export function formatTreeDate(date: TreeDate, locale: string): string {
  if (date.kind === "modified") return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(date.at);
  const withTime = date.at.includes("T");
  const at = Date.parse(withTime ? `${date.at}Z` : `${date.at}T00:00Z`);
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", ...(withTime ? { timeStyle: "short" as const } : {}), timeZone: "UTC" }).format(at);
}
