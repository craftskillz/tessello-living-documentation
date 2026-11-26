# 22: Kanban II: columns, new cards, deleting a board

**What to build:** Edit columns (1–6, six colors) refuses two names mapping to the same folder; renaming a column renames its folder (links and favorites follow); removing a column whose folder holds cards asks to move them to another column or keep the folder. New card: name as typed, `<Name>.md` starting with `# <Name>`, a translated skeleton or a template. Deleting the board keeps its column folders and cards, and the confirmation says so.

**Blocked by:** 18 (New Document from a template), 21 (Kanban I: the board)

**Status:** ready-for-human (built in 62ac7c8; awaiting the trial in the local Host)

- [x] Edit columns with the collision refusal
- [x] Rename and remove column behaviors
- [x] New card from a skeleton or a template
- [x] Delete board keeps folders and cards
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- Built in three seams. **Model** (pure, `src/lib/kanban.ts`): `kanbanBlockText`, `columnsProblem` (count 1–6, a name without a folder, two names with one folder ignoring case and accents), `cardText`; `kanbanBlockAt(model)` in `render.ts` gives the block and its range, on the rendering's own rule. **Board over the Project** (`src/lib/board.ts`): `saveColumns` and `createCard`. **View**: `src/view/EditColumns.svelte` (⚙ Edit columns in the board's header), the **+** form of each column in `Board.svelte`, the board's delete confirmation; 12 journeys added to `e2e/kanban.test.ts`. Unit 930/930, browser 323/323; `tessello validate` installable (the three known warnings).
- Saving columns, in order: names checked (Save disabled while the dialog shows why); a renamed column whose new folder already exists as another folder is refused, naming the column, nothing written; the block is written against the version the View read (an agent edit meanwhile: "The board changed on disk…", reloaded); then folders renamed (links and favorites follow through `Project.rename`), then the cards of removed columns moved. A rename or move failing after the block was written is reported (naming the path), not rolled back: the board then shows the new, empty folder and the old one keeps its cards in the Tree.
- A removed column's folder is deleted when it holds nothing but its Folder manifest: after its cards moved, or when it had none. "Keep the folder" touches nothing. A removed column with cards and no kept column to move them to only offers Keep.
- Removing a column and giving its folder name to another column in the same save is refused as taken (the folder still exists at the check); so is swapping two names. Save twice instead.
- Moved-in and new cards go after the column's last card, the folder's order written when it had none (rule 7), as `moveCard` already did.
- New card: `timestamp` frontmatter then `# <Name>`, then the translated skeleton ("Here is the description" / "## Content" / "Here is the Full Content"; French "Voici la description" / "## Contenu" / "Voici le contenu complet"), like any New document. From a template, the template rules of ticket 18 apply. The card name follows the Tree's naming rule (no slug, unlike the original).
- Deleting the board removes only its Document; the confirmation reads "Delete the board “…”? Its column folders and their cards are kept."
- Also fixed: a race in `e2e/view.test.ts` (the Tree read before it rendered) that failed about one run in three.
- Differences from the original: Edit columns is its own dialog (no snippet form, no Markdown preview, no Delete block; deleting the block is done in Edit); renames carry the folder (Q-049); the skeleton is translated and a template can be chosen (Q-052).
- Not done: the trial in the local Host.
