// The keys of `.annotations.json` follow their Documents (docs/spec/annotations.md rule 3). Pure: text in, text out, null for
// no change. A malformed file (not JSON, not an object) is never changed. Kept apart from annotations.ts, which imports project.ts.

import { entryMapper, type PathMapper } from "./links.ts";

/** The Project's annotations file, shared with the original application. */
export const ANNOTATIONS_FILE = ".annotations.json";

type Store = Record<string, unknown>;

/** The file's text as an object, or null when it is not JSON or not an object. */
function parse(text: string): Store | null {
  try {
    const data: unknown = JSON.parse(text);
    return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Store) : null;
  } catch {
    return null;
  }
}

const write = (store: Store) => JSON.stringify(store, null, 2);

/**
 * The text with every key mapped by `map` (a Document's path with `.md`); remapped entries keep their place in the object.
 * When the new key already exists (stale annotations of a Document that left the Module), two lists are joined, the existing
 * first. null when no key moves.
 */
function remapped(text: string, map: PathMapper): string | null {
  const store = parse(text);
  if (!store) return null;
  const next: Store = {};
  let any = false;
  for (const [key, value] of Object.entries(store)) {
    const moved = map(`${key}.md`);
    const target = moved === null ? key : moved.replace(/\.md$/, "");
    if (target !== key) any = true;
    const existing = next[target];
    next[target] = Array.isArray(existing) && Array.isArray(value) ? [...existing, ...value] : value;
  }
  return any ? write(next) : null;
}

/** The file's text with the Document or Folder `from` moved to `to` (paths with `.md` for a Document, as on disk). */
export const keysMoved = (text: string, from: string, to: string, isFolder: boolean) => remapped(text, entryMapper(from, to, isFolder));

/** The file's text without the keys of the Document or Folder at `path`. */
export function keysDropped(text: string, path: string, isFolder: boolean): string | null {
  const store = parse(text);
  if (!store) return null;
  // A Folder's keys are under it: the key equal to its path is a Document named like it (`f.md` next to `f/`).
  const goes = (key: string) => (isFolder ? key.startsWith(`${path}/`) : key === path.replace(/\.md$/, ""));
  const kept = Object.entries(store).filter(([key]) => !goes(key));
  return kept.length === Object.keys(store).length ? null : write(Object.fromEntries(kept));
}
