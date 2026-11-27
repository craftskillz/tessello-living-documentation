// Versions: the history of a Document, read with isomorphic-git from the repository holding its Project (ADR 0008).
// Read-only: the repository is read through a file system over the Host's file requests that lists `.git` once and
// caches every read, and that refuses every write.

import "./bufferGlobal.ts";
import { Buffer } from "buffer";
import { type Files, type Folder, TesselloError } from "@tessello/sdk";
import git from "isomorphic-git";
import { sharedLines } from "./diff.ts";
import { clampPeriod } from "./period.ts";

/** One commit of a Document's history. */
export interface Commit {
  id: string;
  /** The first 7 characters of `id`. */
  shortId: string;
  /** The Document's path relative to the Project folder in this commit: the one asked for, until a rename is crossed, then the old one. */
  path: string;
  /** The first line of the message, trimmed. */
  message: string;
  /** When it was authored, in milliseconds since the Unix epoch. */
  date: number;
  /** The author's name. */
  author: string;
}

/** Why history could not be read: "unavailable" (the browser waits for the User to allow the repository again), "notRepository" (no .git in the granted folder), "failed" (anything else). */
export class HistoryFailure extends Error {
  readonly reason: "unavailable" | "notRepository" | "failed";
  constructor(reason: HistoryFailure["reason"], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "HistoryFailure";
    this.reason = reason;
  }
}

const DAY = 86_400_000;

export { clampPeriod, DEFAULT_PERIOD } from "./period.ts";

/** The history of one Project's Documents. */
export interface History {
  /** Commits of HEAD that changed the Document at `path` (relative to the Project folder) within `days` days before `now`, newest first. */
  commits(path: string, days: number, now?: number): Promise<Commit[]>;
  /** The Document's text at a commit, null when it has no file at this path there. */
  fileAt(commit: string, path: string): Promise<string | null>;
  /** The commit compared by default: the latest of `commits`, or the one before it when `current` (the file on disk) is identical to the latest; the latest when there is none before; null when `commits` is empty. */
  defaultCommit(path: string, current: string, commits: Commit[]): Promise<Commit | null>;
  /** Where the Project folder lies in the repository ("" for the repository itself), null when none of its files is tracked. */
  projectPath(): Promise<string | null>;
  /** The objects of the repository stored one file each (`.git/objects/xx/…`), not in a packfile: each costs a request to the Host. */
  looseObjects: number;
}

/** Reading longer than this, in milliseconds, is slow. */
const SLOW_READ = 3000;
/** Above this count of loose objects, `git gc` makes reading much faster. */
const MANY_LOOSE_OBJECTS = 1000;

/** Whether a slow read is likely due to loose objects, so that `git gc` would help: slower than 3 s and more than 1000 loose objects. */
export function suggestsGc({ looseObjects, elapsed }: { looseObjects: number; elapsed: number }): boolean {
  return elapsed > SLOW_READ && looseObjects > MANY_LOOSE_OBJECTS;
}

const LOOSE_OBJECT = /(?:^|\/)objects\/[0-9a-f]{2}\/[0-9a-f]{38,62}$/;

type Listing = Awaited<ReturnType<Files["list"]>>;

/** How alike two texts are, line based like git's score: the shared lines over the larger line count; 1 for identical texts. */
function similarity(a: string, b: string): number {
  const first = a === "" ? [] : a.split("\n");
  const second = b === "" ? [] : b.split("\n");
  const larger = Math.max(first.length, second.length);
  return larger === 0 ? 1 : sharedLines(first, second) / larger;
}

/** The share of lines a file must keep for a commit to be taken as renaming it. */
const SAME_FILE = 0.5;

/** The failure a Host error means for History. */
function failureOf(error: unknown): HistoryFailure {
  if (error instanceof HistoryFailure) return error;
  if (error instanceof TesselloError && error.code === "unavailable") return new HistoryFailure("unavailable", error.message, { cause: error });
  return new HistoryFailure("failed", error instanceof Error ? error.message : String(error), { cause: error });
}

const enoent = (path: string) => Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), { code: "ENOENT" });
const refused = () => Promise.reject(Object.assign(new Error("The repository is read-only"), { code: "EROFS" }));

/**
 * The file system isomorphic-git reads the repository through: the listing of `.git` answers what exists, the Host is
 * asked each file once, and every write is refused. Paths are the repository's, with a leading "/".
 */
function readOnlyFileSystem(files: Pick<Files, "list" | "read">, repository: Folder, listing: Listing) {
  const known = new Map<string, { kind: "file"; modified: number } | { kind: "folder" }>([["", { kind: "folder" }]]);
  const children = new Map<string, string[]>([["", []]]);
  const add = (path: string, entry: { kind: "file"; modified: number } | { kind: "folder" }) => {
    if (known.has(path)) return;
    known.set(path, entry);
    const slash = path.lastIndexOf("/");
    const parent = slash < 0 ? "" : path.slice(0, slash);
    if (!known.has(parent)) add(parent, { kind: "folder" });
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(slash < 0 ? path : path.slice(slash + 1));
  };
  for (const entry of listing) add(entry.path, entry.kind === "file" ? { kind: "file", modified: entry.modified } : { kind: "folder" });

  /** The first reason the Host could not be read, which isomorphic-git would otherwise take for a missing file. */
  let failure: HistoryFailure | null = null;
  const reads = new Map<string, Promise<Uint8Array>>();
  const norm = (path: string) => path.replace(/^\/+|\/+$/g, "");

  const stat = async (path: string) => {
    const entry = known.get(norm(path));
    if (!entry) throw enoent(path);
    const file = entry.kind === "file";
    const mtimeMs = file ? entry.modified : 0;
    return {
      type: file ? "file" : "dir",
      mode: file ? 0o100644 : 0o40000,
      size: 0,
      ino: 0,
      mtimeMs,
      ctimeMs: mtimeMs,
      uid: 0,
      gid: 0,
      dev: 0,
      isFile: () => file,
      isDirectory: () => !file,
      isSymbolicLink: () => false,
    };
  };

  const promises = {
    async readFile(path: string, options?: string | { encoding?: string }) {
      const key = norm(path);
      if (known.get(key)?.kind !== "file") throw enoent(path);
      let read = reads.get(key);
      if (!read) {
        read = files.read(repository, key, { as: "bytes" }).then(
          // The Test Host hands the bytes over as a JSON object ({"0": 137, ...}); a browser Host as a Uint8Array.
          ({ content }) => (content instanceof Uint8Array ? content : Uint8Array.from(Object.values(content as Record<string, number>))),
          (error: unknown) => {
            reads.delete(key);
            if (error instanceof TesselloError && error.code === "not_found") throw enoent(path);
            failure ??= failureOf(error);
            throw error;
          },
        );
        reads.set(key, read);
      }
      const bytes = Buffer.from(await read);
      const encoding = typeof options === "string" ? options : options?.encoding;
      return encoding ? bytes.toString(encoding as BufferEncoding) : bytes;
    },
    async readdir(path: string) {
      const list = children.get(norm(path));
      if (!list || known.get(norm(path))?.kind !== "folder") throw enoent(path);
      return [...list];
    },
    stat,
    lstat: stat,
    readlink: async (path: string) => Promise.reject(enoent(path)),
    writeFile: refused,
    unlink: refused,
    mkdir: refused,
    rmdir: refused,
    symlink: refused,
    chmod: refused,
    rename: refused,
  };
  return { fs: { promises }, failure: () => {
      const reason = failure;
      failure = null;
      return reason;
    },
  };
}

/** History of a Project folder read from the repository holding it, read-only. Lists `.git` once, caches every read. */
export async function openHistory(files: Pick<Files, "list" | "read">, repository: Folder, project: Folder): Promise<History> {
  let listing: Listing;
  try {
    listing = await files.list(repository, ".git");
  } catch (error) {
    if (error instanceof TesselloError && error.code === "not_found") throw new HistoryFailure("notRepository", "There is no .git in the folder", { cause: error });
    throw failureOf(error);
  }
  const system = readOnlyFileSystem(files, repository, listing);
  const repo = { fs: system.fs, dir: "/", gitdir: "/.git", cache: {} };

  /** Where the Project folder lies in the repository ("" for the repository itself), null when it is not tracked. */
  let projectPath: Promise<string | null> | undefined;
  /** The entries of each tree already read. */
  const trees = new Map<string, Promise<git.TreeEntry[]>>();

  /** Runs a read of the repository, giving a failed one as a HistoryFailure and forgetting what it kept, so that the next read starts again. */
  async function guard<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (error) {
      projectPath = undefined;
      trees.clear();
      throw system.failure() ?? failureOf(error);
    }
  }

  const projectPathInRepository = () =>
    (projectPath ??= guard(async () => {
      if (project.id === repository.id) return "";
      const tracked = await git.listFiles(repo);
      const candidates = new Set<string>();
      for (const path of tracked) {
        const parts = path.split("/");
        for (let end = 1; end < parts.length; end++) if (parts[end - 1] === project.name) candidates.add(parts.slice(0, end).join("/"));
      }
      if (candidates.size <= 1) return [...candidates][0] ?? null;
      const signature = (entries: Listing, base: string) =>
        entries
          .filter((entry) => entry.kind === "file")
          .map((entry) => `${base ? entry.path.slice(base.length + 1) : entry.path}\n${entry.version}`)
          .sort()
          .join("\n");
      const wanted = signature(await files.list(project), "");
      for (const candidate of candidates) if (signature(await files.list(repository, candidate), candidate) === wanted) return candidate;
      return null;
    }));
  const inRepository = async (path: string) => {
    const base = await projectPathInRepository();
    return base === null ? null : base ? `${base}/${path}` : path;
  };

  /** The oid of the file at `path` in the tree `tree`, null when there is none. */
  const oidIn = async (tree: string, path: string): Promise<string | null> => {
    let current = tree;
    const parts = path.split("/");
    for (const [index, name] of parts.entries()) {
      let entries = trees.get(current);
      if (!entries) trees.set(current, (entries = git.readTree({ ...repo, oid: current }).then((result) => result.tree)));
      const entry = (await entries).find((each) => each.path === name);
      if (!entry) return null;
      if (index === parts.length - 1) return entry.type === "blob" ? entry.oid : null;
      if (entry.type !== "tree") return null;
      current = entry.oid;
    }
    return null;
  };

  /** The entries of the tree `oid`, none for a tree that is not there. */
  const entriesOf = async (oid: string | null) => {
    if (oid === null) return [];
    let entries = trees.get(oid);
    if (!entries) trees.set(oid, (entries = git.readTree({ ...repo, oid }).then((result) => result.tree)));
    return entries;
  };

  /** The `.md` files of `before` (a tree) that `after` (a tree, or null) no longer holds as files, inside the folder `base` and by repository path, skipping subtrees whose oids are equal. */
  const disappeared = async (before: string, after: string | null, base: string[], prefix = ""): Promise<{ path: string; oid: string }[]> => {
    const left = await entriesOf(before);
    const right = await entriesOf(after);
    const found: { path: string; oid: string }[] = [];
    for (const entry of left) {
      if (base.length && entry.path !== base[0]) continue;
      const other = right.find((each) => each.path === entry.path);
      const path = `${prefix}${entry.path}`;
      if (entry.type === "tree") {
        if (other?.type === "tree" && other.oid === entry.oid) continue;
        found.push(...(await disappeared(entry.oid, other?.type === "tree" ? other.oid : null, base.slice(1), `${path}/`)));
      } else if (!base.length && entry.type === "blob" && /\.md$/i.test(entry.path) && other?.type !== "blob") found.push({ path, oid: entry.oid });
    }
    return found;
  };

  const text = async (oid: string) => new TextDecoder().decode((await git.readBlob({ ...repo, oid })).blob);

  /** The path, in the Project, of the `.md` file that `commit` renamed to `where` (similar to it at least by SAME_FILE), null when there is none. */
  const renamedFrom = async (parentTree: string, tree: string, where: string, base: string): Promise<string | null> => {
    const now = await oidIn(tree, where);
    if (now === null) return null;
    const lost = await disappeared(parentTree, tree, base ? base.split("/") : []);
    if (!lost.length) return null;
    const content = await text(now);
    let best: { path: string; score: number } | null = null;
    for (const candidate of lost.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
      const score = similarity(await text(candidate.oid), content);
      if (score >= SAME_FILE && (!best || score > best.score)) best = { path: candidate.path, score };
    }
    return best ? (base ? best.path.slice(base.length + 1) : best.path) : null;
  };

  const commits = (path: string, days: number, now = Date.now()) =>
    guard(async () => {
      let current = path;
      let where = await inRepository(current);
      if (where === null) return [];
      const base = (await projectPathInRepository())!;
      const log = await git.log({ ...repo, ref: "HEAD", since: new Date(now - clampPeriod(days) * DAY) });
      const found: Commit[] = [];
      for (const { oid, commit } of log) {
        const here = await oidIn(commit.tree, where);
        const parentTrees = await Promise.all(commit.parent.map(async (parent) => (await git.readCommit({ ...repo, oid: parent })).commit.tree));
        const parents = await Promise.all(parentTrees.map((tree) => oidIn(tree, where!)));
        if (parents.length ? parents.every((before) => before !== here) : here !== null) {
          found.push({
            id: oid,
            shortId: oid.slice(0, 7),
            path: current,
            message: commit.message.split("\n")[0]!.trim(),
            date: commit.author.timestamp * 1000,
            author: commit.author.name,
          });
          // The file appears here: another `.md` of the Project disappearing with alike content means it was renamed.
          if (here !== null && parents[0] === null && parentTrees[0]) {
            const old = await renamedFrom(parentTrees[0], commit.tree, where, base);
            if (old !== null) {
              current = old;
              where = base ? `${base}/${old}` : old;
            }
          }
        }
      }
      return found;
    });

  const fileAt = (commit: string, path: string) =>
    guard(async () => {
      const where = await inRepository(path);
      if (where === null) return null;
      const tree = (await git.readCommit({ ...repo, oid: commit })).commit.tree;
      const oid = await oidIn(tree, where);
      if (oid === null) return null;
      return new TextDecoder().decode((await git.readBlob({ ...repo, oid })).blob);
    });

  const defaultCommit = async (path: string, current: string, list: Commit[]) => {
    const [latest, before] = list;
    if (!latest) return null;
    return before && (await fileAt(latest.id, latest.path)) === current ? before : latest;
  };

  const looseObjects = listing.filter((entry) => entry.kind === "file" && LOOSE_OBJECT.test(entry.path)).length;
  return { commits, fileAt, defaultCommit, projectPath: projectPathInRepository, looseObjects };
}

