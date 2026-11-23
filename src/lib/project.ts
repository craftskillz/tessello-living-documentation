// A Project: its Tree, its Documents and every change to its folder (docs/design.md §3). The only module that reads or
// writes a Project folder, through the Host's folder requests (Tessello ADR 0022).

import { type ConnectedModule, type Folder, type FolderEntry, TesselloError } from "@tessello/sdk";
import { parse, stringify } from "yaml";

/** The reserved file of each Folder: its order and its hidden entries (GLOSSARY.md, Folder manifest). */
export const FOLDER_MANIFEST = "liv-doc-main.md";

export type TreeEntry = TreeFolder | TreeDocument;

export interface TreeFolder {
  kind: "folder";
  /** Its name on disk, exactly as typed. */
  name: string;
  /** Its path from the Project folder. */
  path: string;
  children: TreeEntry[];
}

export interface TreeDocument {
  kind: "document";
  /** Its file name on disk, with `.md`. */
  name: string;
  path: string;
  /**
   * The date the Tree shows: its frontmatter `timestamp` as written (`YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` to the minute,
   * never converted to another time zone, as the original), else when its file was last modified (ms since the epoch).
   */
  date: TreeDate;
}

export type TreeDate = { kind: "created"; at: string } | { kind: "modified"; at: number };

/** A Document's text, and the version it was read at. */
export interface DocumentText {
  text: string;
  version: string;
}

/**
 * A save refused because someone else (an agent, an editor, git) changed or deleted the Document since it was read.
 * `theirs` is what is on disk now, or null when the Document is gone.
 */
export class Conflict extends Error {
  readonly theirs: DocumentText | null;

  constructor(path: string, theirs: DocumentText | null) {
    super(`"${path}" changed since it was read.`);
    this.name = "Conflict";
    this.theirs = theirs;
  }
}

/** A read of a file that does not exist (a link to a missing Document, an image that is gone). */
export class NotFound extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`"${path}" does not exist.`);
    this.name = "NotFound";
    this.path = path;
  }
}

/** Why a name or a change is refused; each reason has a translated message in the View. */
export type RefusalReason = "empty" | "characters" | "edges" | "extension" | "reserved" | "taken" | "invalidManifest";

/** A new entry refused: its name breaks the naming rule, or its Folder's manifest is invalid. */
export class Refused extends Error {
  readonly reason: RefusalReason;

  constructor(reason: RefusalReason) {
    super(`Refused: ${reason}.`);
    this.name = "Refused";
    this.reason = reason;
  }
}

/** The file name of a new Document named `name`: `.md` is always added (a Name ending in `.md` is refused). */
export const documentFile = (name: string) => `${name}.md`;

/**
 * The naming rule for a new entry named `name` (exactly as typed, never trimmed or changed) among the names of the
 * entries already in its Folder (`siblings`, every file and folder name, manifest included). null when allowed.
 * For a Document, `name` is the Name the User typed and the entry's name is `<name>.md`; a Name ending in `.md` (any
 * case) is refused, so no file is ever named `x.md.md`.
 */
export function refusalOf(kind: "document" | "folder", name: string, siblings: string[]): RefusalReason | null {
  if (name === "") return "empty";
  if (/[/\\:*?"<>|]/.test(name)) return "characters";
  if (/^[ .]|[ .]$/.test(name)) return "edges";
  if (kind === "document" && name.toLowerCase().endsWith(".md")) return "extension";
  const entry = (kind === "document" ? documentFile(name) : name).toLowerCase();
  if (entry === FOLDER_MANIFEST) return "reserved";
  if (siblings.some((sibling) => sibling.toLowerCase() === entry)) return "taken";
  return null;
}

export interface Project {
  /** The Folders and Documents, ordered as their Folder manifests say, hidden entries left out. */
  tree(): Promise<TreeEntry[]>;
  /** A Document's text and version; rejects with NotFound when it does not exist. Other failures propagate unchanged. */
  read(path: string): Promise<DocumentText>;
  /** An image's bytes, exactly as on disk; rejects with NotFound when it does not exist. */
  readImage(path: string): Promise<Uint8Array>;
  /** Writes a Document read at `version`; resolves with its new version, or rejects with a Conflict. */
  save(path: string, text: string, version: string): Promise<string>;
  /**
   * What changed on disk since the last check, made by anyone but this Project (an agent, an editor, git): whether the
   * Tree changed (an entry added, removed or renamed), and the files changed, added or removed, by path. The first check
   * only notes what is there.
   */
  check(): Promise<Changes>;
  /** Creates the Document `<name>.md` in the Folder `folder` ("" = Project root): frontmatter `timestamp` only, then `# <name>`. Resolves with its path. Rejects with Refused. */
  createDocument(folder: string, name: string): Promise<string>;
  /** Creates the Folder `name` in `parent`, holding an empty Folder manifest. Resolves with its path. Rejects with Refused. */
  createFolder(parent: string, name: string): Promise<string>;
}

export interface Changes {
  tree: boolean;
  documents: string[];
}

export function openProject(module: ConnectedModule, folder: Folder, options: { now?: () => Date } = {}): Project {
  const clock = options.now ?? (() => new Date());
  // What the last check saw, and what this Project wrote since: path → version ("" for a folder).
  let seen: Map<string, string> | null = null;
  const own = new Map<string, string>();

  /** Creates the entry `entry` (a file, or a Folder holding its manifest) in `parent`, after the naming rule and its Folder's manifest. */
  async function create(kind: "document" | "folder", parent: string, name: string, entry: string, content: string): Promise<string> {
    const siblings = (await listChildren(parent)).map((entry) => nameOf(entry.path));
    const reason = refusalOf(kind, name, siblings);
    if (reason) throw new Refused(reason);
    const manifestPath = parent === "" ? FOLDER_MANIFEST : `${parent}/${FOLDER_MANIFEST}`;
    const manifest = await module.files.read(folder, manifestPath).catch((error: unknown) => {
      if (error instanceof TesselloError && error.code === "not_found") return null;
      throw error;
    });
    const appended = manifest && appendedToOrder(manifest.content, entry);
    if (appended === undefined) throw new Refused("invalidManifest");
    const path = parent === "" ? entry : `${parent}/${entry}`;
    const target = kind === "folder" ? `${path}/${FOLDER_MANIFEST}` : path;
    try {
      own.set(target, (await module.files.write(folder, target, content, { ifVersion: null })).version);
    } catch (error) {
      if (error instanceof TesselloError && error.code === "conflict") throw new Refused("taken");
      throw error;
    }
    if (manifest && appended !== manifest.content) {
      try {
        own.set(manifestPath, (await module.files.write(folder, manifestPath, appended!, { ifVersion: manifest.version })).version);
      } catch (error) {
        // Someone changed the manifest meanwhile: the entry exists, the User can order it by hand.
        if (!(error instanceof TesselloError && error.code === "conflict")) throw error;
      }
    }
    return path;
  }

  /** The entries directly in `parent` ("" = the Project folder); none when it does not exist. */
  async function listChildren(parent: string): Promise<FolderEntry[]> {
    const entries = await module.files.list(folder, parent === "" ? undefined : parent).catch((error: unknown) => {
      if (error instanceof TesselloError && error.code === "not_found") return [];
      throw error;
    });
    return entries.filter((entry) => parentOf(entry.path) === parent);
  }

  return {
    async check() {
      const now = new Map((await module.files.list(folder)).map((entry) => [entry.path, entry.kind === "file" ? entry.version : ""]));
      const before = seen;
      seen = now;
      if (!before) {
        own.clear();
        return { tree: false, documents: [] };
      }
      const paths = new Set([...before.keys(), ...now.keys()]);
      const tree = [...paths].some((path) => before.has(path) !== now.has(path));
      const documents = [...paths]
        .filter((path) => {
          const version = now.get(path);
          if (version === "" || before.get(path) === version) return false;
          // A file this Project wrote, still at the version it wrote.
          return version === undefined || own.get(path) !== version;
        })
        .sort();
      own.clear();
      return { tree, documents };
    },
    async tree() {
      const entries = await module.files.list(folder);
      const manifests = new Map<string, Manifest>();
      for (const entry of entries) {
        if (entry.kind === "file" && nameOf(entry.path) === FOLDER_MANIFEST) {
          manifests.set(parentOf(entry.path), manifestOf((await module.files.read(folder, entry.path)).content));
        }
      }
      const dates = new Map<string, TreeDate>();
      await Promise.all(
        entries.map(async (entry) => {
          if (entry.kind !== "file" || !isDocument(nameOf(entry.path))) return;
          const created = await module.files.read(folder, entry.path).then(({ content }) => createdOf(content), () => null);
          dates.set(entry.path, created ? { kind: "created", at: created } : { kind: "modified", at: entry.modified });
        }),
      );
      return treeOf(entries, "", manifests, dates);
    },
    async read(path) {
      try {
        const { content, version } = await module.files.read(folder, path);
        return { text: content, version };
      } catch (error) {
        throw missing(error, path);
      }
    },
    async readImage(path) {
      try {
        const { content } = await module.files.read(folder, path, { as: "bytes" });
        // The Test Host hands the bytes over as a JSON object ({"0": 137, ...}); a browser Host as a Uint8Array.
        return content instanceof Uint8Array ? content : Uint8Array.from(Object.values(content as Record<string, number>));
      } catch (error) {
        throw missing(error, path);
      }
    },
    async createDocument(parent, name) {
      return create("document", parent, name, documentFile(name), `---\ntimestamp: ${clock().toISOString()}\n---\n# ${name}\n`);
    },
    async createFolder(parent, name) {
      return create("folder", parent, name, name, EMPTY_MANIFEST);
    },
    async save(path, text, version) {
      try {
        const saved = (await module.files.write(folder, path, text, { ifVersion: version })).version;
        own.set(path, saved);
        return saved;
      } catch (error) {
        if (!(error instanceof TesselloError && error.code === "conflict")) throw error;
        const theirs = await this.read(path).catch((reading: unknown) => {
          if (reading instanceof NotFound) return null;
          throw reading;
        });
        throw new Conflict(path, theirs);
      }
    },
  };
}

/** The original's empty Folder manifest: a Folder exists on disk only through a file. */
const EMPTY_MANIFEST = "---\norder: []\nhidden: []\n---\n";

/** The error a failed read of `path` becomes: NotFound when the file is missing, the error itself otherwise. */
const missing = (error: unknown, path: string) => (error instanceof TesselloError && error.code === "not_found" ? new NotFound(path) : error);

interface Manifest {
  order: string[];
  hidden: string[];
}

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

const isDocument = (name: string) => name.toLowerCase().endsWith(".md") && name !== FOLDER_MANIFEST;

/**
 * The fields of the `---` fenced YAML frontmatter at the top of `text`, and the offset where that block ends (its closing
 * line break included); null when there is no block, or it is not valid YAML, or not a mapping.
 */
function frontmatterOf(text: string): { fields: Record<string, unknown>; end: number } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!match) return null;
  let data: unknown;
  try {
    data = parse(match[1]!);
  } catch {
    return null;
  }
  return typeof data === "object" && data !== null && !Array.isArray(data) ? { fields: data as Record<string, unknown>, end: match[0].length } : null;
}

/** The order and hidden lists of a manifest's frontmatter; an invalid manifest orders nothing. */
function manifestOf(text: string): Manifest {
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  const fields = frontmatterOf(text)?.fields ?? {};
  return { order: list(fields.order), hidden: list(fields.hidden) };
}

/**
 * The manifest `text` with `name` appended to its `order` unless already listed or `order` is empty or absent (then the
 * text itself, byte for byte); undefined when the manifest is invalid: no `---` fenced frontmatter, or one that is not
 * valid YAML or not a mapping. The other fields keep their order, the body is kept byte for byte.
 */
function appendedToOrder(text: string, name: string): string | undefined {
  const frontmatter = frontmatterOf(text);
  if (!frontmatter) return undefined;
  const { fields, end } = frontmatter;
  if (!Array.isArray(fields.order) || fields.order.length === 0 || fields.order.includes(name)) return text;
  const lineBreak = /\r?\n$/.exec(text.slice(0, end))?.[0] ?? "";
  return `---\n${stringify({ ...fields, order: [...fields.order, name] }, { lineWidth: 0 })}---${lineBreak}${text.slice(end)}`;
}

/** A Document's frontmatter `timestamp`, to the day or the minute as written; null when it has none that reads as a date. */
function createdOf(text: string): string | null {
  const timestamp = frontmatterOf(text)?.fields.timestamp;
  const date = typeof timestamp === "string" ? /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(timestamp.trim()) : null;
  return date ? (date[2] ? `${date[1]}T${date[2]}` : date[1]!) : null;
}

const byName = (a: TreeEntry, b: TreeEntry) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** The entries directly in the Folder at `path`: custom order first, then Folders, then Documents. */
function treeOf(entries: FolderEntry[], path: string, manifests: Map<string, Manifest>, dates: Map<string, TreeDate>): TreeEntry[] {
  const manifest = manifests.get(path) ?? { order: [], hidden: [] };
  const children: TreeEntry[] = [];
  for (const entry of entries) {
    if (parentOf(entry.path) !== path) continue;
    const name = nameOf(entry.path);
    if (manifest.hidden.includes(name)) continue;
    if (entry.kind === "folder") children.push({ kind: "folder", name, path: entry.path, children: treeOf(entries, entry.path, manifests, dates) });
    else if (isDocument(name)) children.push({ kind: "document", name, path: entry.path, date: dates.get(entry.path) ?? { kind: "modified", at: entry.modified } });
  }
  const sorted = [...children.filter((entry) => entry.kind === "folder").sort(byName), ...children.filter((entry) => entry.kind === "document").sort(byName)];
  const listed = manifest.order.flatMap((name) => sorted.filter((entry) => entry.name === name));
  return [...listed, ...sorted.filter((entry) => !listed.includes(entry))];
}
