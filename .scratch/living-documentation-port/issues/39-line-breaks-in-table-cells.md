# 39: Line breaks in table cells

**What to build:** A GFM table row stays on one line of the file, so a line break in a cell is written `<br>`, the convention GitHub, IntelliJ and VS Code render. The Module renders a bare `<br>` (`<br/>`, `<br />`, any case) as a line break, in a table cell or a paragraph, in the reading, the section preview and the HTML view. In the Table snippet's grid, Shift+Enter in a cell writes `<br>` at the caret.

**Blocked by:** none

**Status:** done (9f58282)

- [x] `src/lib/render.ts`: a bare `<br>` is a `break`; a `<br>` with attributes, or inside inline code, is not; other raw HTML still stays out
- [x] Table grid: Shift+Enter writes `<br>` at the caret (replacing a selection); the hint says so, in English and French
- [x] Spec: reading rule 7 (`documents-reading-and-editing.md`), snippets rule 8 (`documents-snippets.md`)
- [x] Typecheck, unit and browser suites green
- [x] Tried in the local Host

## Settled

- With the User, 2026-11-27: `<br>` rather than a multi-line table syntax (grid tables): no other tool renders those, and agents read the raw file.

## Comments

- Reading rule 17 already said `<br/>` breaks a line when "Every newline is a line break" is off; it did not render before this ticket.
- Format (ticket 36) counts `<br>` in the column's width and leaves it as written.
- Lists inside a cell (`<ul><li>`) stay out: they would need more raw HTML.
- Tried in the local Host by the User (2026-11-28): approved as is.
