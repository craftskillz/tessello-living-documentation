// A Project: its Tree, its Documents and every change to its folder (docs/design.md §3). The only module that reads or
// writes a Project folder, through the Host's folder requests (Tessello ADR 0022).

import { type ConnectedModule, type Folder, type FolderEntry, TesselloError } from "@tessello/sdk";
import { parse, stringify } from "yaml";
import { parseDocument } from "./document.ts";
import { entryMapper, type PathMapper, rewriteLinks, unlinkDeletedLinks } from "./links.ts";
import { isImageName } from "./otherFiles.ts";

/** The reserved file of each Folder: its order and its hidden entries (GLOSSARY.md, Folder manifest). */
export const FOLDER_MANIFEST = "liv-doc-main.md";

export type TreeEntry = TreeFolder | TreeDocument | TreeManifest | TreeFile;

export interface TreeFolder {
  kind: "folder";
  /** Its name on disk, exactly as typed. */
  name: string;
  /** Its path from the Project folder. */
  path: string;
  /** Whether its own Folder's manifest hides it (only in a Tree with hidden items shown). */
  hidden: boolean;
  children: TreeEntry[];
}

/** A Folder's manifest, `liv-doc-main.md` (only in a Tree with hidden items shown). */
export interface TreeManifest {
  kind: "manifest";
  name: string;
  path: string;
}

/** A file that is not a Document: an image, an attachment, any other (only in a Tree with hidden items shown). */
export interface TreeFile {
  kind: "file";
  name: string;
  path: string;
}

export interface TreeDocument {
  kind: "document";
  /** Its file name on disk, with `.md`. */
  name: string;
  path: string;
  /** Whether its Folder's manifest hides it (only in a Tree with hidden items shown). */
  hidden: boolean;
  /** Its displayed title: frontmatter `title`, else its first heading, else its file name without `.md`. */
  title: string;
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
export type RefusalReason = "empty" | "characters" | "edges" | "extension" | "reserved" | "taken" | "invalidManifest" | "intoItself" | "missing" | "reservedFolder" | "invalidSettings";

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
export function refusalOf(kind: "document" | "folder", name: string, siblings: string[], parent?: string): RefusalReason | null {
  if (name === "") return "empty";
  if (/[/\\:*?"<>|]/.test(name)) return "characters";
  if (/^[ .]|[ .]$/.test(name)) return "edges";
  if (kind === "document" && name.toLowerCase().endsWith(".md")) return "extension";
  if (parent !== undefined && (isInsideReserved(parent) || (kind === "folder" && parent === "" && isReservedFolder(name)))) return "reservedFolder";
  const entry = (kind === "document" ? documentFile(name) : name).toLowerCase();
  if (entry === FOLDER_MANIFEST) return "reserved";
  if (siblings.some((sibling) => sibling.toLowerCase() === entry)) return "taken";
  return null;
}

/** `images/` and `files/` at the Project root hold pasted images and attachments: they cannot be renamed, moved or deleted, nor receive new entries. */
export const isReservedFolder = (path: string) => path === "images" || path === "files";

/** Whether `path` is a reserved Folder or inside one. */
export const isInsideReserved = (path: string) => isReservedFolder(path) || path.startsWith("images/") || path.startsWith("files/");

/** What deleting an entry would remove, to confirm with the User. */
export interface Deletion {
  /** What goes with it: for a Document 1/0/0; for a Folder, at any depth, its Documents (manifests excepted), its images and its other files. */
  documents: number;
  images: number;
  others: number;
  /** The Documents outside it with at least one Link (an Image does not count) to it or, for a Folder, to anything inside it. */
  linking: number;
}

export interface Project {
  /**
   * The Folders and Documents, ordered as their Folder manifests say, hidden entries left out. With `hidden`, the hidden
   * entries are there too (flagged, at their place), each Folder's manifest comes first and its other files last.
   */
  tree(options?: { hidden?: boolean }): Promise<TreeEntry[]>;
  /** A Document's text and version; rejects with NotFound when it does not exist. Other failures propagate unchanged. */
  read(path: string): Promise<DocumentText>;
  /** When the file at `path` was last modified (ms since the epoch), as the disk says; null when there is no such file. Lists only its Folder. */
  modified(path: string): Promise<number | null>;
  /**
   * The distinct Types written in the Project's Documents (hidden ones included; not the Folder manifests nor `.templates/`),
   * as written, sorted alphabetically ignoring case and accents. A file that cannot be read is skipped.
   */
  types(): Promise<string[]>;
  /** Any file's bytes, exactly as on disk (an image, an attachment); rejects with NotFound when it does not exist. */
  readBytes(path: string): Promise<Uint8Array>;
  /** Writes a Document read at `version` (`null`: create it, it must not exist); resolves with its new version, or rejects with a Conflict. */
  save(path: string, text: string, version: string | null): Promise<string>;
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
  /**
   * Renames the Document or Folder at `path`. For a Document `name` is the Name without `.md` (added, as for createDocument);
   * a Folder's name is used as typed. Resolves with the new path (the same path when the name is unchanged: nothing is
   * written). Rejects with Refused.
   */
  rename(path: string, name: string): Promise<string>;
  /**
   * Moves the Document or Folder at `path` into the Folder `folder` ("" = root). With `position`, the entry is placed just
   * before or after its sibling named `position.before` / `position.after` (a name on disk, in `folder`), and the
   * destination manifest's `order` is written with it there; without one it is appended to the destination's custom
   * order, if it has one. Resolves with the new path. Rejects with Refused.
   */
  move(path: string, folder: string, position?: { before: string } | { after: string }): Promise<string>;
  /**
   * Hides or shows the entry at `path`: its name is added to, or taken out of, its Folder manifest's `hidden` list (a
   * Folder without a manifest gets one). Rejects with Refused ("reserved" for a manifest, "missing", "invalidManifest").
   */
  setHidden(path: string, hidden: boolean): Promise<void>;
  /** What deleting the entry at `path` removes, and how many Documents link to it. Rejects with Refused("missing"). */
  deletion(path: string): Promise<Deletion>;
  /**
   * Deletes the Document, or the Folder with everything in it, for good. Its name leaves its Folder manifest, and the
   * Links to it in the other Documents become their text. Rejects with Refused ("reserved", "reservedFolder", "missing",
   * "invalidManifest").
   */
  remove(path: string): Promise<void>;
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
  // The files this Project moved away or deleted since the last check.
  const gone = new Set<string>();

  /** Creates the entry `entry` (a file, or a Folder holding its manifest) in `parent`, after the naming rule and its Folder's manifest. */
  async function create(kind: "document" | "folder", parent: string, name: string, entry: string, content: string): Promise<string> {
    const siblings = (await listChildren(parent)).map((entry) => nameOf(entry.path));
    const reason = refusalOf(kind, name, siblings, parent);
    if (reason) throw new Refused(reason);
    const manifestPath = manifestPathOf(parent);
    const manifest = await readOrNull(manifestPath);
    const appended = manifest && appendedToOrder(manifest.content, entry);
    if (appended === undefined) throw new Refused("invalidManifest");
    const path = join(parent, entry);
    const target = kind === "folder" ? `${path}/${FOLDER_MANIFEST}` : path;
    try {
      own.set(target, (await module.files.write(folder, target, content, { ifVersion: null })).version);
    } catch (error) {
      throw isCode(error, "conflict") ? new Refused("taken") : error;
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

  /** A file's text and version, or null when it does not exist. */
  async function readOrNull(path: string) {
    return module.files.read(folder, path).catch((error: unknown) => {
      if (isCode(error, "not_found")) return null;
      throw error;
    });
  }

  /**
   * Rewrites the file at `path` with `edit` (given its text, null when it does not exist; returns null or the same text
   * for no change), at the version it was read at. Another writer meanwhile: read again and retry once, then the conflict propagates.
   */
  async function update(path: string, edit: (text: string | null) => string | null): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const current = await readOrNull(path);
      const next = edit(current?.content ?? null);
      if (next === null || next === current?.content) return;
      try {
        own.set(path, (await module.files.write(folder, path, next, { ifVersion: current?.version ?? null })).version);
        return;
      } catch (error) {
        if (!isCode(error, "conflict") || attempt > 0) throw error;
      }
    }
  }

  /**
   * The order of the Folder whose manifest is `manifestPath` and entries `siblings`, as the Tree orders it but counting
   * hidden entries, and the same with `name` just before or after `position`'s sibling (at the end when it is not there).
   */
  async function orderWith(manifestPath: string, siblings: FolderEntry[], name: string, position: { before: string } | { after: string }) {
    const manifest = manifestOf((await readOrNull(manifestPath))?.content ?? "");
    const entries = siblings.flatMap((entry) => {
      const each = nameOf(entry.path);
      return entry.kind === "folder" || isDocument(each) ? [{ kind: entry.kind, name: each }] : [];
    });
    const current = ordered(entries, manifest.order).map((entry) => entry.name);
    const others = current.filter((each) => each !== name);
    const sibling = "before" in position ? position.before : position.after;
    const at = others.indexOf(sibling);
    const index = at === -1 ? others.length : "before" in position ? at : at + 1;
    const next = [...others.slice(0, index), name, ...others.slice(index)];
    return { next, changed: next.some((each, i) => each !== current[i]) || next.length !== current.length };
  }

  /** Refuses an entry whose Folder `parent` has a manifest that is present but invalid. */
  async function requireValidManifest(parent: string): Promise<void> {
    const manifest = await readOrNull(manifestPathOf(parent));
    if (manifest && !frontmatterOf(manifest.content)) throw new Refused("invalidManifest");
  }

  /** Whether the entry at `path` is a Folder; Refused("missing") when there is nothing there. */
  async function isFolderAt(path: string): Promise<boolean> {
    const found = (await listChildren(parentOf(path))).find((entry) => entry.path === path);
    if (!found) throw new Refused("missing");
    return found.kind === "folder";
  }

  /**
   * Moves `from` to `to` in the Host, then runs `afterwards` (the manifests), rewrites the Links of the Project's Markdown
   * files, and records what this Project wrote or moved as its own. `viaTemp` goes through a temporary name (a change of
   * case only, which a case-insensitive disk takes for an existing destination).
   */
  async function relocate(from: string, to: string, isFolder: boolean, viaTemp: boolean, afterwards: () => Promise<void>): Promise<void> {
    const before = await module.files.list(folder);
    try {
      if (viaTemp) {
        await module.files.move(folder, from, `${to}.liv-doc-renaming`);
        await module.files.move(folder, `${to}.liv-doc-renaming`, to);
      } else await module.files.move(folder, from, to);
    } catch (error) {
      throw isCode(error, "conflict") ? new Refused("taken") : error;
    }
    await afterwards();
    const map = entryMapper(from, to, isFolder);
    for (const entry of before) if (map(entry.path) !== null) gone.add(entry.path);
    await followLinks(before, map);
    const after = await module.files.list(folder);
    // A Folder emptied by the move is gone with it.
    for (const entry of before) if (entry.kind === "folder" && !after.some((each) => each.path === entry.path)) gone.add(entry.path);
    for (const entry of after) {
      if (entry.kind === "file" && (entry.path === to || entry.path.startsWith(`${to}/`))) own.set(entry.path, entry.version);
    }
  }

  /** Rewrites the Links of every Markdown file listed in `before`, now at the path `map` gives. */
  async function followLinks(before: FolderEntry[], map: PathMapper): Promise<void> {
    for (const entry of before) {
      if (entry.kind !== "file" || !entry.path.toLowerCase().endsWith(".md")) continue;
      await update(map(entry.path) ?? entry.path, (text) => (text === null ? null : rewriteLinks(text, entry.path, map)));
    }
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
        gone.clear();
        return { tree: false, documents: [] };
      }
      const paths = new Set([...before.keys(), ...now.keys()]);
      const tree = [...paths].some((path) => before.has(path) !== now.has(path));
      const documents = [...paths]
        .filter((path) => {
          const version = now.get(path);
          if (version === "" || before.get(path) === version) return false;
          // A file this Project wrote, still at the version it wrote.
          return version === undefined ? !gone.has(path) : own.get(path) !== version;
        })
        .sort();
      own.clear();
      gone.clear();
      return { tree, documents };
    },
    async tree(options = {}) {
      const entries = await module.files.list(folder);
      const manifests = new Map<string, Manifest>();
      for (const entry of entries) {
        if (entry.kind === "file" && nameOf(entry.path) === FOLDER_MANIFEST) {
          manifests.set(parentOf(entry.path), manifestOf((await module.files.read(folder, entry.path)).content));
        }
      }
      const dates = new Map<string, TreeDate>();
      const titles = new Map<string, string>();
      await Promise.all(
        entries.map(async (entry) => {
          if (entry.kind !== "file" || !isDocument(nameOf(entry.path))) return;
          const content = await module.files.read(folder, entry.path).then((file) => file.content, () => null);
          const document = parseDocument(content ?? "", entry.path);
          const created = content === null ? null : document.created;
          titles.set(entry.path, document.title);
          dates.set(entry.path, created ? { kind: "created", at: created } : { kind: "modified", at: entry.modified });
        }),
      );
      return treeOf(entries, "", manifests, dates, titles, options.hidden ?? false);
    },
    async read(path) {
      try {
        const { content, version } = await module.files.read(folder, path);
        return { text: content, version };
      } catch (error) {
        throw missing(error, path);
      }
    },
    async modified(path) {
      const found = (await listChildren(parentOf(path))).find((entry) => entry.kind === "file" && entry.path === path);
      return found?.kind === "file" ? found.modified : null;
    },
    async types() {
      const entries = await module.files.list(folder);
      const found = await Promise.all(
        entries.map(async (entry) => {
          if (entry.kind !== "file" || !isDocument(nameOf(entry.path)) || entry.path.startsWith(".templates/")) return null;
          const content = await module.files.read(folder, entry.path).then((file) => file.content, () => null);
          return content === null ? null : parseDocument(content, entry.path).type;
        }),
      );
      const used = new Set(found.filter((type): type is string => type !== null));
      return [...used].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    },
    async readBytes(path) {
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
    async rename(path, name) {
      if (nameOf(path).toLowerCase() === FOLDER_MANIFEST) throw new Refused("reserved");
      if (isReservedFolder(path)) throw new Refused("reservedFolder");
      const isFolder = await isFolderAt(path);
      const parent = parentOf(path);
      const old = nameOf(path);
      const siblings = (await listChildren(parent)).map((entry) => nameOf(entry.path)).filter((each) => each !== old);
      const reason = refusalOf(isFolder ? "folder" : "document", name, siblings, parent);
      if (reason) throw new Refused(reason);
      const entry = isFolder ? name : documentFile(name);
      if (entry === old) return path;
      await requireValidManifest(parent);
      const to = join(parent, entry);
      const caseOnly = entry.toLowerCase() === old.toLowerCase();
      await relocate(path, to, isFolder, caseOnly, () => update(manifestPathOf(parent), (text) => (text && renamedIn(text, old, entry)) ?? null));
      return to;
    },
    async move(path, destination, position) {
      if (nameOf(path).toLowerCase() === FOLDER_MANIFEST) throw new Refused("reserved");
      if (isReservedFolder(path) || isInsideReserved(destination)) throw new Refused("reservedFolder");
      const isFolder = await isFolderAt(path);
      if (isFolder && destination === "" && isReservedFolder(nameOf(path))) throw new Refused("reservedFolder");
      if (isFolder && (destination === path || destination.startsWith(`${path}/`))) throw new Refused("intoItself");
      const source = parentOf(path);
      const name = nameOf(path);
      if (destination === source && !position) return path;
      if (destination !== "" && !(await listChildren(parentOf(destination))).some((entry) => entry.kind === "folder" && entry.path === destination)) {
        throw new Refused("missing");
      }
      const siblings = await listChildren(destination);
      if (destination !== source && siblings.some((entry) => nameOf(entry.path).toLowerCase() === name.toLowerCase())) throw new Refused("taken");
      await requireValidManifest(source);
      await requireValidManifest(destination);
      const destinationManifest = manifestPathOf(destination);
      const order = position ? await orderWith(destinationManifest, siblings, name, position) : null;
      if (destination === source) {
        if (order && order.changed) await update(destinationManifest, (text) => withOrder(text, order.next));
        return path;
      }
      const to = join(destination, name);
      await relocate(path, to, isFolder, false, async () => {
        await update(destinationManifest, (text) => (order ? withOrder(text, order.next) : text && appendedToOrder(text, name)) ?? null);
        await update(manifestPathOf(source), (text) => (text && removedFrom(text, name)) ?? null);
      });
      return to;
    },
    async setHidden(path, hidden) {
      const name = nameOf(path);
      if (name.toLowerCase() === FOLDER_MANIFEST) throw new Refused("reserved");
      await isFolderAt(path);
      const parent = parentOf(path);
      await requireValidManifest(parent);
      await update(manifestPathOf(parent), (text) => {
        if (text === null) return hidden ? `---\n${stringify({ order: [], hidden: [name] }, { lineWidth: 0 })}---\n` : null;
        return (
          editedFields(text, (fields) => {
            const listed = Array.isArray(fields.hidden) ? fields.hidden : [];
            if (listed.includes(name) === hidden) return null;
            return { ...fields, hidden: hidden ? [...listed, name] : listed.filter((item) => item !== name) };
          }) ?? null
        );
      });
    },
    async deletion(path) {
      const isFolder = await isFolderAt(path);
      const before = await module.files.list(folder);
      const goes = deletedBy(path, isFolder);
      const counts = { documents: 0, images: 0, others: 0 };
      for (const entry of before) {
        const name = nameOf(entry.path);
        if (entry.kind !== "file" || !goes(entry.path) || name === FOLDER_MANIFEST || name === ".DS_Store") continue;
        if (isDocument(name)) counts.documents++;
        else if (isImageName(name)) counts.images++;
        else counts.others++;
      }
      let linking = 0;
      for (const entry of before) {
        if (entry.kind !== "file" || goes(entry.path) || !isDocument(nameOf(entry.path))) continue;
        const text = (await readOrNull(entry.path))?.content;
        if (text !== undefined && unlinkDeletedLinks(text, entry.path, goes) !== text) linking++;
      }
      return { ...counts, linking };
    },
    async remove(path) {
      const name = nameOf(path);
      if (name.toLowerCase() === FOLDER_MANIFEST) throw new Refused("reserved");
      if (isReservedFolder(path)) throw new Refused("reservedFolder");
      const isFolder = await isFolderAt(path);
      const parent = parentOf(path);
      await requireValidManifest(parent);
      const before = await module.files.list(folder);
      const goes = deletedBy(path, isFolder);
      await module.files.delete(folder, path);
      await update(manifestPathOf(parent), (text) => (text && removedFrom(text, name)) ?? null);
      for (const entry of before) {
        if (entry.kind !== "file" || goes(entry.path) || !isDocument(nameOf(entry.path))) continue;
        await update(entry.path, (text) => (text === null ? null : unlinkDeletedLinks(text, entry.path, goes)));
      }
      const after = await module.files.list(folder);
      // A Folder emptied by the deletion is gone with it.
      for (const entry of before) if (goes(entry.path) || (entry.kind === "folder" && !after.some((each) => each.path === entry.path))) gone.add(entry.path);
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

const isCode = (error: unknown, code: string) => error instanceof TesselloError && error.code === code;
const join = (parent: string, name: string) => (parent === "" ? name : `${parent}/${name}`);
const manifestPathOf = (parent: string) => join(parent, FOLDER_MANIFEST);
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

/** Whether a Project path is the entry at `path` or, for a Folder, inside it. */
const deletedBy = (path: string, isFolder: boolean) => (each: string) => each === path || (isFolder && each.startsWith(`${path}/`));

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
 * The manifest `text` with its fields changed by `change` (null: no change, the text itself, byte for byte); undefined
 * when the manifest is invalid: no `---` fenced frontmatter, or one that is not valid YAML or not a mapping. The other
 * fields keep their order, the body is kept byte for byte.
 */
function editedFields(text: string, change: (fields: Record<string, unknown>) => Record<string, unknown> | null): string | undefined {
  const frontmatter = frontmatterOf(text);
  if (!frontmatter) return undefined;
  const fields = change(frontmatter.fields);
  if (!fields) return text;
  const lineBreak = /\r?\n$/.exec(text.slice(0, frontmatter.end))?.[0] ?? "";
  return `---\n${stringify(fields, { lineWidth: 0 })}---${lineBreak}${text.slice(frontmatter.end)}`;
}

/** The manifest `text` with `name` appended to its `order` unless already listed or `order` is empty or absent. */
const appendedToOrder = (text: string, name: string) =>
  editedFields(text, (fields) =>
    !Array.isArray(fields.order) || fields.order.length === 0 || fields.order.includes(name) ? null : { ...fields, order: [...fields.order, name] },
  );

/** The manifest `text` with `change` applied to its `order` and `hidden` lists; the text itself when neither changes. */
const withLists = (text: string, change: (list: unknown[]) => unknown[]) =>
  editedFields(text, (fields) => {
    const changed = { ...fields };
    let any = false;
    for (const key of ["order", "hidden"]) {
      const list = fields[key];
      if (!Array.isArray(list)) continue;
      const next = change(list);
      if (next.length !== list.length || next.some((item, i) => item !== list[i])) any = true;
      changed[key] = next;
    }
    return any ? changed : null;
  });

/** `text` with `old` replaced by `name` in place in `order` and `hidden`; undefined when invalid. */
const renamedIn = (text: string, old: string, name: string) => withLists(text, (list) => list.map((item) => (item === old ? name : item)));

/** `text` with `name` removed from `order` and `hidden`; undefined when invalid. */
const removedFrom = (text: string, name: string) => withLists(text, (list) => list.filter((item) => item !== name));

/** `text` (null: no manifest yet, one is made) with `order` as its order; the text itself when it is invalid. */
const withOrder = (text: string | null, order: string[]) =>
  text === null ? `---\n${stringify({ order, hidden: [] }, { lineWidth: 0 })}---\n` : (editedFields(text, (fields) => ({ ...fields, order })) ?? text);

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/**
 * The entries directly in the Folder at `path`: custom order first, then Folders, then Documents. With `all`, hidden
 * entries are kept (flagged), the Folder manifest comes first and the other files last, alphabetical ignoring case.
 */
function treeOf(entries: FolderEntry[], path: string, manifests: Map<string, Manifest>, dates: Map<string, TreeDate>, titles: Map<string, string>, all: boolean): TreeEntry[] {
  const manifest = manifests.get(path) ?? { order: [], hidden: [] };
  const children: TreeEntry[] = [];
  const manifestEntries: TreeEntry[] = [];
  const files: TreeEntry[] = [];
  for (const entry of entries) {
    if (parentOf(entry.path) !== path) continue;
    const name = nameOf(entry.path);
    const hidden = manifest.hidden.includes(name);
    if (name === ".DS_Store" || (hidden && !all)) continue;
    if (entry.kind === "folder") children.push({ kind: "folder", name, path: entry.path, hidden, children: treeOf(entries, entry.path, manifests, dates, titles, all) });
    else if (isDocument(name)) children.push({ kind: "document", name, path: entry.path, hidden, title: titles.get(entry.path) ?? parseDocument("", entry.path).title, date: dates.get(entry.path) ?? { kind: "modified", at: entry.modified } });
    else if (all) (name === FOLDER_MANIFEST ? manifestEntries : files).push({ kind: name === FOLDER_MANIFEST ? "manifest" : "file", name, path: entry.path });
  }
  return [...manifestEntries, ...ordered(children, manifest.order), ...files.sort(byName)];
}

/** `entries` as a Folder shows them: those named in `order` first, in that order, then Folders, then Documents, alphabetical ignoring case. */
function ordered<T extends { kind: string; name: string }>(entries: T[], order: string[]): T[] {
  const sorted = [...entries.filter((entry) => entry.kind === "folder").sort(byName), ...entries.filter((entry) => entry.kind !== "folder").sort(byName)];
  const listed = order.flatMap((name) => sorted.filter((entry) => entry.name === name));
  return [...listed, ...sorted.filter((entry) => !listed.includes(entry))];
}
