# 36: Format the Markdown in the editor

**What to build:** While editing (the whole Document or a section), a **Format** button next to Snippets reformats the Markdown, as IntelliJ's Reformat does on a scratch file: above all, GFM tables get their columns aligned. **Done** formats too before it saves and closes. The autosave never formats: the text must not move under the User's caret while they type.

**Blocked by:** none

**Status:** done (63f101c)

- [x] `src/lib/format.ts`: `formatMarkdown(text): string`, pure and idempotent
  - GFM tables: every cell padded to its column's width, one space inside each pipe, leading and trailing pipes; the delimiter row is dashes filling the width, keeping its alignment colons (`:---`, `:---:`, `---:`); a cell of a centered or right-aligned column is padded on the side its alignment says; rows with fewer cells get empty cells; escaped pipes `\|` stay in their cell; width counts East Asian wide characters and emoji as two columns
  - tables inside a blockquote or a list keep their prefix
  - trailing spaces and tabs removed from lines, except a hard line break (two or more spaces after text, text on the next line) kept as exactly two spaces
  - runs of blank lines collapsed to one; the text ends with exactly one newline (an empty text stays empty)
  - never changes the frontmatter, fenced or indented code blocks, HTML blocks, nor a line ending other than trailing whitespace
- [x] Format button in the editing toolbar of the Document and of the section dialog; the change is one undoable step and keeps the caret near where it was
- [x] Done (button, and in the section dialog Escape and Cmd/Ctrl+Enter, which act as Done) formats, then saves and closes; nothing is formatted while a conflict is shown
- [x] The autosave saves the text as typed
- [x] Every text in English and French
- [x] Typecheck, unit and browser suites green
- [x] Tried in the local Host

## Settled

- With the User, 2026-11-27: Format on the button and on Done, never on the autosave, to not disturb the User's typing.

## Comments

- A hard line break is kept only when text follows on the next line and never on an ATX heading; elsewhere the two spaces go. A setext heading's title line (`Title  ` over `===`) and a `:::` line followed by text still keep two spaces: harmless, left as is.
- A `|` inside a code span splits the cell, as in GFM (the reading view splits it too); `\|` keeps it in the cell.
- A line right under a table, without a blank line, is a row of it in GFM and is aligned as one.
- The line ending is kept (CRLF if the text has any). The frontmatter is copied as is, one blank line after it kept.
- A section is formatted on its own and keeps the line breaks that end it, so the blank line before the next heading stays.
- The Format button also does nothing while a conflict is shown.
- Typecheck, 1167 unit tests and 405 browser tests green. Tried in the local Host by the User (2026-11-27): no difference from the spec.
