// A Kanban board's columns and cards on the Test Host's disk (docs/spec/kanban-boards.md).

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connect } from "@tessello/sdk";
import { createTestHost } from "@tessello/sdk/testing";
import { loadBoard, moveCard } from "../src/lib/board.ts";
import { parseKanbanBlock } from "../src/lib/kanban.ts";
import { FOLDER_MANIFEST, openProject, Refused } from "../src/lib/project.ts";
import { createProjects } from "../src/lib/projects.ts";

const MODULE = { id: "@craftskillz/living-documentation", version: "0.0.1" };

/** A Project opened on a folder holding `files`, with the Test Host to look at its disk. */
async function projectOf(files: Record<string, string> = {}) {
  const host = createTestHost({ module: MODULE, permissions: { folders: true } });
  const disk = host.folders.create("docs", files);
  host.folders.choose(disk);
  const module = await connect({ transport: host.mount({ surface: "view" }).transport });
  const folder = (await module.folders.request())!;
  return { host, disk, module, project: openProject(module, folder) };
}

const block = (...labels: string[]) => parseKanbanBlock(`<div data-ld-kanban data-columns="${labels.join("|")}"></div>`)!;
const manifest = (...order: string[]) => `---\norder: [${order.join(", ")}]\nhidden: []\n---\n`;
const exists = (host: Awaited<ReturnType<typeof projectOf>>["host"], disk: Awaited<ReturnType<typeof projectOf>>["disk"], path: string) => host.folders.read(disk, path) !== null;

describe("opening a board", () => {
  test("creates the missing column folders next to the board Document", async () => {
    const { host, disk, project } = await projectOf({ "projets/board.md": "# Board" });

    const columns = await loadBoard(project, "projets/board.md", block("To do", "Doing"));

    assert.deepEqual(columns.map((each) => [each.label, each.folder, each.cards, each.failure]), [
      ["To do", "projets/To_do", [], null],
      ["Doing", "projets/Doing", [], null],
    ]);
    assert.ok(exists(host, disk, `projets/To_do/${FOLDER_MANIFEST}`));
    assert.ok(exists(host, disk, `projets/Doing/${FOLDER_MANIFEST}`));
  });

  test("every new column folder is added to the custom order of the board's Folder", async () => {
    const { host, disk, project } = await projectOf({ "projets/board.md": "# Board", [`projets/${FOLDER_MANIFEST}`]: manifest("board.md") });

    await loadBoard(project, "projets/board.md", block("To do", "Doing", "Done"));

    assert.match(host.folders.read(disk, `projets/${FOLDER_MANIFEST}`)!, /board\.md[\s\S]*To_do[\s\S]*Doing[\s\S]*Done/);
  });

  test("reports a column folder that cannot be created, shows it empty and loads the others", async () => {
    const { project } = await projectOf({ "board.md": "# Board", "Done/a.md": "# A", "files": "not a folder" });

    const columns = await loadBoard(project, "board.md", block("images", "Done", "files"));

    assert.equal((columns[0]!.failure as Refused).reason, "reservedFolder");
    assert.deepEqual(columns[0]!.cards, []);
    assert.equal(columns[1]!.failure, null);
    assert.deepEqual(columns[1]!.cards.map((each) => each.path), ["Done/a.md"]);
    assert.equal((columns[2]!.failure as Refused).reason, "reservedFolder");
  });

  test("reports a column whose name is taken by a file", async () => {
    const { project } = await projectOf({ "board.md": "# Board", "Todo": "a file" });

    const [column] = await loadBoard(project, "board.md", block("Todo"));

    assert.equal((column!.failure as Refused).reason, "taken");
    assert.deepEqual(column!.cards, []);
  });

  test("lists the cards in the manifest order, then alphabetical", async () => {
    const { project } = await projectOf({
      "board.md": "# Board",
      "Todo/b.md": "# B",
      "Todo/a.md": "# A",
      "Todo/c.md": "# C",
      "Todo/d.md": "# D",
      [`Todo/${FOLDER_MANIFEST}`]: manifest("d.md", "c.md"),
    });

    const [column] = await loadBoard(project, "board.md", block("Todo"));

    assert.deepEqual(column!.cards.map((each) => each.name), ["d.md", "c.md", "a.md", "b.md"]);
  });

  test("takes only the Documents directly in the column folder, hidden ones included", async () => {
    const { project } = await projectOf({
      "board.md": "# Board",
      "Todo/a.md": "# A",
      "Todo/hid.md": "# Hidden",
      "Todo/deeper/x.md": "# X",
      "Todo/pic.png": "png",
      "Todo/notes.txt": "text",
      [`Todo/${FOLDER_MANIFEST}`]: "---\norder: []\nhidden: [hid.md]\n---\n",
    });

    const [column] = await loadBoard(project, "board.md", block("Todo"));

    assert.deepEqual(column!.cards.map((each) => each.path), ["Todo/a.md", "Todo/hid.md"]);
  });

  test("gives each card its title, description and date", async () => {
    const { project } = await projectOf({
      "board.md": "# Board",
      "Todo/a.md": "---\ntimestamp: 2026-03-04T14:30:12.000Z\n---\n# Alpha\nFirst **line**.\n\n## Content\nBody\n",
    });

    const [column] = await loadBoard(project, "board.md", block("Todo"));

    assert.deepEqual(column!.cards, [
      { path: "Todo/a.md", name: "a.md", title: "Alpha", description: "First line.", date: { kind: "created", at: "2026-03-04T14:30" } },
    ]);
  });

  test("a card whose text cannot be read has no description (null), and the others load", async () => {
    const { project } = await projectOf({ "board.md": "# Board", "Todo/a.md": "# A\nFirst.", "Todo/b.md": "# B\nSecond." });
    const failing = { ...project, read: (path: string) => (path === "Todo/a.md" ? Promise.reject(new Error("unreadable")) : project.read(path)) };

    const [column] = await loadBoard(failing, "board.md", block("Todo"));

    assert.deepEqual(column!.cards.map((card) => [card.name, card.description]), [["a.md", null], ["b.md", "Second."]]);
  });
});

describe("moving a card", () => {
  const board = { "board.md": "# Board" };
  const names = async (project: Awaited<ReturnType<typeof projectOf>>["project"], folder: string) =>
    (await loadBoard(project, "board.md", block(folder)))[0]!.cards.map((each) => each.name);

  test("within its column writes the new order in the column's manifest", async () => {
    const { project } = await projectOf({ ...board, "Todo/a.md": "# A", "Todo/b.md": "# B", "Todo/c.md": "# C" });
    const columns = await loadBoard(project, "board.md", block("Todo"));

    const path = await moveCard(project, columns, "Todo/c.md", "Todo", { before: "a.md" });

    assert.equal(path, "Todo/c.md");
    assert.deepEqual(await names(project, "Todo"), ["c.md", "a.md", "b.md"]);
    assert.match((await project.read(`Todo/${FOLDER_MANIFEST}`)).text, /order:\n {2}- c\.md\n {2}- a\.md\n {2}- b\.md/);
  });

  test("at the place it already has writes nothing", async () => {
    const { project } = await projectOf({ ...board, "Todo/a.md": "# A", "Todo/b.md": "# B", [`Todo/${FOLDER_MANIFEST}`]: manifest("a.md", "b.md") });
    const columns = await loadBoard(project, "board.md", block("Todo"));
    const before = await project.read(`Todo/${FOLDER_MANIFEST}`);

    await moveCard(project, columns, "Todo/a.md", "Todo", { before: "b.md" });
    await moveCard(project, columns, "Todo/b.md", "Todo", { after: "a.md" });
    await moveCard(project, columns, "Todo/a.md", "Todo", { after: "a.md" });
    await moveCard(project, columns, "Todo/b.md", "Todo");

    assert.deepEqual(await project.read(`Todo/${FOLDER_MANIFEST}`), before);
  });

  test("dropped on itself stays where it is", async () => {
    const { project } = await projectOf({ ...board, "Todo/a.md": "# A", "Todo/b.md": "# B", "Todo/c.md": "# C", [`Todo/${FOLDER_MANIFEST}`]: manifest("a.md", "b.md", "c.md") });
    const columns = await loadBoard(project, "board.md", block("Todo"));

    await moveCard(project, columns, "Todo/a.md", "Todo", { before: "a.md" });

    assert.deepEqual(await names(project, "Todo"), ["a.md", "b.md", "c.md"]);
  });

  test("to another column moves the file and puts it last, even when that column has no custom order", async () => {
    const { host, disk, project } = await projectOf({ ...board, "Todo/b.md": "# B", "Done/a.md": "# A", "Done/c.md": "# C" });
    const columns = await loadBoard(project, "board.md", block("Todo", "Done"));

    const path = await moveCard(project, columns, "Todo/b.md", "Done");

    assert.equal(path, "Done/b.md");
    assert.ok(!exists(host, disk, "Todo/b.md"));
    assert.deepEqual(await names(project, "Done"), ["a.md", "c.md", "b.md"]);
  });

  test("to another column at a given place puts it there", async () => {
    const { project } = await projectOf({ ...board, "Todo/b.md": "# B", "Done/a.md": "# A", "Done/c.md": "# C" });
    const columns = await loadBoard(project, "board.md", block("Todo", "Done"));

    await moveCard(project, columns, "Todo/b.md", "Done", { before: "c.md" });

    assert.deepEqual(await names(project, "Done"), ["a.md", "b.md", "c.md"]);
  });

  test("into an empty column moves it there", async () => {
    const { project } = await projectOf({ ...board, "Todo/a.md": "# A" });
    const columns = await loadBoard(project, "board.md", block("Todo", "Done"));

    assert.equal(await moveCard(project, columns, "Todo/a.md", "Done"), "Done/a.md");
    assert.deepEqual(await names(project, "Done"), ["a.md"]);
    assert.deepEqual(await names(project, "Todo"), []);
  });

  test("onto a name already in the other column is refused and moves nothing", async () => {
    const { host, disk, project } = await projectOf({ ...board, "Todo/a.md": "# Mine", "Done/a.md": "# Theirs" });
    const columns = await loadBoard(project, "board.md", block("Todo", "Done"));

    await assert.rejects(moveCard(project, columns, "Todo/a.md", "Done"), (error) => error instanceof Refused && error.reason === "taken");

    assert.equal(host.folders.read(disk, "Todo/a.md"), "# Mine");
    assert.equal(host.folders.read(disk, "Done/a.md"), "# Theirs");
  });

  test("makes the links to the card in other Documents follow", async () => {
    const { project } = await projectOf({ ...board, "Todo/a.md": "# A", "notes.md": "See [A](Todo/a.md)." });
    const columns = await loadBoard(project, "board.md", block("Todo", "Done"));

    await moveCard(project, columns, "Todo/a.md", "Done");

    assert.equal((await project.read("notes.md")).text, "See [A](Done/a.md).");
  });

  test("makes the favorites follow when the Project comes from the Module's Projects", async () => {
    const host = createTestHost({ module: MODULE, permissions: { folders: true } });
    host.folders.choose(host.folders.create("docs", { "board.md": "# Board", "Todo/a.md": "# A" }));
    const projects = createProjects(await connect({ transport: host.mount({ surface: "view" }).transport }));
    const info = (await projects.connect())!;
    await projects.setFavorites(info, [{ path: "Todo/a.md", title: "A" }]);
    const project = projects.open(info);
    const columns = await loadBoard(project, "board.md", block("Todo", "Done"));

    await moveCard(project, columns, "Todo/a.md", "Done");

    assert.deepEqual((await projects.favorites(info)).map((each) => each.path), ["Done/a.md"]);
  });
});
