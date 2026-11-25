// Annotations: notes attached to a passage of a Document, kept in the Project's `.annotations.json`. The file keeps the
// original application's format (docs/adr/0003, docs/spec/annotations.md): other keys and Documents' entries stay as written.

import type { Json } from "@tessello/sdk";
import { ANNOTATIONS_FILE } from "./annotationKeys.ts";
import { Conflict, NotFound, type Project, Refused } from "./project.ts";

export { ANNOTATIONS_FILE };

export interface Annotation {
  id: string;
  /** The annotated passage, spaces normalized. */
  selectedText: string;
  /** The text just before and just after the passage when it was annotated, to find it again. */
  contextBefore: string;
  contextAfter: string;
  note: string;
  /** ISO date. */
  createdAt: string;
  /** ISO date of the last edit; absent until the annotation is edited. */
  updated?: string;
}

/** The Marker: Normal shows the annotations, Active also creates them, Hidden shows none (docs/spec/annotations.md rule 5). */
export type MarkerState = "normal" | "active" | "hidden";

/** Normal → Active → Hidden → Normal. */
export const NEXT_MARKER: Record<MarkerState, MarkerState> = { normal: "active", active: "hidden", hidden: "normal" };

export interface AnnotationDraft {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  note: string;
}

/** The key of a Document in the file: its path without `.md`. */
export const annotationKey = (path: string) => path.replace(/\.md$/, "");

/** Runs of spaces and line breaks become one space, trimmed. */
export const normalizeSpaces = (text: string) => text.replace(/\s+/g, " ").trim();

/** The creation popup's excerpt: spaces normalized, cut at 120 characters ending with "…" when longer. */
export function excerpt(text: string): string {
  const flat = normalizeSpaces(text);
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

export type Placement =
  | { annotation: Annotation; state: "placed" | "surroundingChanged"; start: number; end: number }
  | { annotation: Annotation; state: "orphan" };

const escapeRegExp = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A pattern matching `text` word by word, any run of spaces in it matching any whitespace in the page. */
const wordsPattern = (text: string) => normalizeSpaces(text).split(" ").filter(Boolean).map(escapeRegExp).join("\\s+");

/**
 * Where each annotation sits in `text` (the reading view's text content), in list order (docs/spec/annotations.md rule 4).
 * The passage with its surrounding text first; else the passage alone when it occurs exactly once; else an orphan: never a guess.
 * Whitespace tolerant, because the page's line breaks and spaces are not the stored ones.
 */
export function placeAnnotations(text: string, list: Annotation[]): Placement[] {
  return list.map((annotation): Placement => {
    const passage = wordsPattern(annotation.selectedText);
    if (!passage) return { annotation, state: "orphan" };
    const before = wordsPattern(annotation.contextBefore);
    const after = wordsPattern(annotation.contextAfter);
    const matches = (pattern: string) => [...text.matchAll(new RegExp(pattern, "g"))];
    // The passage is the only capture group, so its offsets come from the `d` flag.
    const find = (all: boolean) => {
      const pattern = `${before ? `${before}\\s*` : ""}(${passage})${after ? `\\s*${after}` : ""}`;
      const found = [...text.matchAll(new RegExp(pattern, "dg"))];
      const first = found[0];
      if (!first || (all && found.length !== 1)) return null;
      const [start, end] = first.indices![1]!;
      return { start: start!, end: end! };
    };
    const withContext = before || after ? find(false) : find(true);
    if (withContext) return { annotation, state: "placed", ...withContext };
    const alone = matches(passage);
    if (alone.length === 1) {
      const start = alone[0]!.index;
      return { annotation, state: "surroundingChanged", start, end: start + alone[0]![0].length };
    }
    return { annotation, state: "orphan" };
  });
}

/** The annotations file with its version; null when it does not exist. Other read failures propagate. */
const readFile = (project: Project) =>
  project.read(ANNOTATIONS_FILE).catch((error: unknown) => {
    if (error instanceof NotFound) return null;
    throw error;
  });

const isObject = (value: unknown): value is Record<string, Json> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The parsed object of the file's text, or null when it is not JSON or not an object. */
function parseStore(text: string): Record<string, Json> | null {
  try {
    const data: unknown = JSON.parse(text);
    return isObject(data) ? data : null;
  } catch {
    return null;
  }
}

/** An entry of the file as an Annotation; null when it lacks a string id, selectedText or note. */
function toAnnotation(entry: Json): Annotation | null {
  if (!isObject(entry) || typeof entry.id !== "string" || typeof entry.selectedText !== "string" || typeof entry.note !== "string") return null;
  const text = (value: Json | undefined) => (typeof value === "string" ? value : "");
  const annotation: Annotation = { id: entry.id, selectedText: entry.selectedText, contextBefore: text(entry.contextBefore), contextAfter: text(entry.contextAfter), note: entry.note, createdAt: text(entry.createdAt) };
  if (typeof entry.updated === "string") annotation.updated = entry.updated;
  return annotation;
}

/**
 * The Document's annotations. A missing file, malformed JSON, a non-object, or an entry that is not an array give none;
 * entries that cannot be read are dropped. Other read failures propagate.
 */
export async function readAnnotations(project: Project, path: string): Promise<Annotation[]> {
  const file = await readFile(project);
  const entries = file ? parseStore(file.text)?.[annotationKey(path)] : undefined;
  return Array.isArray(entries) ? entries.flatMap((entry) => toAnnotation(entry) ?? []) : [];
}

/** Writes tried in total when the file keeps changing under a change. */
const ATTEMPTS = 3;

/**
 * Reads the file, lets `change` rewrite the Document's list (given the list, returning the new list, or null for no write), and writes it at the version read. On a Conflict the file is read again and only this change
 * re-applied, up to 3 attempts, then the Conflict is rethrown (docs/spec/annotations.md rule 2). Refused("invalidAnnotations")
 * when the file is not a JSON object or the Document's entry is not an array, the file untouched. An emptied list drops its key.
 */
async function change(project: Project, path: string, apply: (list: Json[]) => Json[] | null): Promise<void> {
  const key = annotationKey(path);
  for (let attempt = 1; ; attempt++) {
    const file = await readFile(project);
    const store = file ? parseStore(file.text) : {};
    const list = store?.[key];
    if (!store || (list !== undefined && !Array.isArray(list))) throw new Refused("invalidAnnotations");
    const next = apply(list ?? []);
    if (next === null) return;
    const { [key]: _gone, ...others } = store;
    const written = next.length === 0 ? others : { ...store, [key]: next };
    try {
      await project.save(ANNOTATIONS_FILE, JSON.stringify(written, null, 2), file?.version ?? null);
      return;
    } catch (error) {
      if (!(error instanceof Conflict) || attempt >= ATTEMPTS) throw error;
    }
  }
}

/**
 * Appends an annotation to the Document's list and resolves with it. The passage and its surrounding text have their
 * spaces normalized; the note is trimmed but keeps its line breaks. Rejects with Refused("empty") for a blank passage or
 * note, and with Refused("invalidAnnotations"), the file untouched, when the file is not a JSON object or the Document's
 * entry is not an array. Version-checked and retried as `change` does.
 */
export async function addAnnotation(project: Project, path: string, draft: AnnotationDraft, options: { now?: () => Date; id?: () => string } = {}): Promise<Annotation> {
  const selectedText = normalizeSpaces(draft.selectedText);
  const note = draft.note.trim();
  if (!selectedText || !note) throw new Refused("empty");
  const annotation: Annotation = {
    id: options.id?.() ?? crypto.randomUUID(),
    selectedText,
    contextBefore: normalizeSpaces(draft.contextBefore),
    contextAfter: normalizeSpaces(draft.contextAfter),
    note,
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  await change(project, path, (list) => [...list, annotation as unknown as Json]);
  return annotation;
}

/**
 * Changes an annotation's note (trimmed, inner line breaks kept); its createdAt stays and `updated` is set to now, last in
 * the entry. Resolves with the annotation as written. Refused("empty") for a blank note, Refused("missing") when the
 * annotation is not there (deleted meanwhile, or no file), Refused("invalidAnnotations") for a malformed file. Version-checked
 * and retried as `change` does: others' adds, edits and deletes are kept.
 */
export async function editAnnotation(project: Project, path: string, id: string, note: string, options: { now?: () => Date } = {}): Promise<Annotation> {
  const text = note.trim();
  if (!text) throw new Refused("empty");
  const updated = (options.now ?? (() => new Date()))().toISOString();
  let written: Annotation | null = null;
  await change(project, path, (list) => {
    const at = list.findIndex((entry) => isObject(entry) && entry.id === id);
    if (at === -1) throw new Refused("missing");
    const { updated: _old, ...entry } = list[at] as Record<string, Json>;
    const next = { ...entry, note: text, updated };
    written = toAnnotation(next);
    if (!written) throw new Refused("invalidAnnotations");
    return list.map((each, i) => (i === at ? next : each));
  });
  return written!;
}

/** Deletes an annotation; the Document's key goes when its list becomes empty. An annotation already gone resolves without writing. */
export async function removeAnnotation(project: Project, path: string, id: string): Promise<void> {
  await change(project, path, (list) => {
    const kept = list.filter((entry) => !(isObject(entry) && entry.id === id));
    return kept.length === list.length ? null : kept;
  });
}
