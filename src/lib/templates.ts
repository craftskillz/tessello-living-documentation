// Templates: a Project's library of Markdown templates, kept as files `.templates/<folder>/<name>.md` (ADR 0006). It
// never touches the Host: only the Project it is given, the one module that writes a Project folder.

import { fold } from "./search.ts";
import { Conflict, type DocumentText, FOLDER_MANIFEST, type Project, NotFound, Refused, refusalOf, TEMPLATES_FOLDER } from "./project.ts";

export { TEMPLATES_FOLDER };
/** The original application's library: one JSON file at the Project root, offered once for conversion. */
export const LEGACY_LIBRARY = ".document-templates.json";

/** A template: its folder's name, its name (file name without .md), its Project path. */
export interface TemplateEntry {
  folder: string;
  name: string;
  path: string;
}

/** A library folder and its templates, alphabetical. */
export interface TemplateFolder {
  name: string;
  templates: TemplateEntry[];
}

/** The original's library could not be read: not JSON, or not its format. The file is left untouched. */
export class InvalidLegacyLibrary extends Error {
  constructor() {
    super(`"${LEGACY_LIBRARY}" is not the original's template library.`);
    this.name = "InvalidLegacyLibrary";
  }
}

/** The copy's name: `<name> copy`, then `<name> copy 2`... the first not in `taken` (ignoring case). */
export function copyName(name: string, taken: string[]): string {
  const used = new Set(taken.map((each) => each.toLowerCase()));
  let copy = `${name} copy`;
  for (let n = 2; used.has(copy.toLowerCase()); n++) copy = `${name} copy ${n}`;
  return copy;
}

/** Whether a template matches a search query: its name or text contains it, ignoring case and accents; a blank query matches. */
export function templateMatches(name: string, text: string, query: string): boolean {
  const needle = fold(query.trim());
  return fold(name).includes(needle) || fold(text).includes(needle);
}

export interface TemplateLibrary {
  /** Folders and their templates, both alphabetical ignoring case and accents. No `.templates/`: none. Only `.md` files directly in a folder are templates (the Folder manifest liv-doc-main.md excepted); files directly in `.templates/` and deeper folders are ignored. */
  list(): Promise<TemplateFolder[]>;
  /** A template's text and version (NotFound when gone). */
  read(path: string): Promise<DocumentText>;
  /** Writes a template read at `version`; rejects with Conflict when it changed on disk meanwhile. Resolves with the new version. */
  save(path: string, text: string, version: string): Promise<string>;
  /** Creates the folder `.templates/<name>` (through Project.createFolder; its Folder manifest keeps it on disk). Rejects with Refused. */
  createFolder(name: string): Promise<void>;
  /** Renames a folder; its templates go with it. Rejects with Refused. */
  renameFolder(name: string, next: string): Promise<void>;
  /** Deletes the folder with its templates. */
  removeFolder(name: string): Promise<void>;
  /** Creates the template `<name>.md` in `folder` holding `text`; resolves with its path. Rejects with Refused: the naming rule ("empty", "characters", "edges", "extension", "reserved", "taken"), or "missing" when the folder does not exist. */
  create(folder: string, name: string, text: string): Promise<string>;
  /** Renames a template (its name without .md); resolves with its new path. Rejects with Refused as Project.rename does. Its links keep pointing at the same targets. */
  rename(path: string, name: string): Promise<string>;
  /** Moves a template to another folder, keeping its name; resolves with its new path. Rejects with Refused: "taken", "missing". Its links keep pointing at the same targets. */
  move(path: string, folder: string): Promise<string>;
  /** Copies a template next to itself as `<name> copy` (then `<name> copy 2`...), the first free name ignoring case; resolves with the copy's path. */
  duplicate(path: string): Promise<string>;
  /** The templates whose name or content contains the query (trimmed), ignoring case and accents, in list order; a blank query: every template. A file that cannot be read matches by name only. */
  search(query: string): Promise<TemplateEntry[]>;
  /** Deletes a template for good. */
  remove(path: string): Promise<void>;
  /** Whether to offer Convert to files: the Project holds `.document-templates.json` and has no `.templates/` yet. */
  offersConversion(): Promise<boolean>;
  /**
   * Writes each folder and template of `.document-templates.json` as files. A name the naming rule refuses is made
   * acceptable (refused characters become `_`, spaces and dots are trimmed from the edges, a trailing `.md` is dropped,
   * an empty name becomes "Template" or "Folder"); a name already taken in its folder, ignoring case, gets " 2", " 3"...
   * The JSON is left untouched. Resolves with the number of templates written. Rejects with InvalidLegacyLibrary, writing
   * nothing, when the file is not the original's format.
   */
  convert(): Promise<number>;
}

/** The library of `project`. */
export function openTemplates(project: Project): TemplateLibrary {
  const library: TemplateLibrary = {
    read: (path) => project.read(path),
    save: (path, text, version) => project.save(path, text, version),
    async createFolder(name) {
      await project.createFolder(TEMPLATES_FOLDER, name);
    },
    async renameFolder(name, next) {
      await project.rename(`${TEMPLATES_FOLDER}/${name}`, next);
    },
    async removeFolder(name) {
      await project.remove(`${TEMPLATES_FOLDER}/${name}`);
    },
    async create(folder, name, text) {
      const parent = `${TEMPLATES_FOLDER}/${folder}`;
      const inside = await project.entries(parent);
      if (!(await project.entries(TEMPLATES_FOLDER)).some((entry) => entry.kind === "folder" && entry.path === parent)) throw new Refused("missing");
      const reason = refusalOf("document", name, inside.filter((entry) => parentOf(entry.path) === parent).map((entry) => nameOf(entry.path)), parent);
      if (reason) throw new Refused(reason);
      const path = `${parent}/${name}.md`;
      try {
        await project.save(path, text, null);
      } catch (error) {
        throw error instanceof Conflict ? new Refused("taken") : error;
      }
      return path;
    },
    remove: (path) => project.remove(path),
    async offersConversion() {
      const legacy = await project.read(LEGACY_LIBRARY).then(() => true, (error: unknown) => (error instanceof NotFound ? false : Promise.reject(error)));
      return legacy && (await project.entries(TEMPLATES_FOLDER)).length === 0;
    },
    async convert() {
      const legacy = legacyFoldersOf((await project.read(LEGACY_LIBRARY)).text);
      const folderNames: string[] = [];
      let written = 0;
      for (const folder of legacy) {
        const name = acceptable("folder", folder.name, "Folder", folderNames, TEMPLATES_FOLDER);
        folderNames.push(name);
        await library.createFolder(name);
        const parent = `${TEMPLATES_FOLDER}/${name}`;
        const fileNames: string[] = [];
        for (const template of folder.templates) {
          const base = acceptable("document", template.name, "Template", fileNames, parent);
          fileNames.push(`${base}.md`);
          await library.create(name, base, template.content);
          written++;
        }
      }
      return written;
    },
    rename: (path, name) => project.rename(path, name),
    move: (path, folder) => project.move(path, `${TEMPLATES_FOLDER}/${folder}`),
    async duplicate(path) {
      const folder = parentOf(path);
      const taken = (await project.entries(folder)).filter((entry) => parentOf(entry.path) === folder).map((entry) => nameOf(entry.path));
      const name = copyName(withoutExtension(nameOf(path)), taken.map((each) => (isTemplateFile(each) ? withoutExtension(each) : each)));
      return library.create(nameOf(folder), name, (await project.read(path)).text);
    },
    async search(query) {
      const found: TemplateEntry[] = [];
      for (const folder of await library.list()) {
        for (const template of folder.templates) {
          const text = await project.read(template.path).then((read) => read.text, () => "");
          if (templateMatches(template.name, text, query)) found.push(template);
        }
      }
      return found;
    },
    async list() {
      const found = await project.entries(TEMPLATES_FOLDER);
      const folders = found.filter((entry) => entry.kind === "folder" && depthOf(entry.path) === 2).map((entry) => nameOf(entry.path));
      const templates = found.filter((entry) => entry.kind === "file" && depthOf(entry.path) === 3 && isTemplateFile(nameOf(entry.path)));
      return folders.sort(alphabetical).map((name) => ({
        name,
        templates: templates
          .filter((entry) => parentOf(entry.path) === `${TEMPLATES_FOLDER}/${name}`)
          .map((entry) => ({ folder: name, name: withoutExtension(nameOf(entry.path)), path: entry.path }))
          .sort((a, b) => alphabetical(a.name, b.name)),
      }));
    },
  };
  return library;
}

const alphabetical = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
const depthOf = (path: string) => path.split("/").length;
const isTemplateFile = (fileName: string) => /\.md$/i.test(fileName) && fileName !== FOLDER_MANIFEST;
const withoutExtension = (fileName: string) => fileName.slice(0, -".md".length);

/** The folders of the original's library in `text`; InvalidLegacyLibrary when it is not JSON or not that format. */
function legacyFoldersOf(text: string): { name: string; templates: { name: string; content: string }[] }[] {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new InvalidLegacyLibrary();
  }
  const isText = (value: unknown) => typeof value === "string";
  const valid =
    data?.version === 1 &&
    Array.isArray(data.folders) &&
    data.folders.every((folder: any) => isText(folder?.name) && Array.isArray(folder.templates) && folder.templates.every((template: any) => isText(template?.name) && isText(template?.content)));
  if (!valid) throw new InvalidLegacyLibrary();
  return data.folders;
}

/** `name` made acceptable to the naming rule, then numbered (" 2", " 3"...) until free among the `taken` names of `parent`. */
function acceptable(kind: "document" | "folder", name: string, fallback: string, taken: string[], parent: string): string {
  const edges = (text: string) => text.replace(/^[ .]+|[ .]+$/g, "");
  let base = edges(name.replace(/[/\\:*?"<>|]/g, "_"));
  if (kind === "document" && /\.md$/i.test(base)) base = edges(base.slice(0, -".md".length));
  if (base === "") base = fallback;
  let candidate = base;
  for (let n = 2; refusalOf(kind, candidate, taken, parent) !== null; n++) candidate = `${base} ${n}`;
  return candidate;
}
