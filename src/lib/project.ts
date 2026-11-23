// A Project: its Tree, its Documents and every change to its folder (docs/design.md §3). The only module that reads or
// writes a Project folder, through the Host's folder requests (Tessello ADR 0022).

import { type ConnectedModule, type Folder, type FolderEntry, TesselloError } from "@tessello/sdk";
import { parse } from "yaml";

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
}

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

export interface Project {
  /** The Folders and Documents, ordered as their Folder manifests say, hidden entries left out. */
  tree(): Promise<TreeEntry[]>;
  read(path: string): Promise<DocumentText>;
  /** Writes a Document read at `version`; resolves with its new version, or rejects with a Conflict. */
  save(path: string, text: string, version: string): Promise<string>;
  /**
   * What changed on disk since the last check, made by anyone but this Project (an agent, an editor, git): whether the
   * Tree changed (an entry added, removed or renamed), and the files changed, added or removed, by path. The first check
   * only notes what is there.
   */
  check(): Promise<Changes>;
}

export interface Changes {
  tree: boolean;
  documents: string[];
}

export function openProject(module: ConnectedModule, folder: Folder): Project {
  // What the last check saw, and what this Project wrote since: path → version ("" for a folder).
  let seen: Map<string, string> | null = null;
  const own = new Map<string, string>();
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
      return treeOf(entries, "", manifests);
    },
    async read(path) {
      const { content, version } = await module.files.read(folder, path);
      return { text: content, version };
    },
    async save(path, text, version) {
      try {
        const saved = (await module.files.write(folder, path, text, { ifVersion: version })).version;
        own.set(path, saved);
        return saved;
      } catch (error) {
        if (!(error instanceof TesselloError && error.code === "conflict")) throw error;
        const theirs = await this.read(path).catch((reading: unknown) => {
          if (reading instanceof TesselloError && reading.code === "not_found") return null;
          throw reading;
        });
        throw new Conflict(path, theirs);
      }
    },
  };
}

interface Manifest {
  order: string[];
  hidden: string[];
}

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

const isDocument = (name: string) => name.toLowerCase().endsWith(".md") && name !== FOLDER_MANIFEST;

/** The order and hidden lists of a manifest's frontmatter; an invalid manifest orders nothing. */
function manifestOf(text: string): Manifest {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  let data: unknown;
  try {
    data = match ? parse(match[1]!) : null;
  } catch {
    return { order: [], hidden: [] };
  }
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  const fields = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  return { order: list(fields.order), hidden: list(fields.hidden) };
}

const byName = (a: TreeEntry, b: TreeEntry) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** The entries directly in the Folder at `path`: custom order first, then Folders, then Documents. */
function treeOf(entries: FolderEntry[], path: string, manifests: Map<string, Manifest>): TreeEntry[] {
  const manifest = manifests.get(path) ?? { order: [], hidden: [] };
  const children: TreeEntry[] = [];
  for (const entry of entries) {
    if (parentOf(entry.path) !== path) continue;
    const name = nameOf(entry.path);
    if (manifest.hidden.includes(name)) continue;
    if (entry.kind === "folder") children.push({ kind: "folder", name, path: entry.path, children: treeOf(entries, entry.path, manifests) });
    else if (isDocument(name)) children.push({ kind: "document", name, path: entry.path });
  }
  const sorted = [...children.filter((entry) => entry.kind === "folder").sort(byName), ...children.filter((entry) => entry.kind === "document").sort(byName)];
  const listed = manifest.order.flatMap((name) => sorted.filter((entry) => entry.name === name));
  return [...listed, ...sorted.filter((entry) => !listed.includes(entry))];
}
