// A Project's settings: the keys of its `.living-doc.json` the Module reads and changes. The file keeps the original's
// format (docs/adr/0003): other keys and their order stay as written.

import type { Json } from "@tessello/sdk";
import { NotFound, type Project, Refused } from "./project.ts";

/** The Project's metadata file, shared with the original application. */
export const SETTINGS_FILE = ".living-doc.json";

export interface ProjectSettings {
  /** The original's `markdownSoftBreaks`: every newline in a Document is a line break. On unless the file says false. */
  softBreaks: boolean;
}

/** What a Project without the file, or with a malformed one, has: the original's defaults. */
export const DEFAULT_SETTINGS: ProjectSettings = { softBreaks: true };

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

/** The Project's settings; a missing, malformed or odd file, or a value that is not a boolean, gives the default. Other read failures propagate. */
export async function readSettings(project: Project): Promise<ProjectSettings> {
  const file = await readFile(project);
  const value = file ? parseObject(file.text)?.markdownSoftBreaks : undefined;
  return { softBreaks: typeof value === "boolean" ? value : DEFAULT_SETTINGS.softBreaks };
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
