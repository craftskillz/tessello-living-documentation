// Tag marker writes (docs/spec/documents-tag-markers.md): Insert and Remove with the version check, and the names
// already used as markers in the Project.

import type { TextEdit, TextRange } from "./edits.ts";
import { applyEdits } from "./edits.ts";
import { parseDocument } from "./document.ts";
import { Conflict, type DocumentText, type Project, Refused, type TreeEntry } from "./project.ts";
import { markersOf, renderDocumentTree } from "./render.ts";
import { documentsIn } from "./search.ts";

/**
 * Applies `edit` to `base` and saves it at `base.version`. When the Document changed meanwhile, the edit is retried once
 * on what is on disk if the `guard` text is unchanged there; otherwise (guarded text changed, a second conflict, or the
 * Document gone) rejects with Refused("passageChanged"). Other failures propagate.
 */
export async function writeMarkerEdit(project: Project, path: string, base: DocumentText, edit: TextEdit, guard: TextRange): Promise<DocumentText> {
  const save = async (from: DocumentText) => {
    const text = applyEdits(from.text, [edit]);
    return { text, version: await project.save(path, text, from.version) };
  };
  try {
    return await save(base);
  } catch (error) {
    if (!(error instanceof Conflict)) throw error;
    const theirs = error.theirs;
    if (!theirs || theirs.text.slice(guard.from, guard.to) !== base.text.slice(guard.from, guard.to)) throw new Refused("passageChanged");
    try {
      return await save(theirs);
    } catch (again) {
      throw again instanceof Conflict || again instanceof RangeError ? new Refused("passageChanged") : again;
    }
  }
}

/** Writes `tag` before the character at offset `at`; `block` is the passage that must be unchanged on a conflict. */
export const insertMarker = (project: Project, path: string, base: DocumentText, at: number, tag: string, block: TextRange) =>
  writeMarkerEdit(project, path, base, { range: { from: at, to: at }, text: tag }, block);

/** Deletes the tag at `range`. */
export const removeMarker = (project: Project, path: string, base: DocumentText, range: TextRange) =>
  writeMarkerEdit(project, path, base, { range, text: "" }, range);

/** The lower-cased names of the Tag markers shown in the Project's Documents, once each, in first-seen order. */
export async function usedMarkerNames(project: Project, tree: TreeEntry[], softBreaks: boolean): Promise<string[]> {
  const names = new Set<string>();
  for (const { path } of documentsIn(tree)) {
    // A Document that cannot be read (gone, unreadable) gives no suggestion.
    const document = await project.read(path).catch(() => null);
    if (!document) continue;
    for (const { name } of markersOf(renderDocumentTree(parseDocument(document.text, path), path, {}, { softBreaks }))) names.add(name.toLowerCase());
  }
  return [...names];
}
