// The User's Projects (ADR 0002, docs/design.md §8): the folders they connected, the Active Project, the last Document
// opened in each, kept in the Module's storage; and Projects the browser waits to allow again (Unavailable Project).

import { type ConnectedModule, type Folder, type Json, TesselloError } from "@tessello/sdk";
import { parseDocument } from "./document.ts";
import { NotFound, openProject, type Project, type TreeEntry } from "./project.ts";

export interface ProjectInfo {
  /** Stable across visits: the id of its Folder grant. */
  id: string;
  /** The folder's name. */
  name: string;
}

export interface ListedProject extends ProjectInfo {
  /** `unavailable` after a browser restart, until the User reconnects it. */
  state: "available" | "unavailable";
}

export interface DisplayPreferences {
  /** Source line numbers next to each block. */
  lines: boolean;
  /** A pure white page, for screen captures. */
  whiteBackground: boolean;
  /** Hidden Folders and Documents, Folder manifests and other files shown in the Tree. */
  showHidden: boolean;
  /** The table of contents: open or closed, and its width in pixels (160–400). */
  toc: { open: boolean; width: number };
}

/** What is kept of a favorite. `path` is the Document's path in the Project folder, with `.md`. */
export interface FavoriteEntry {
  path: string;
  title: string;
}

export interface Favorite extends FavoriteEntry {
  /** Its file is gone; it stays listed until the User removes it. */
  missing: boolean;
}

export const MAX_FAVORITES = 200;
const MAX_TITLE = 200;

export const TOC_WIDTH = { min: 160, max: 400, default: 224 };

export interface Projects {
  /** Asks the User for a folder (call it from their click) and adds it as the Active Project; null if they cancel. */
  connect(): Promise<ProjectInfo | null>;
  list(): Promise<ListedProject[]>;
  active(): Promise<ProjectInfo | null>;
  setActive(project: ProjectInfo): Promise<void>;
  /** The Project, whose renames, moves and deletes also update its favorites. */
  open(project: ProjectInfo): Project;
  /** The Project's favorites in the User's order, each with the Document's current title (the kept one when unreadable). Seeds them once from `.living-doc.json`. */
  favorites(project: ProjectInfo): Promise<Favorite[]>;
  /** Keeps `entries` as the Project's favorites (normalized: trimmed, no empty or repeated path, titles cut to 200 characters, at most 200); resolves with what is kept. */
  setFavorites(project: ProjectInfo, entries: FavoriteEntry[]): Promise<FavoriteEntry[]>;
  /** Remembers the Document the User opened, where the Project opens next time. */
  opened(project: ProjectInfo, path: string): Promise<void>;
  /** The last Document opened in the Project if it still exists, else its top existing favorite, else the first Document of its Tree, else null. */
  startDocument(project: ProjectInfo): Promise<string | null>;
  /** Asks the User to allow the folder again (call it from their click); true when it is available. */
  reconnect(project: ProjectInfo): Promise<boolean>;
  /** Forgets the Project and its favorites, and gives its folder back; its files stay on disk. */
  remove(project: ProjectInfo): Promise<void>;
  /** The User's display preferences; defaults when none were kept or the kept value is malformed. */
  preferences(): Promise<DisplayPreferences>;
  /** Changes some preferences, keeps the others; resolves with all of them. A TOC width is clamped to 160–400 and rounded. */
  setPreferences(changes: { lines?: boolean; whiteBackground?: boolean; showHidden?: boolean; toc?: { open?: boolean; width?: number } }): Promise<DisplayPreferences>;
}

const KEY = "projects";
// Apart from the Projects, so that writing one never races with writing the other.
const DISPLAY_KEY = "display";
// Personal, per Project (ADR 0007): projectId → entries.
const FAVORITES_KEY = "favorites";

interface Stored {
  projects: ProjectInfo[];
  active: string | null;
  lastOpened: Record<string, string>;
}

function readStored(value: Json): Stored {
  const raw = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
  const projects = Array.isArray(raw.projects)
    ? raw.projects.flatMap((each) =>
        typeof each === "object" && each !== null && !Array.isArray(each) && typeof each.id === "string" && typeof each.name === "string"
          ? [{ id: each.id, name: each.name }]
          : [],
      )
    : [];
  const lastOpened: Record<string, string> = {};
  if (typeof raw.lastOpened === "object" && raw.lastOpened !== null && !Array.isArray(raw.lastOpened)) {
    for (const [id, path] of Object.entries(raw.lastOpened)) if (typeof path === "string") lastOpened[id] = path;
  }
  return { projects, active: typeof raw.active === "string" ? raw.active : null, lastOpened };
}

function readPreferences(value: Json): DisplayPreferences {
  const object = (each: Json | undefined) => (typeof each === "object" && each !== null && !Array.isArray(each) ? each : {});
  const raw = object(value);
  const toc = object(raw.toc);
  return {
    lines: typeof raw.lines === "boolean" ? raw.lines : false,
    whiteBackground: typeof raw.whiteBackground === "boolean" ? raw.whiteBackground : false,
    showHidden: typeof raw.showHidden === "boolean" ? raw.showHidden : false,
    toc: {
      open: typeof toc.open === "boolean" ? toc.open : false,
      width: typeof toc.width === "number" && Number.isFinite(toc.width) ? clampTocWidth(toc.width) : TOC_WIDTH.default,
    },
  };
}

/** A table of contents width kept within 160–400 px, whole. */
export const clampTocWidth = (width: number) => Math.min(TOC_WIDTH.max, Math.max(TOC_WIDTH.min, Math.round(width)));

const folderOf = (project: ProjectInfo): Folder => ({ id: project.id, name: project.name });

const isObject = (value: unknown): value is Record<string, Json> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The kept favorites of every Project; what is malformed is dropped. */
function readFavorites(value: Json): Record<string, FavoriteEntry[]> {
  const all: Record<string, FavoriteEntry[]> = {};
  if (isObject(value)) {
    for (const [id, list] of Object.entries(value)) {
      if (!Array.isArray(list)) continue;
      all[id] = list.flatMap((each) => (isObject(each) && typeof each.path === "string" && typeof each.title === "string" ? [{ path: each.path, title: each.title }] : []));
    }
  }
  return all;
}

/** The favorites a Project's `.living-doc.json` holds (the original's `{ id, title }`, `id` the encoded path without `.md`); none when unreadable. */
function seedFavorites(text: string): FavoriteEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isObject(data) || !Array.isArray(data.favorites)) return [];
  return data.favorites.flatMap((each) => {
    if (!isObject(each) || typeof each.id !== "string") return [];
    try {
      return [{ path: `${decodeURIComponent(each.id)}.md`, title: typeof each.title === "string" ? each.title : "" }];
    } catch {
      return [];
    }
  });
}

/** Trimmed, without empty or repeated paths (the first stays), titles and list cut. */
function normalizedFavorites(entries: FavoriteEntry[]): FavoriteEntry[] {
  const seen = new Set<string>();
  const kept: FavoriteEntry[] = [];
  for (const entry of entries) {
    const path = entry.path.trim();
    if (path === "" || seen.has(path)) continue;
    seen.add(path);
    kept.push({ path, title: entry.title.trim().slice(0, MAX_TITLE) });
  }
  return kept.slice(0, MAX_FAVORITES);
}

/** Where `path` goes when `from` becomes `to`: itself, or what is inside it. null when unaffected. */
const mapped = (path: string, from: string, to: string) => (path === from ? to : path.startsWith(`${from}/`) ? to + path.slice(from.length) : null);

/** The first Document of a Tree, depth first. */
function firstDocument(entries: TreeEntry[]): string | null {
  for (const entry of entries) {
    if (entry.kind === "document") return entry.path;
    if (entry.kind !== "folder") continue;
    const inside = firstDocument(entry.children);
    if (inside) return inside;
  }
  return null;
}

export function createProjects(module: ConnectedModule): Projects {
  const read = async () => readStored(await module.storage.get(KEY));
  const write = (stored: Stored) => module.storage.set(KEY, { ...stored, projects: stored.projects.map((project) => ({ ...project })) });

  const readDisplay = async () => readPreferences(await module.storage.get(DISPLAY_KEY));

  const readAllFavorites = async () => readFavorites(await module.storage.get(FAVORITES_KEY));
  const writeFavorites = (all: Record<string, FavoriteEntry[]>) =>
    module.storage.set(FAVORITES_KEY, Object.fromEntries(Object.entries(all).map(([id, list]) => [id, list.map((each) => ({ ...each }))])));

  /** The Project's kept favorites; the first time, seeded from its `.living-doc.json` and kept (even empty). */
  async function keptFavorites(project: ProjectInfo): Promise<FavoriteEntry[]> {
    const all = await readAllFavorites();
    const kept = all[project.id];
    if (kept) return kept;
    const file = await openProject(module, folderOf(project)).read(".living-doc.json").catch((error: unknown) => {
      if (error instanceof NotFound) return null;
      throw error;
    });
    const seeded = normalizedFavorites(file ? seedFavorites(file.text) : []);
    // Read again: another write may have landed meanwhile.
    const latest = await readAllFavorites();
    latest[project.id] ??= seeded;
    await writeFavorites(latest);
    return latest[project.id]!;
  }

  /** Keeps the Project's favorites as `change` leaves them. */
  async function changeFavorites(project: ProjectInfo, change: (entries: FavoriteEntry[]) => FavoriteEntry[]) {
    const entries = await keptFavorites(project);
    const all = await readAllFavorites();
    all[project.id] = normalizedFavorites(change(entries));
    await writeFavorites(all);
    return all[project.id]!;
  }

  return {
    async preferences() {
      return readDisplay();
    },
    async setPreferences(changes) {
      const kept = await readDisplay();
      const next: DisplayPreferences = {
        lines: changes.lines ?? kept.lines,
        whiteBackground: changes.whiteBackground ?? kept.whiteBackground,
        showHidden: changes.showHidden ?? kept.showHidden,
        toc: {
          open: changes.toc?.open ?? kept.toc.open,
          width: changes.toc?.width !== undefined && Number.isFinite(changes.toc.width) ? clampTocWidth(changes.toc.width) : kept.toc.width,
        },
      };
      await module.storage.set(DISPLAY_KEY, { lines: next.lines, whiteBackground: next.whiteBackground, showHidden: next.showHidden, toc: { ...next.toc } });
      return next;
    },
    async connect() {
      const folder = await module.folders.request();
      if (!folder) return null;
      const stored = await read();
      const project = stored.projects.find((each) => each.id === folder.id) ?? { id: folder.id, name: folder.name };
      if (!stored.projects.some((each) => each.id === project.id)) stored.projects.push(project);
      stored.active = project.id;
      await write(stored);
      return project;
    },
    async list() {
      const states = new Map((await module.folders.list()).map((folder) => [folder.id, folder.state]));
      return (await read()).projects.map((project) => ({ ...project, state: states.get(project.id) === "granted" ? "available" : "unavailable" }));
    },
    async active() {
      const stored = await read();
      return stored.projects.find((project) => project.id === stored.active) ?? null;
    },
    async setActive(project) {
      const stored = await read();
      stored.active = project.id;
      await write(stored);
    },
    open(project) {
      const opened = openProject(module, folderOf(project));
      const moved = (from: string, to: string) =>
        changeFavorites(project, (entries) => entries.map((entry) => ({ ...entry, path: mapped(entry.path, from, to) ?? entry.path })));
      return {
        ...opened,
        async rename(path, name) {
          const to = await opened.rename(path, name);
          if (to !== path) await moved(path, to);
          return to;
        },
        async move(path, folder, position) {
          const to = await opened.move(path, folder, position);
          if (to !== path) await moved(path, to);
          return to;
        },
        async remove(path) {
          await opened.remove(path);
          await changeFavorites(project, (entries) => entries.filter((entry) => mapped(entry.path, path, path) === null));
        },
      };
    },
    async favorites(project) {
      const opened = openProject(module, folderOf(project));
      return Promise.all(
        (await keptFavorites(project)).map(async (entry) => {
          try {
            return { path: entry.path, title: parseDocument((await opened.read(entry.path)).text, entry.path).title, missing: false };
          } catch (error) {
            // Without a kept title the path stands in, as the original showed the id.
            const kept = { path: entry.path, title: entry.title || entry.path };
            return { ...kept, missing: error instanceof NotFound };
          }
        }),
      );
    },
    setFavorites: (project, entries) => changeFavorites(project, () => entries),
    async opened(project, path) {
      const stored = await read();
      stored.lastOpened[project.id] = path;
      await write(stored);
    },
    async startDocument(project) {
      // Hidden Documents too: a hidden favorite or last Document still exists. The first Document is a shown one.
      const tree = await openProject(module, folderOf(project)).tree({ hidden: true });
      const last = (await read()).lastOpened[project.id];
      const exists = (path: string | undefined, entries: TreeEntry[] = tree): boolean =>
        entries.some((entry) => (entry.kind === "document" ? entry.path === path : entry.kind === "folder" && exists(path, entry.children)));
      if (last !== undefined && exists(last)) return last;
      // A favorite that is not a Document of the Tree counts as missing.
      const top = (await keptFavorites(project)).find((entry) => exists(entry.path));
      return top?.path ?? firstDocument(await openProject(module, folderOf(project)).tree());
    },
    async reconnect(project) {
      return (await module.folders.reconnect(folderOf(project))) === "granted";
    },
    async remove(project) {
      await module.folders.release(folderOf(project)).catch((error: unknown) => {
        // Already given back, as from the Host's About screen.
        if (!(error instanceof TesselloError && error.code === "not_found")) throw error;
      });
      const stored = await read();
      stored.projects = stored.projects.filter((each) => each.id !== project.id);
      if (stored.active === project.id) stored.active = null;
      delete stored.lastOpened[project.id];
      await write(stored);
      const favorites = await readAllFavorites();
      delete favorites[project.id];
      await writeFavorites(favorites);
    },
  };
}
