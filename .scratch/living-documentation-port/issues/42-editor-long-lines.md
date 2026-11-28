# 42: Tables and code stay whole in the editor

**What to build:** In the Markdown editor (the whole Document's and the section's), a formatted table (ticket 36) wrapped onto several lines no longer reads as a table. Table rows and the lines of fenced code blocks now stay whole, and the editor scrolls horizontally when they are wider than it; the prose keeps wrapping.

**Blocked by:** none

**Status:** done (617b0dc)

- [x] `src/view/Editor.svelte`: a line decoration (`cm-whole-line`) on table rows (in a quote too) and fenced code lines, which keep `white-space: pre`; the content keeps the editor's width so the prose wraps to it
- [x] The section dialog's expanded Markdown (ticket 37) still turns wrapping off altogether
- [x] Reading rule 4 of `docs/spec/documents-reading-and-editing.md`
- [x] Typecheck, unit and browser suites green
- [x] Tried in the local Host

## Settled

- With the User, 2026-11-27: a horizontal scroll bar in the Document's editor when the content is too wide, above all for formatted tables.

## Comments

- Turning wrapping off for the whole editor (as the expanded section pane does) would make every one-line paragraph scroll too: only tables and code stay whole.
- A table row side by side in the section dialog now stays whole too (ticket 37's browser test changed accordingly).
- `@codemirror/view` and `@codemirror/language` are now declared dependencies (they were only transitive).
- Scrolled far right, the active line's highlight stops at the editor's width: cosmetic, left as is.
- Tried in the local Host by the User (2026-11-28): approved as is.
