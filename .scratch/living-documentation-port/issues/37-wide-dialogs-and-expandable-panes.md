# 37: Wide section and snippet dialogs, expandable panes

**What to build:** The section dialog and a snippet's form (bullet list, table…) take 80% of the window's width. In the section dialog, the Markdown pane and the preview pane each have a button that makes it take the dialog's whole width (the other pane hidden); the same button, now **Show both**, puts them back side by side. Wide content then scrolls horizontally.

**Blocked by:** none

**Status:** built, awaiting the trial in the local Host

- [x] Section dialog: 80% of the window's width
- [x] Snippet dialog: 80% of the window's width on a snippet's form; the picker keeps its narrow width
- [x] Expand the Markdown / Expand the preview / Show both, in the section dialog; the hidden pane stays mounted (the editor keeps its caret and undo); both panes show again at the next section
- [x] Wide content scrolls horizontally in an expanded pane; the expanded Markdown stops wrapping its lines (side by side it wraps), the expanded preview fits the width
- [x] Every text in English and French
- [x] Typecheck, unit and browser suites green
- [ ] Tried in the local Host

## Settled

- With the User, 2026-11-27: 80% of the screen's width for both dialogs; a pane can be expanded to the full width, with horizontal scrolling when needed.

## Comments

- The User asked to expand a pane "by clicking on it": a click in the editor places the caret, so each pane has its own button above it instead (Expand the Markdown, Expand the preview, then Show both).
- A table already scrolls horizontally in its own wrapper (`div.overflow-x-auto` from render.ts); other wide content scrolls the pane. Expanded, the Markdown editor stops wrapping its lines (CodeMirror's `lineWrapping` in a compartment, `wrap` prop of Editor.svelte), so a table's source reads on one line and scrolls horizontally; side by side it wraps again.
- The snippet picker (the search list) keeps its 40rem: 80% applies once a snippet's form is open.
- After the User's first look (2026-11-27): more room between the toolbar and the pane buttons; the expanded Markdown scrolls horizontally instead of wrapping. `@codemirror/state` is now a declared dependency (it was only transitive).
