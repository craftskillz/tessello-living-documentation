# 21: Kanban I: the board

**What to build:** A Document whose Kanban block is real Markdown shows its own text then the board. Columns map to folders (the original's mapping: accents removed, other characters `_`), created when missing on opening; cards are the Documents in each column folder in its manifest order, then alphabetical. I drag cards within a column (reordering the manifest) and between columns (moving the file, links and favorites following, appended at the end); a name collision blocks the move with a message. Header: Favorite, Edit, Edit columns (next ticket), Copy path, Delete.

**Blocked by:** 03 (Reading: Mermaid, Kanban blocks and Tag marker pills), 09 (Tree: rename and move)

**Status:** ready-for-human (built in d6555c7; awaiting the trial in the local Host)

- [x] Board under the Document's text; detection rule shared with the header
- [x] Column folders and card order
- [x] Drag within and between columns with the file moved and order kept
- [x] Collision message; refresh through the change check
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- Built in three seams. **Model** (pure): `columnFolder`, `boardColumns` and `cardDescription` in `src/lib/kanban.ts`; `kanbanBlockOf(model)` in `src/lib/render.ts`, sharing one finder with the rendering, so header and board follow the rendering's rule (the render option `board` leaves the block out; the HTML view keeps its preview). **Board over the Project**: `loadBoard` and `moveCard` in `src/lib/board.ts`, on `Project` (moves go through `Project.move`, so links, annotations and favorites follow). **View**: `src/view/Board.svelte`, the board mode of `Header.svelte` and the wiring in `View.svelte`; 9 journeys in `e2e/kanban.test.ts`, the Kanban journey of `e2e/diagrams.test.ts` updated. Unit 621/621, browser 230/230; `tessello validate` installable (the three known warnings).
- The detection lives in `render.ts`, not in `document` as docs/design.md says: it must be the rendering's own rule (compare regions, quotes and lists), and sharing the finder keeps them from drifting.
- Hidden Documents of a column folder are cards: the board shows the folder's files. Missing column folders are created one after the other (each is appended to the parent manifest's custom order); a folder that cannot be created (`images` at the root, a file of that name) shows a translated message in its column, and the other columns load. They are created again at each load, so a column folder deleted outside the Module comes back within the change check.
- Columns whose labels map to the same folder are shown once (the first); a label with no folder name is not a column (as the original, R4). Refusing them belongs to Edit columns (ticket 22).
- Within a column a card goes before or after the card it is dropped on (pointer half); dropped in another column it goes last, even when that folder has no custom order yet (`{ after: <last card> }` writes the order). Dropped back at its place, nothing is written. The collision message names the card's file.
- The board reloads on any change the 5-second check reports while it is open (it reads every card again; fine at board sizes).
- A card whose text cannot be read shows "This card could not be read." in place of its description (the original left it out silently, Q-051).
- Differences from the original: the board's own text shows above the board and Edit is there (Q-048); cards follow the manifest order and can be reordered (Q-053); the header has no White background, Lines, table of contents, settings cog, Marker or HTML actions; no section editing or annotations on a board (Q-060, R12); each card also shows its date, each column a counter, as the original did.
- The column palette is now shared by the reading preview and the board (`.ld-kanban-<color>` in `document.css`, no longer scoped to `.document`).
- New glossary entries: Kanban board, Column, Card.
- Not done yet: the screenshot beside the cog panel (docs/ui.md) and the trial in the local Host.
