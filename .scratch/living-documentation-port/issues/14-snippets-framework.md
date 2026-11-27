# 14: Snippets I: picker, forms and block actions

**What to build:** The snippet picker (search, forms, table grid editor) inserts snippets; rendered blocks offer Edit, Delete and Insert-after through their source ranges, checking the source is unchanged before writing. A failed save keeps the dialog with its content and a Retry; on a conflict the Document is re-read and the block found again by content, else "This block changed on disk" with Copy Markdown. Covers the simpler kinds of the 25 (all but the Mermaid Builder kinds, layout columns and attachments).

**Blocked by:** 06 (Editing, complete)

**Status:** done (0727258, 9934946)

- [x] Picker, search, forms and the table grid editor; Escape closes
- [x] Edit, Delete and Insert-after through source ranges, with the unchanged-source check
- [x] Retry and Copy Markdown on failure
- [x] `|` escaped in table cells; defaults and tooltips translated
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [x] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Raw HTML now renders for four shapes.** Ticket 03 kept raw HTML out, but four of the original's snippet kinds write it: collapsible (`<details>`), colored section (`<div style="…border-left…">`), colored text (`<span style="color:…">`) and the Link (`<a href … target="_blank">`). Inserted snippets would otherwise show nothing, and the original's Documents hold them. `render.ts` renders exactly these shapes and keeps only validated colours (hex or a plain colour name) from their styles; any other raw HTML still stays out. Worth a line in ADR 0003 or the reading spec.
- **Kinds:** 22 of the 25 (Mermaid Builder, Layout columns and File attachment are ticket 15). 20 reopen from the reading view; Emojis stay plain text, and a Kanban Document shows as a board, so its block is not offered there (its form returns with ticket 22's Edit columns).
- **Recognized blocks** come from the Markdown tree with source ranges (`src/lib/snippetBlocks.ts`), never by order. A wrapper (collapsible, colored section) is edited as a whole, except a code block inside a collapsible; a table in a quote stays in the quote. Not recognized: Setext headings, `~~~` fences, h5–h6, a table inside a list, a tree with directive comments before it (reopens as a code block).
- **Conflicts:** the block is looked for by its whole source lines in the disk's text, the occurrence nearest its old place (a plain text search wrongly matched `# A` inside `# A, reworded`). A block an agent reindented counts as changed on disk. A Document deleted on disk is also "This block changed on disk." with Copy Markdown.
- **Delete from the right-click menu:** confirmation, then a failure shows in the toast (no dialog, so no Retry there); Delete block in the edit dialog offers Retry.
- **Insert a snippet here** on the empty space below the Document inserts at the end; a right-click in the gap between two blocks (on the article itself) offers no insert entry, unlike the original's "nearest block above".
- **Deleting a code block** that is the only child of a list item also removes the item's marker.
- **Small choices:** the tree's indent is capped at the previous row's depth + 1; in the table grid ← and → move only at the start or end of a cell's text; a newline in a table cell becomes a space; heading text is one line.
- **Table options reworked after the first build (asked by the User, 2026-11-26):** density Default / Intermediate / Compact, check boxes Borders, Rounded, Striped, Full (Striped and Full exclusive); new directives `table-fill` and `table-rounded`, the original's `table-style: striped|full` still read; the grid in the form now renders with the Document's styles. Spec: `docs/spec/documents-snippets.md` item 9. A Project colour palette was asked at the same time: ticket 33.
- **Left over:** the trial in the local Host; the reviews' judgement calls (one per-kind descriptor instead of the per-kind switches across `snippets.ts`, `snippetBlocks.ts` and `Snippets.svelte`; splitting `Snippets.svelte` into per-form components; the compare masking shared by `sections.ts`, `snippets.ts` and `snippetBlocks.ts`).
