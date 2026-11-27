# 15: Snippets II: Mermaid Builder, layout columns and attachments

**What to build:** The Mermaid Builder kinds (pie, timeline, tree view, sequence), layout columns (2–4 in the form) and file attachments complete the 25 kinds, and reopen in their forms (builder rows parsed back, else a plain code block; column options editable, content untouched; attachment links as text and target). Pie weights are numbers ≥ 0 with no total cap; tree names drawn as typed.

**Blocked by:** 14 (Snippets I: picker, forms and block actions)

**Status:** ready-for-human (built in 66f1383; awaiting the trial in the local Host)

- [x] The remaining kinds insert correct Markdown
- [x] They reopen in their forms
- [x] Pie and tree rules as specified
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Mermaid Builder** writes the original's formats (pie, `timeline`, `treeView-beta`, `sequenceDiagram`), without the pie's 100 cap; a negative or empty weight is written 0; tree levels clamped to 0–6. A block reopens in the builder only when every line is of its chart's row grammar; anything else (a `participant` line, `%%` comments, a `mermaid-width`/`-align` directive before it) reopens as a Code block. Lines are made one line (whitespace runs collapsed), as the original did.
- **Examples translated**: pie, timeline events, sequence and tree notes; the tree's file names and the timeline's years stay as written.
- **Layout**: the form offers 2–4 columns; a reopened layout keeps its column text byte for byte (the text between the two comments), so the Columns select is disabled and shows the real count (up to 6). Vertical align Center and Gap Medium are the defaults and not written. The rendered layout now carries `data-src`, so a right-click on a plain paragraph in a column edits the layout, on a snippet inside a column edits that snippet. `<!-- col -->` is no longer taken as a directive of the block after it.
- **File attachment**: Insert opens the file chooser from the editor and from Insert a snippet here (the original did nothing there, Q-030); the file is saved under `files/` like a dropped file (an image too, as a plain attachment) and linked as `[📎 name](path)`. A save failure shows "The file could not be saved." with Retry; a Retry after a refused Document save does not save the file twice. A 📎 link reopens with Link text and Target.
- **Small choices**: row inputs are labelled with their row number; the last row of a builder list cannot be removed; Add item starts a pie row at 10, a timeline row copies the last period, a tree node the last level.
- **Left over**: the trial in the local Host (does Mermaid 11 draw `treeView-beta`?); the reviews' judgement calls: the layout pairing duplicated between `render.ts` `columns()` and `snippetBlocks.ts`; one Mermaid data shape holding the four charts' rows (kept so that switching chart keeps the examples); the per-kind switches and the size of `Snippets.svelte` (ticket 14's left-overs) grew.
