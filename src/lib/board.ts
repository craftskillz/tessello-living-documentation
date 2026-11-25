// A Kanban board (docs/spec/kanban-boards.md): its columns are folders, its cards the Documents in them. The View only
// calls loadBoard and moveCard.

import { type BoardColumn, boardColumns, cardDescription, type KanbanBlock } from "./kanban.ts";
import { isReservedFolder, type Project, type TreeDate, type TreeEntry } from "./project.ts";

export interface Card {
  path: string;
  /** Its file name, with .md. */
  name: string;
  title: string;
  /** Its description, null when its text could not be read. */
  description: string | null;
  date: TreeDate;
}

/** Where a card goes in its column: just before or after the card of that name. */
export type CardPlace = { before: string } | { after: string };

export interface Column extends BoardColumn {
  cards: Card[];
  /** Why its folder could not be created; null when it exists. */
  failure: unknown | null;
}

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

/** The Folder at `path` in `entries`, or undefined. */
function folderAt(entries: TreeEntry[], path: string): Extract<TreeEntry, { kind: "folder" }> | undefined {
  for (const entry of entries) {
    if (entry.kind !== "folder") continue;
    if (entry.path === path) return entry;
    if (path.startsWith(`${entry.path}/`)) return folderAt(entry.children, path);
  }
  return undefined;
}

/** The board of the Document at `boardPath` whose Kanban block is `block`: its column folders created when missing, each column's cards in order. */
export async function loadBoard(project: Project, boardPath: string, block: KanbanBlock): Promise<Column[]> {
  const tree = await project.tree({ hidden: true });
  const columns = boardColumns(block, boardPath);
  // One after the other: each new folder is appended to the same parent manifest.
  const failures = new Map<string, unknown>();
  for (const column of columns) {
    if (folderAt(tree, column.folder) && !isReservedFolder(column.folder)) continue;
    const failure = await project.createFolder(parentOf(boardPath), nameOf(column.folder)).then(() => null, (error: unknown) => error);
    failures.set(column.folder, failure);
  }
  return Promise.all(
    columns.map(async (column): Promise<Column> => {
      const folder = folderAt(tree, column.folder);
      if (failures.has(column.folder)) return { ...column, cards: [], failure: failures.get(column.folder) };
      if (!folder) return { ...column, cards: [], failure: null };
      const documents = folder.children.filter((entry) => entry.kind === "document");
      const cards = await Promise.all(
        documents.map(async (entry): Promise<Card> => {
          const description = await project.read(entry.path).then((read) => cardDescription(read.text), () => null);
          return { path: entry.path, name: entry.name, title: entry.title, description, date: entry.date };
        }),
      );
      return { ...column, cards, failure: null };
    }),
  );
}

/**
 * Moves the card at `card` into the column folder `folder` of `columns`, before or after the card named so there; without
 * `place`, at the end of that column. Resolves with the card's new path. Rejects with Refused (e.g. "taken") and moves
 * nothing. Dropped on itself or at its own place, nothing is written.
 */
export async function moveCard(project: Project, columns: Column[], card: string, folder: string, place?: CardPlace): Promise<string> {
  const name = nameOf(card);
  const target = place ?? endOf(columns.find((column) => column.folder === folder)?.cards ?? [], name);
  if (target && ("before" in target ? target.before : target.after) === name) return card;
  return project.move(card, folder, target);
}

/** `{ after }` the last of `cards` other than the one named `name`; undefined when there is none. */
function endOf(cards: Card[], name: string): { after: string } | undefined {
  const last = cards.filter((each) => each.name !== name).at(-1);
  return last && { after: last.name };
}
