// What `tessello sync` last did for a Project, read from the Module's `syncStatus` key.

import type { Json } from "@tessello/sdk";

/** Sync is late, so not running, after three of its default 60 s intervals. */
export const NOT_RUNNING_AFTER = 180_000;

export interface SyncCommit {
  at: number;
  id: string;
  documents: string[];
}

export interface SyncProblem {
  kind: string;
  message: string;
  since: number;
}

/** What `tessello sync` last did for one Project, read from `syncStatus`. */
export interface SyncState {
  /** A round happened within NOT_RUNNING_AFTER before `now`. */
  running: boolean;
  /** The repository path sync used for this Project, null when it has no entry. */
  repository: string | null;
  lastCommit: SyncCommit | null;
  problem: SyncProblem | null;
}

const isObject = (value: unknown): value is Record<string, Json> => typeof value === "object" && value !== null && !Array.isArray(value);

const timeOf = (value: Json | undefined) => (typeof value === "string" ? Date.parse(value) : NaN);

function toCommit(value: Json | undefined): SyncCommit | null {
  if (!isObject(value) || typeof value.id !== "string") return null;
  const at = timeOf(value.at);
  if (Number.isNaN(at)) return null;
  const documents = Array.isArray(value.documents) ? value.documents.filter((document): document is string => typeof document === "string") : [];
  return { at, id: value.id, documents };
}

/** A problem needs a string kind and message; an unreadable `since` falls back to `fallback` (the heartbeat). */
function toProblem(value: Json | undefined, fallback: number): SyncProblem | null {
  if (!isObject(value) || typeof value.kind !== "string" || typeof value.message !== "string") return null;
  const since = timeOf(value.since);
  return { kind: value.kind, message: value.message, since: Number.isNaN(since) ? fallback : since };
}

/** The Project's SyncState in `value` (the `syncStatus` key). Malformed parts are dropped, never thrown. */
export function syncStateOf(value: Json | undefined, projectId: string, now: number): SyncState {
  const status = isObject(value) ? value : {};
  const heartbeat = timeOf(status.heartbeat);
  const entry = isObject(status.projects) && isObject(status.projects[projectId]) ? status.projects[projectId] : {};
  return {
    running: now - heartbeat <= NOT_RUNNING_AFTER,
    repository: typeof entry.repository === "string" ? entry.repository : null,
    lastCommit: toCommit(entry.lastCommit),
    problem: toProblem(entry.problem, Number.isNaN(heartbeat) ? now : heartbeat),
  };
}

const withoutTrailingSlashes = (path: string) => path.replace(/\/+$/, "");

/**
 * The repository's path on disk for the command: the one sync used, else the typed location minus the Project's path in
 * the repository (the location itself when `path` is ""), else null (also when `path` is unknown). Trailing slashes are tolerated.
 */
export function repositoryPathOf({ used, location, path }: { used: string | null; location?: string; path?: string }): string | null {
  if (used) return used;
  const typed = withoutTrailingSlashes((location ?? "").trim());
  // Without the Project's path, the location may lie anywhere below the repository's root.
  if (!typed || path === undefined) return null;
  const inside = withoutTrailingSlashes(path.trim()).replace(/^\/+/, "");
  if (!inside) return typed;
  const suffix = `/${inside}`;
  return typed.endsWith(suffix) && typed.length > suffix.length ? typed.slice(0, -suffix.length) : null;
}

/** The command to start sync for a repository; the path is single-quoted for the shell unless it holds only [A-Za-z0-9_./~-]. */
export function syncCommand(repositoryPath: string): string {
  const safe = /^[A-Za-z0-9_./~-]+$/.test(repositoryPath);
  return `npx tessello sync --living-documentation ${safe ? repositoryPath : `'${repositoryPath.replaceAll("'", "'\\''")}'`}`;
}

const startOfDay = (at: number) => new Date(new Date(at).setHours(0, 0, 0, 0));

/**
 * The commit time as the View shows it, in `locale` and the reader's time zone: `day` is "today" or "yesterday" for those
 * days (Intl.RelativeTimeFormat), else a medium date; `time` is a short time.
 */
export function commitTime(at: number, now: number, locale: string): { day: string; time: string } {
  const daysAgo = Math.round((startOfDay(now).getTime() - startOfDay(at).getTime()) / 86_400_000);
  const day =
    daysAgo === 0 || daysAgo === 1
      ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-daysAgo, "day")
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(at);
  return { day, time: new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(at) };
}
