// A Kanban board (docs/spec/kanban-boards.md): its columns are folders, its cards the Documents in them. The View only
// calls loadBoard, moveCard, createCard and saveColumns.

import { type BoardColumn, boardColumns, type CardTexts, cardDescription, cardText, columnFolder, type ColumnsProblem, columnsProblem, type KanbanBlock, type KanbanColor, kanbanBlockText } from "./kanban.ts";
import { parseDocument } from "./document.ts";
import { applyEdits } from "./edits.ts";
import { FOLDER_MANIFEST, isReservedFolder, type DocumentText, type Project, Refused, type TreeDate, type TreeEntry } from "./project.ts";
import { kanbanBlockAt } from "./render.ts";
import type { TemplateLibrary } from "./templates.ts";

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

/**
 * Creates a card `<name>.md` (name as typed, the Tree's naming rule) after the last card of `column`, its folder's order
 * written when it had none: cardText(name, texts, now), or, with `template`, from that template. Resolves with its path;
 * rejects with Refused / NotFound as those do.
 */
export async function createCard(project: Project, templates: TemplateLibrary, column: Pick<Column, "folder" | "cards">, name: string, texts: CardTexts, template: string | null, now: Date): Promise<string> {
  const path = template !== null ? await templates.createDocument(template, column.folder, name) : await project.createDocument(column.folder, name, () => cardText(name, texts, now));
  const last = column.cards.at(-1);
  return last ? project.move(path, column.folder, { after: last.name }) : path;
}

/** One row of Edit columns: `from` is the folder path of the loaded column this row was (null: a new column). */
export interface ColumnEdit {
  label: string;
  color: KanbanColor;
  from: string | null;
}

/** What to do with a removed column's cards: move them to the end of a kept column (named by that row's `from`), or keep its folder (its cards leave the board). */
export type Removal = { moveTo: string } | "keep";

export class InvalidColumns extends Error {
  readonly problem: ColumnsProblem;

  constructor(problem: ColumnsProblem) {
    super(`Invalid columns: ${problem.kind}.`);
    this.name = "InvalidColumns";
    this.problem = problem;
  }
}

/** A Refused("taken") that names the row (by its label) whose folder name is already used. */
export class TakenColumn extends Refused {
  readonly label: string;

  constructor(label: string) {
    super("taken");
    this.label = label;
  }
}

export interface ColumnsFailure {
  step: "rename" | "move" | "removeFolder";
  path: string;
  reason: unknown;
}

/**
 * Saves the board's new columns: validates them (InvalidColumns), refuses a rename onto an existing folder (Refused "taken",
 * with the row's `label`), writes the Document with the new Kanban block (a Conflict propagates; Refused "missing" without
 * a block), renames the folders of renamed columns, then moves the cards of removed columns as `removals` say and removes
 * their folders when they hold nothing but their Folder manifest. Failures of the last two steps are collected.
 */
export async function saveColumns(
  project: Project,
  boardPath: string,
  base: DocumentText,
  columns: Column[],
  rows: ColumnEdit[],
  removals: Record<string, Removal>,
): Promise<{ version: string; failures: ColumnsFailure[] }> {
  const problem = columnsProblem(rows.map((row) => row.label));
  if (problem) throw new InvalidColumns(problem);

  const parent = parentOf(boardPath);
  const folderOf = (row: ColumnEdit) => (parent === "" ? "" : `${parent}/`) + columnFolder(row.label);
  const renamed = rows.filter((row): row is ColumnEdit & { from: string } => row.from !== null && folderOf(row) !== row.from);

  const tree = await project.tree({ hidden: true });
  const siblings = parent === "" ? tree : (folderAt(tree, parent)?.children ?? []);
  for (const row of renamed) {
    const wanted = folderOf(row).toLowerCase();
    if (siblings.some((entry) => entry.kind === "folder" && entry.path !== row.from && entry.path.toLowerCase() === wanted)) throw new TakenColumn(row.label);
  }

  const model = parseDocument(base.text, boardPath);
  const found = kanbanBlockAt(model);
  if (!found) throw new Refused("missing");
  const version = await project.save(boardPath, applyEdits(base.text, [{ range: found.range, text: kanbanBlockText(rows) }]), base.version);

  const failures: ColumnsFailure[] = [];
  const pathOf = new Map<string, string>();
  for (const row of rows) if (row.from !== null) pathOf.set(row.from, row.from);
  for (const row of renamed) {
    if (!folderAt(tree, row.from)) continue;
    try {
      pathOf.set(row.from, await project.rename(row.from, columnFolder(row.label)));
    } catch (reason) {
      failures.push({ step: "rename", path: row.from, reason });
    }
  }

  for (const column of columns) {
    if (rows.some((row) => row.from === column.folder)) continue;
    const removal = removals[column.folder];
    if (removal === "keep") continue;
    if (removal) {
      const target = pathOf.get(removal.moveTo);
      // After the kept column's last card, so that they go to its end even when its folder has no custom order yet.
      let last = columns.find((each) => each.folder === removal.moveTo)?.cards.at(-1)?.name;
      for (const card of column.cards) {
        try {
          if (target === undefined) throw new Refused("missing");
          await project.move(card.path, target, last === undefined ? undefined : { after: last });
          last = card.name;
        } catch (reason) {
          failures.push({ step: "move", path: card.path, reason });
        }
      }
    } else if (column.cards.length > 0) continue;
    const held = await project.entries(column.folder);
    if (held.length === 0 && !folderAt(tree, column.folder)) continue;
    if (held.some((entry) => entry.path !== `${column.folder}/${FOLDER_MANIFEST}`)) continue;
    try {
      await project.remove(column.folder);
    } catch (reason) {
      failures.push({ step: "removeFolder", path: column.folder, reason });
    }
  }
  return { version, failures };
}
