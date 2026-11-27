// The User's Projects (ADR 0002, docs/design.md §8): the folders they connected, the Active Project, the last Document
// opened in each, kept in the Module's storage; and Projects the browser waits to allow again (Unavailable Project).

import { clampPeriod } from "./period.ts";
import { type ConnectedModule, type Folder, type Json, TesselloError } from "@tessello/sdk";
import { parseDocument } from "./document.ts";
import { type LabelFilter, NO_LABEL_FILTER } from "./labels.ts";
import { NotFound, openProject, type Project, type TreeEntry } from "./project.ts";

export interface ProjectInfo {
  /** Stable across visits: the id of its Folder grant. */
  id: string;
  /** The folder's name. */
  name: string;
  /** The name the User gave the Project, shown instead of the folder's (personal, kept in the Module's storage). */
  displayName?: string;
  /** Where the folder is on disk, as the User typed it: the Host never gives the path (personal, kept in the Module's storage). */
  location?: string;
  /** How many days back Versions looks when it opens, when the User chose it (personal, kept in the Module's storage); else DEFAULT_PERIOD. */
  versionsPeriod?: number;
}

/** What the User sees as the Project's name: the one they gave it, else its folder's. */
export const projectLabel = (project: ProjectInfo) => project.displayName ?? project.name;

export const MAX_DISPLAY_NAME = 200;
export const MAX_LOCATION = 1000;

/** A git repository the Project may read its history from (Repository grant, ADR 0008). */
export type RepositoryInfo = { id: string; name: string };

/** The Host refused the chosen folder (ADR 0010, ADR 0008); nothing was granted or kept. */
export class FolderRefused extends Error {
  reason: "overlapping" | "notContaining";
  /** For `overlapping`: the Project whose folder clashes, when it is still listed. */
  project?: ProjectInfo;

  constructor(reason: "overlapping" | "notContaining", project?: ProjectInfo) {
    super(reason === "overlapping" ? "This folder overlaps another Project folder" : "This folder does not contain the Project folder");
    this.name = "FolderRefused";
    this.reason = reason;
    this.project = project;
  }
}

/** A Project's entry in the storage key `sync`, read by `tessello sync --living-documentation` (ADR 0011). */
export interface SyncEntry {
  /** The Project's id. */
  id: string;
  /** The Project folder's name (not the name the User gave). */
  name: string;
  /** The name of the folder of its Repository grant. */
  repository: string;
  /** The Project folder's path in the repository, "" when the repository is the Project folder; absent while Versions has not found it. */
  path?: string;
  /** Where the folder is on disk, as the User typed it; absent when the Project has none. */
  location?: string;
}

export interface ListedProject extends ProjectInfo {
  /** `unavailable` after a browser restart, until the User reconnects it. */
  state: "available" | "unavailable";
}

/** What the Tree shows for each Document: its file name or its displayed title. */
export type TreeLabels = "name" | "title";

export interface DisplayPreferences {
  /** Source line numbers next to each block. */
  lines: boolean;
  /** A pure white page, for screen captures. */
  whiteBackground: boolean;
  /** Hidden Folders and Documents, Folder manifests and other files shown in the Tree. */
  showHidden: boolean;
  /** The Marker's Hidden state: annotations not shown. Normal and Hidden are kept; Active is not (docs/spec/annotations.md rule 5). */
  markerHidden: boolean;
  /** What the Tree shows for each Document: its file name or its displayed title. */
  treeLabels: TreeLabels;
  /** The table of contents: open or closed, and its width in pixels (160–400). */
  toc: { open: boolean; width: number };
  /** The sidebar: its width in pixels (200–600). */
  sidebar: { width: number };
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
export const SIDEBAR_WIDTH = { min: 200, max: 600, default: 256 };

export interface Projects {
  /** Asks the User for a folder (call it from their click, after `list` or `active` was read once) and adds it as the Active Project; null if they cancel. Rejects with `FolderRefused` when it is, lies inside or holds the folder of a Project. */
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
  /** Gives the Project the name the User sees (trimmed, cut to 200 characters); an empty one shows the folder's name again. Resolves with the Project as kept. */
  setDisplayName(project: ProjectInfo, displayName: string): Promise<ProjectInfo>;
  /** Keeps where the folder is on disk, as the User typed it (trimmed, cut to 1000 characters); an empty one forgets it. Resolves with the Project as kept. */
  setLocation(project: ProjectInfo, location: string): Promise<ProjectInfo>;
  /** Keeps how many days back Versions looks when it opens, brought into 1–3650 (a non-number keeps the default). Resolves with the Project as kept. */
  setVersionsPeriod(project: ProjectInfo, days: number): Promise<ProjectInfo>;
  /** Asks the User to allow the folder again (call it from their click); true when it is available. */
  reconnect(project: ProjectInfo): Promise<boolean>;
  /** The Project's label filter; empty (no pattern, no replacement) when none was kept or the kept one is malformed. */
  labelFilter(project: ProjectInfo): Promise<LabelFilter>;
  /** Keeps `filter` as the Project's label filter (the caller validates the pattern); resolves with what is kept. */
  setLabelFilter(project: ProjectInfo, filter: LabelFilter): Promise<LabelFilter>;
  /** Asks the User for the git repository holding the Project folder (call it from their click, before anything is awaited) and keeps it as the Project's Repository grant, replacing a previous one; null if they cancel. Rejects with `FolderRefused` when the folder does not hold the Project folder. */
  connectRepository(project: ProjectInfo): Promise<RepositoryInfo | null>;
  /** The Project's Repository grant, `unavailable` until the User allows it again after a browser restart; null when it has none. */
  repository(project: ProjectInfo): Promise<(RepositoryInfo & { state: "available" | "unavailable" }) | null>;
  /** The Project's entry of the key `sync`, null when it has none. */
  syncEntry(project: ProjectInfo): Promise<SyncEntry | null>;
  /** Records where Versions found the Project folder in its repository ("" for the repository itself) in its `sync` entry, creating the entry from its Repository grant; does nothing without a grant. */
  foundProjectPath(project: ProjectInfo, path: string): Promise<void>;
  /** Forgets the Project's Repository grant and gives its folder back, unless another Project still uses it. */
  disconnectRepository(project: ProjectInfo): Promise<void>;
  /** Forgets the Project, its repository, its favorites and its label filter, and gives its folder back; its files stay on disk. */
  remove(project: ProjectInfo): Promise<void>;
  /** The User's display preferences; defaults when none were kept or the kept value is malformed. */
  preferences(): Promise<DisplayPreferences>;
  /** Changes some preferences, keeps the others; resolves with all of them. A TOC width is clamped to 160–400 and a sidebar width to 200–600, both rounded; a non-finite width keeps the kept one. */
  setPreferences(changes: { lines?: boolean; whiteBackground?: boolean; showHidden?: boolean; markerHidden?: boolean; treeLabels?: TreeLabels; toc?: { open?: boolean; width?: number }; sidebar?: { width?: number } }): Promise<DisplayPreferences>;
}

const KEY = "projects";
// Apart from the Projects, so that writing one never races with writing the other.
const DISPLAY_KEY = "display";
// Personal, per Project (ADR 0007): projectId → entries.
const FAVORITES_KEY = "favorites";
// Personal, per Project: projectId → label filter.
const LABEL_FILTERS_KEY = "labelFilters";

// The Projects with a Repository grant, read by `tessello sync --living-documentation` in the CLI: a format change must update both repositories.
const SYNC_KEY = "sync";

interface StoredProject extends ProjectInfo {
  repository?: RepositoryInfo;
}

interface Stored {
  projects: StoredProject[];
  active: string | null;
  lastOpened: Record<string, string>;
}

function readStored(value: Json): Stored {
  const raw = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
  const projects = Array.isArray(raw.projects)
    ? raw.projects.flatMap((each) =>
        typeof each === "object" && each !== null && !Array.isArray(each) && typeof each.id === "string" && typeof each.name === "string"
          ? [
              {
                id: each.id,
                name: each.name,
                ...(typeof each.displayName === "string" && each.displayName.trim() !== "" && { displayName: each.displayName }),
                ...(typeof each.location === "string" && each.location.trim() !== "" && { location: each.location }),
                ...(typeof each.versionsPeriod === "number" && { versionsPeriod: clampPeriod(each.versionsPeriod) }),
                ...(isObject(each.repository) &&
                  typeof each.repository.id === "string" &&
                  typeof each.repository.name === "string" && { repository: { id: each.repository.id, name: each.repository.name } }),
              },
            ]
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
  const sidebar = object(raw.sidebar);
  return {
    lines: typeof raw.lines === "boolean" ? raw.lines : false,
    whiteBackground: typeof raw.whiteBackground === "boolean" ? raw.whiteBackground : false,
    showHidden: typeof raw.showHidden === "boolean" ? raw.showHidden : false,
    markerHidden: typeof raw.markerHidden === "boolean" ? raw.markerHidden : false,
    treeLabels: raw.treeLabels === "title" ? "title" : "name",
    toc: {
      open: typeof toc.open === "boolean" ? toc.open : false,
      width: typeof toc.width === "number" && Number.isFinite(toc.width) ? clampTocWidth(toc.width) : TOC_WIDTH.default,
    },
    sidebar: { width: typeof sidebar.width === "number" && Number.isFinite(sidebar.width) ? clampSidebarWidth(sidebar.width) : SIDEBAR_WIDTH.default },
  };
}

/** The kept label filters of every Project; what is malformed is dropped. */
function readLabelFilters(value: Json): Record<string, LabelFilter> {
  const all: Record<string, LabelFilter> = {};
  if (!isObject(value)) return all;
  for (const [id, each] of Object.entries(value)) {
    if (isObject(each) && typeof each.pattern === "string" && typeof each.replacement === "string") all[id] = { pattern: each.pattern, replacement: each.replacement };
  }
  return all;
}

/** The kept `sync` entries; what is malformed is dropped. */
function readSync(value: Json): SyncEntry[] {
  const list = isObject(value) && Array.isArray(value.projects) ? value.projects : [];
  return list.flatMap((each) =>
    isObject(each) && typeof each.id === "string" && typeof each.name === "string" && typeof each.repository === "string"
      ? [
          {
            id: each.id,
            name: each.name,
            repository: each.repository,
            ...(typeof each.path === "string" && { path: each.path }),
            ...(typeof each.location === "string" && { location: each.location }),
          },
        ]
      : [],
  );
}

/** A table of contents width kept within 160–400 px, whole. */
export const clampTocWidth = (width: number) => clampWidth(width, TOC_WIDTH);

/** A sidebar width kept within 200–600 px, whole. */
export const clampSidebarWidth = (width: number) => clampWidth(width, SIDEBAR_WIDTH);

/** A width kept within its bounds, in whole pixels. */
export const clampWidth = (width: number, bounds: { min: number; max: number }) => Math.min(bounds.max, Math.max(bounds.min, Math.round(width)));

const folderOf = (project: ProjectInfo): Folder => ({ id: project.id, name: project.name });

/** What the View is given of a kept Project: no repository. */
const infoOf = (project: StoredProject): ProjectInfo => ({
  id: project.id,
  name: project.name,
  ...(project.displayName !== undefined && { displayName: project.displayName }),
  ...(project.location !== undefined && { location: project.location }),
  ...(project.versionsPeriod !== undefined && { versionsPeriod: project.versionsPeriod }),
});

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
  // The Project folders last read or written: connect() must send its request straight from the User's click (ADR 0022),
  // so it cannot read the storage first.
  let projectFolders: Folder[] = [];
  // The same Projects, to name the one an overlapping folder clashes with.
  let known: ProjectInfo[] = [];
  const read = async () => {
    const stored = readStored(await module.storage.get(KEY));
    projectFolders = stored.projects.map(folderOf);
    known = stored.projects.map(infoOf);
    return stored;
  };
  const write = async (stored: Stored) => {
    await module.storage.set(KEY, { ...stored, projects: stored.projects.map((project) => ({ ...project, ...(project.repository && { repository: { ...project.repository } }) })) });
    projectFolders = stored.projects.map(folderOf);
    known = stored.projects.map(infoOf);
  };

  /** Gives the folder back unless a Project still has it as its folder or its repository; already given back is fine. */
  async function releaseUnused(stored: Stored, folder: Folder) {
    if (stored.projects.some((each) => each.id === folder.id || each.repository?.id === folder.id)) return;
    await module.folders.release(folder).catch((error: unknown) => {
      // Already given back, as from the Host's About screen.
      if (!(error instanceof TesselloError && error.code === "not_found")) throw error;
    });
  }

  const readSyncEntries = async () => readSync(await module.storage.get(SYNC_KEY));
  const writeSync = (entries: SyncEntry[]) => module.storage.set(SYNC_KEY, { projects: entries.map((each) => ({ ...each })) });
  /** Keeps the Project's `sync` entry as its Repository grant and location say, with `path` (absent when unknown). */
  async function putSync(kept: StoredProject, path: string | undefined) {
    if (!kept.repository) return;
    const entry: SyncEntry = {
      id: kept.id,
      name: kept.name,
      repository: kept.repository.name,
      ...(path !== undefined && { path }),
      ...(kept.location !== undefined && { location: kept.location }),
    };
    const entries = await readSyncEntries();
    const at = entries.findIndex((each) => each.id === kept.id);
    if (at < 0) entries.push(entry);
    else entries[at] = entry;
    await writeSync(entries);
  }
  /** Forgets the Project's `sync` entry; nothing is written when it has none. */
  async function dropSync(id: string) {
    const entries = await readSyncEntries();
    if (entries.some((each) => each.id === id)) await writeSync(entries.filter((each) => each.id !== id));
  }

  /** Keeps a text the User gave the Project (trimmed, cut); an empty one forgets it. */
  async function keepText(project: ProjectInfo, key: "displayName" | "location", text: string, max: number): Promise<ProjectInfo> {
    const stored = await read();
    const kept = stored.projects.find((each) => each.id === project.id);
    if (!kept) return { id: project.id, name: project.name };
    const value = text.trim().slice(0, max);
    if (value === "") delete kept[key];
    else kept[key] = value;
    await write(stored);
    return infoOf(kept);
  }

  const readDisplay = async () => readPreferences(await module.storage.get(DISPLAY_KEY));

  const writeLabelFilters = (all: Record<string, LabelFilter>) =>
    module.storage.set(LABEL_FILTERS_KEY, Object.fromEntries(Object.entries(all).map(([id, each]) => [id, { pattern: each.pattern, replacement: each.replacement }])));
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
        markerHidden: changes.markerHidden ?? kept.markerHidden,
        treeLabels: changes.treeLabels ?? kept.treeLabels,
        toc: {
          open: changes.toc?.open ?? kept.toc.open,
          width: changes.toc?.width !== undefined && Number.isFinite(changes.toc.width) ? clampTocWidth(changes.toc.width) : kept.toc.width,
        },
        sidebar: {
          width: changes.sidebar?.width !== undefined && Number.isFinite(changes.sidebar.width) ? clampSidebarWidth(changes.sidebar.width) : kept.sidebar.width,
        },
      };
      await module.storage.set(DISPLAY_KEY, { lines: next.lines, whiteBackground: next.whiteBackground, showHidden: next.showHidden, markerHidden: next.markerHidden, treeLabels: next.treeLabels, toc: { ...next.toc }, sidebar: { ...next.sidebar } });
      return next;
    },
    async connect() {
      // Nothing awaited before the request: it must leave from the User's click.
      const mustNotOverlap = projectFolders;
      const listed = known;
      const folder = await module.folders.request({ mustNotOverlap }).catch((error: unknown) => {
        if (error instanceof TesselloError && error.code === "overlapping") {
          const clash = listed.find((each) => each.id === error.folder);
          throw new FolderRefused("overlapping", clash);
        }
        throw error;
      });
      if (!folder) return null;
      const stored = await read();
      const project = { id: folder.id, name: folder.name };
      if (!stored.projects.some((each) => each.id === project.id)) stored.projects.push(project);
      stored.active = project.id;
      await write(stored);
      return project;
    },
    async list() {
      const states = new Map((await module.folders.list()).map((folder) => [folder.id, folder.state]));
      return (await read()).projects.map((project) => ({ ...infoOf(project), state: states.get(project.id) === "granted" ? "available" : "unavailable" }));
    },
    async active() {
      const stored = await read();
      const active = stored.projects.find((project) => project.id === stored.active);
      return active ? infoOf(active) : null;
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
    setDisplayName: (project, displayName) => keepText(project, "displayName", displayName, MAX_DISPLAY_NAME),
    async setLocation(project, location) {
      const info = await keepText(project, "location", location, MAX_LOCATION);
      // A grant connected before the key existed gains its entry here: sync can find the Project by its location.
      const kept = (await read()).projects.find((each) => each.id === project.id);
      if (kept) await putSync(kept, (await readSyncEntries()).find((each) => each.id === project.id)?.path);
      return info;
    },
    async setVersionsPeriod(project, days) {
      const stored = await read();
      const kept = stored.projects.find((each) => each.id === project.id);
      if (!kept) return { id: project.id, name: project.name };
      kept.versionsPeriod = clampPeriod(days);
      await write(stored);
      return infoOf(kept);
    },
    async reconnect(project) {
      return (await module.folders.reconnect(folderOf(project))) === "granted";
    },
    async connectRepository(project) {
      const folder = await module.folders.request({ mustContain: folderOf(project) }).catch((error: unknown) => {
        if (error instanceof TesselloError && error.code === "not_containing") throw new FolderRefused("notContaining");
        throw error;
      });
      if (!folder) return null;
      const stored = await read();
      const kept = stored.projects.find((each) => each.id === project.id);
      if (!kept) return { id: folder.id, name: folder.name };
      const previous = kept.repository;
      kept.repository = { id: folder.id, name: folder.name };
      await write(stored);
      // The known path stays only for the same repository; the Project folder itself lies at "".
      const known = previous?.id === folder.id ? (await readSyncEntries()).find((each) => each.id === kept.id)?.path : undefined;
      await putSync(kept, folder.id === kept.id ? "" : known);
      if (previous && previous.id !== folder.id) await releaseUnused(stored, previous);
      return { ...kept.repository };
    },
    async repository(project) {
      const kept = (await read()).projects.find((each) => each.id === project.id)?.repository;
      if (!kept) return null;
      const states = new Map((await module.folders.list()).map((folder) => [folder.id, folder.state]));
      return { id: kept.id, name: kept.name, state: states.get(kept.id) === "granted" ? "available" : "unavailable" };
    },
    async syncEntry(project) {
      return (await readSyncEntries()).find((each) => each.id === project.id) ?? null;
    },
    async foundProjectPath(project, path) {
      const kept = (await read()).projects.find((each) => each.id === project.id);
      if (kept) await putSync(kept, path);
    },
    async disconnectRepository(project) {
      const stored = await read();
      const kept = stored.projects.find((each) => each.id === project.id);
      const previous = kept?.repository;
      if (!kept || !previous) return;
      delete kept.repository;
      await write(stored);
      await dropSync(kept.id);
      await releaseUnused(stored, previous);
    },
    async remove(project) {
      const stored = await read();
      const repository = stored.projects.find((each) => each.id === project.id)?.repository;
      stored.projects = stored.projects.filter((each) => each.id !== project.id);
      if (stored.active === project.id) stored.active = null;
      delete stored.lastOpened[project.id];
      await write(stored);
      await dropSync(project.id);
      await releaseUnused(stored, folderOf(project));
      if (repository) await releaseUnused(stored, repository);
      const favorites = await readAllFavorites();
      delete favorites[project.id];
      await writeFavorites(favorites);
      const filters = readLabelFilters(await module.storage.get(LABEL_FILTERS_KEY));
      delete filters[project.id];
      await writeLabelFilters(filters);
    },
    async labelFilter(project) {
      return readLabelFilters(await module.storage.get(LABEL_FILTERS_KEY))[project.id] ?? { ...NO_LABEL_FILTER };
    },
    async setLabelFilter(project, filter) {
      const filters = readLabelFilters(await module.storage.get(LABEL_FILTERS_KEY));
      filters[project.id] = { pattern: filter.pattern, replacement: filter.replacement };
      await writeLabelFilters(filters);
      return filters[project.id];
    },
  };
}
