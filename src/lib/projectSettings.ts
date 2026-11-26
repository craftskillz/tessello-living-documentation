// A Project's settings: the keys of its `.living-doc.json` the Module reads and changes. The file keeps the original's
// format (docs/adr/0003): other keys and their order stay as written.

import type { Json } from "@tessello/sdk";
import { normalizeTagNames } from "./tagMarkers.ts";
import { DEFAULT_VISIBILITY, NotFound, type Project, Refused, type TreeVisibility } from "./project.ts";

/** The Project's metadata file, shared with the original application. */
export const SETTINGS_FILE = ".living-doc.json";

export interface ProjectSettings {
  /** The original's `markdownSoftBreaks`: every newline in a Document is a line break. On unless the file says false. */
  softBreaks: boolean;
  /** The Tree's `treeShownExtensions` and `treeExcluded`: which files it shows and which names count as hidden. */
  visibility: TreeVisibility;
  /** The original's `tagSuggestions`: the Tag names offered when inserting a marker (normalized; invalid entries dropped). */
  tagNames: string[];
}

/** What a Project without the file, or with a malformed one, has: the original's defaults. */
export const DEFAULT_SETTINGS: ProjectSettings = { softBreaks: true, visibility: DEFAULT_VISIBILITY, tagNames: [] };

/** The settings file with its version; null when it does not exist. Other read failures propagate. */
const readFile = (project: Project) =>
  project.read(SETTINGS_FILE).catch((error: unknown) => {
    if (error instanceof NotFound) return null;
    throw error;
  });

const isObject = (value: unknown): value is Record<string, Json> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The parsed object of a settings file's text, or null when it is not JSON or not an object. */
function parseObject(text: string): Record<string, Json> | null {
  try {
    const data: unknown = JSON.parse(text);
    return isObject(data) ? data : null;
  } catch {
    return null;
  }
}

/** The strings of a JSON array, or null when the value is not an array of strings. */
const stringList = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]) : null;

/** Extensions as the Tree compares them: trimmed, no leading dot, lower case, empty items dropped. */
const normalizeExtensions = (list: string[]) => list.map((item) => item.trim().replace(/^\./, "").toLowerCase()).filter(Boolean);

/** Excluded names as the Tree compares them: trimmed, empty items dropped, otherwise exact. */
const normalizeNames = (list: string[]) => list.map((item) => item.trim()).filter(Boolean);

/** The Project's settings; a missing, malformed or odd file, or a value that is not a boolean (or, for the Tree's lists, not an array of strings), gives the default. Other read failures propagate. */
export async function readSettings(project: Project): Promise<ProjectSettings> {
  const file = await readFile(project);
  const data = file ? parseObject(file.text) : null;
  const value = data?.markdownSoftBreaks;
  const shown = stringList(data?.treeShownExtensions);
  const excluded = stringList(data?.treeExcluded);
  const tags = stringList(data?.tagSuggestions);
  return {
    softBreaks: typeof value === "boolean" ? value : DEFAULT_SETTINGS.softBreaks,
    visibility: {
      shownExtensions: shown ? normalizeExtensions(shown) : DEFAULT_VISIBILITY.shownExtensions,
      excluded: excluded ? normalizeNames(excluded) : DEFAULT_VISIBILITY.excluded,
    },
    tagNames: tags ? normalizeTagNames(tags).names : [],
  };
}

/** The indentation a JSON text uses (tab or spaces of its first indented line), two spaces when it has none. */
const indentOf = (text: string) => text.match(/^([ \t]+)\S/m)?.[1] ?? "  ";

/**
 * Sets `key` to `value` in the Project's settings file, leaving every other key, their order and the file's indentation
 * as written. Creates the file when it is missing. Written at the version read: rejects with Conflict when the file
 * changed meanwhile, and with Refused("invalidSettings"), the file untouched, when it is not a JSON object.
 */
export async function changeSetting(project: Project, key: string, value: Json): Promise<void> {
  const file = await readFile(project);
  const settings = file ? parseObject(file.text) : {};
  if (!settings) throw new Refused("invalidSettings");
  const text = `${JSON.stringify({ ...settings, [key]: value }, null, file ? indentOf(file.text) : "  ")}\n`;
  await project.save(SETTINGS_FILE, text, file?.version ?? null);
}

/** Turns "every newline is a line break" on or off for the Project. */
export const setSoftBreaks = (project: Project, on: boolean) => changeSetting(project, "markdownSoftBreaks", on);

/** Sets the extensions of the other files the Tree shows (normalized: no dot, lower case, no empty item). */
export const setShownExtensions = (project: Project, list: string[]) => changeSetting(project, "treeShownExtensions", normalizeExtensions(list));

/** Sets the names of the folders and files, at any depth, the Tree treats as hidden (trimmed, no empty item). */
export const setExcluded = (project: Project, list: string[]) => changeSetting(project, "treeExcluded", normalizeNames(list));

/** Sets the Project's Tag names (normalized: brackets off, lower case, duplicates and invalid names out). */
export const setTagNames = (project: Project, names: string[]) => changeSetting(project, "tagSuggestions", normalizeTagNames(names).names);

/** The items of a comma-separated text, trimmed, empty ones dropped; otherwise as typed. */
export const parseList = (text: string): string[] =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/** A list as the dialog shows it: items joined with ", ". */
export const formatList = (list: string[]): string => list.join(", ");
