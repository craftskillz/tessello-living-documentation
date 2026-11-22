// The User's Projects (ADR 0002, docs/design.md §8): the folders they connected, the Active Project, the last Document
// opened in each, kept in the Module's storage; and Projects the browser waits to allow again (Unavailable Project).

import { type ConnectedModule, type Folder, type Json, TesselloError } from "@tessello/sdk";
import { openProject, type Project, type TreeEntry } from "./project.ts";

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

export interface Projects {
  /** Asks the User for a folder (call it from their click) and adds it as the Active Project; null if they cancel. */
  connect(): Promise<ProjectInfo | null>;
  list(): Promise<ListedProject[]>;
  active(): Promise<ProjectInfo | null>;
  setActive(project: ProjectInfo): Promise<void>;
  open(project: ProjectInfo): Project;
  /** Remembers the Document the User opened, where the Project opens next time. */
  opened(project: ProjectInfo, path: string): Promise<void>;
  /** The last Document opened in the Project if it still exists, else the first Document of its Tree, else null. */
  startDocument(project: ProjectInfo): Promise<string | null>;
  /** Asks the User to allow the folder again (call it from their click); true when it is available. */
  reconnect(project: ProjectInfo): Promise<boolean>;
  /** Forgets the Project and gives its folder back; its files stay on disk. */
  remove(project: ProjectInfo): Promise<void>;
}

const KEY = "projects";

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

const folderOf = (project: ProjectInfo): Folder => ({ id: project.id, name: project.name });

/** The first Document of a Tree, depth first. */
function firstDocument(entries: TreeEntry[]): string | null {
  for (const entry of entries) {
    if (entry.kind === "document") return entry.path;
    const inside = firstDocument(entry.children);
    if (inside) return inside;
  }
  return null;
}

export function createProjects(module: ConnectedModule): Projects {
  const read = async () => readStored(await module.storage.get(KEY));
  const write = (stored: Stored) => module.storage.set(KEY, { ...stored, projects: stored.projects.map((project) => ({ ...project })) });

  return {
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
    open: (project) => openProject(module, folderOf(project)),
    async opened(project, path) {
      const stored = await read();
      stored.lastOpened[project.id] = path;
      await write(stored);
    },
    async startDocument(project) {
      const tree = await openProject(module, folderOf(project)).tree();
      const last = (await read()).lastOpened[project.id];
      const exists = (entries: TreeEntry[]): boolean =>
        entries.some((entry) => (entry.kind === "document" ? entry.path === last : exists(entry.children)));
      return last !== undefined && exists(tree) ? last : firstDocument(tree);
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
    },
  };
}
