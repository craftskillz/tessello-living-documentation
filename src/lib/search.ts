// Search: Documents found by displayed title (instant) or by full text (title, Tags, description, Type, body), ignoring
// accents and case. Never matches field names or raw frontmatter; excerpts come from the body only.

import { parseDocument, type DocumentModel } from "./document.ts";
import { NotFound, type Project, type TreeDocument, type TreeEntry } from "./project.ts";

export interface SearchResult {
  path: string;
  /** Text around the first match in the body, "" when the match is only in title, Tags, description or Type. */
  excerpt: string;
}

const MARKS = /[̀-ͯ]/g;
const BEFORE = 60;
const AFTER = 90;

/** A text folded for comparison, and for each of its code units where its character starts and ends in the original. */
interface Folded {
  text: string;
  starts: number[];
  ends: number[];
}

function foldWithMap(original: string): Folded {
  const folded: Folded = { text: "", starts: [], ends: [] };
  let at = 0;
  for (const char of original) {
    const piece = char.normalize("NFD").replace(MARKS, "").toLowerCase();
    for (let unit = 0; unit < piece.length; unit++) {
      folded.starts.push(at);
      folded.ends.push(at + char.length);
    }
    folded.text += piece;
    at += char.length;
  }
  return folded;
}

/** Folded for comparison: accents removed, lower case. */
export function fold(text: string): string {
  return foldWithMap(text).text;
}

/** Whether a displayed title contains the query (trimmed), ignoring accents and case. Empty query: false. */
export function titleMatches(title: string, query: string): boolean {
  const needle = fold(query.trim());
  return needle !== "" && fold(title).includes(needle);
}

/** The Documents of `entries` (any depth, Tree order) whose displayed title matches: instant search. */
export function titleResults(entries: TreeEntry[], query: string): SearchResult[] {
  return documentsIn(entries).filter((document) => titleMatches(document.title, query)).map((document) => ({ path: document.path, excerpt: "" }));
}

/** A Document's full-text match: null when nothing among displayed title, Tags, description, Type, body contains the query; else its excerpt from the body ("" when the body does not match). */
export function matchDocument(model: DocumentModel, query: string): { excerpt: string } | null {
  const needle = fold(query.trim());
  if (needle === "") return null;
  const body = foldWithMap(model.body);
  const at = body.text.indexOf(needle);
  if (at >= 0) return { excerpt: excerptOf(model.body, body, at, needle.length) };
  const fields = [model.title, ...model.tags, model.description ?? "", model.type ?? ""];
  return fields.some((field) => fold(field).includes(needle)) ? { excerpt: "" } : null;
}

function excerptOf(original: string, folded: Folded, at: number, length: number): string {
  const from = Math.max(0, folded.starts[at]! - BEFORE);
  const to = Math.min(original.length, folded.ends[at + length - 1]! + AFTER);
  const text = original.slice(from, to).replace(/[\r\n]+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${text}${to < original.length ? "…" : ""}`;
}

/**
 * Full-text search: reads every Document of `entries` through `project.read`, in Tree order. A Document gone since the
 * Tree was read is skipped; any other failing read rejects the whole search.
 */
export async function searchProject(project: Pick<Project, "read">, entries: TreeEntry[], query: string): Promise<SearchResult[]> {
  if (isBlank(query)) return [];
  const results = await Promise.all(
    documentsIn(entries).map(async ({ path }): Promise<SearchResult | null> => {
      const text = await project.read(path).then(({ text }) => text, (error: unknown) => {
        if (error instanceof NotFound) return null;
        throw error;
      });
      const found = text === null ? null : matchDocument(parseDocument(text, path), query);
      return found && { path, excerpt: found.excerpt };
    }),
  );
  return results.filter((result) => result !== null);
}

/** The Tree restricted to `paths`: matching Documents and the Folders leading to them, order kept; other entries (manifests, files, non-matching) dropped. */
export function filterTree(entries: TreeEntry[], paths: ReadonlySet<string>): TreeEntry[] {
  return entries.flatMap((entry): TreeEntry[] => {
    if (entry.kind === "document") return paths.has(entry.path) ? [entry] : [];
    if (entry.kind !== "folder") return [];
    const children = filterTree(entry.children, paths);
    return children.length > 0 ? [{ ...entry, children }] : [];
  });
}

/** The Documents of `entries` at any depth, in Tree order (never manifests or other files). */
export function documentsIn(entries: TreeEntry[]): TreeDocument[] {
  return entries.flatMap((entry) => (entry.kind === "document" ? [entry] : entry.kind === "folder" ? documentsIn(entry.children) : []));
}

/** The pause after the last keystroke before the full-text search starts. */
export const FULL_TEXT_DELAY_MS = 350;

export interface LiveSearchOptions {
  /** Instant results over the displayed titles. */
  titles: (query: string) => SearchResult[];
  /** The slower full-text results; may reject. */
  fullText: (query: string) => Promise<SearchResult[]>;
  /** The results to show: null when the query is blank (no search, the whole Tree). */
  onresults: (results: SearchResult[] | null) => void;
  /** The full-text search of the current query failed; the title results stay. */
  onfailure: (error: unknown) => void;
  /** Where the pause is timed: the browser's timers by default, a manual clock in tests. */
  timer?: { set(run: () => void, ms: number): unknown; clear(handle: unknown): void };
}

/**
 * Search as the User types: titles at once, full text after a pause; answers to an older query are ignored. `refresh`
 * runs the full text of the current query again at once (the Tree changed under it).
 */
export function createLiveSearch(options: LiveSearchOptions): { search(query: string): void; refresh(): void; dispose(): void } {
  const timer = options.timer ?? { set: (run, ms) => setTimeout(run, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  /** Bumped by every new search: an answer started under an older generation is ignored. */
  let generation = 0;
  let pending: unknown = null;
  /** The query of the search under way, "" when none. */
  let current = "";
  let disposed = false;
  const cancel = () => {
    generation++;
    if (pending !== null) timer.clear(pending);
    pending = null;
  };
  const fullText = (query: string) => {
    const asked = generation;
    options.fullText(query).then(
      (results) => asked === generation && options.onresults(results),
      (error: unknown) => asked === generation && options.onfailure(error),
    );
  };
  return {
    search(query) {
      cancel();
      if (disposed) return;
      current = isBlank(query) ? "" : query;
      if (current === "") return options.onresults(null);
      options.onresults(options.titles(query));
      pending = timer.set(() => {
        pending = null;
        fullText(query);
      }, FULL_TEXT_DELAY_MS);
    },
    refresh() {
      if (disposed || current === "") return;
      cancel();
      fullText(current);
    },
    dispose() {
      disposed = true;
      cancel();
    },
  };
}

/** Whether a query searches nothing: blank once accents and case are folded. */
const isBlank = (query: string) => fold(query.trim()) === "";
