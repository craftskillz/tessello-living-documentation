// Versions: the history of a Document, read with isomorphic-git from the repository holding its Project (ADR 0008).
// Read-only: the repository is read through a file system over the Host's file requests that lists `.git` once and
// caches every read, and that refuses every write.

import "./bufferGlobal.ts";
import { Buffer } from "buffer";
import { type Files, type Folder, TesselloError } from "@tessello/sdk";
import git from "isomorphic-git";
import { clampPeriod } from "./period.ts";

/** One commit of a Document's history. */
export interface Commit {
  id: string;
  /** The first 7 characters of `id`. */
  shortId: string;
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
}

type Listing = Awaited<ReturnType<Files["list"]>>;

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

  const commits = (path: string, days: number, now = Date.now()) =>
    guard(async () => {
      const where = await inRepository(path);
      if (where === null) return [];
      const log = await git.log({ ...repo, ref: "HEAD", since: new Date(now - clampPeriod(days) * DAY) });
      const found: Commit[] = [];
      for (const { oid, commit } of log) {
        const here = await oidIn(commit.tree, where);
        const parents = await Promise.all(
          commit.parent.map(async (parent) => oidIn((await git.readCommit({ ...repo, oid: parent })).commit.tree, where)),
        );
        if (parents.length ? parents.every((before) => before !== here) : here !== null) {
          found.push({
            id: oid,
            shortId: oid.slice(0, 7),
            message: commit.message.split("\n")[0]!.trim(),
            date: commit.author.timestamp * 1000,
            author: commit.author.name,
          });
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
    return before && (await fileAt(latest.id, path)) === current ? before : latest;
  };

  return { commits, fileAt, defaultCommit };
}

