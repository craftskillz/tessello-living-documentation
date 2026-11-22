# Documents: snippets

Atlas page: `features/documents/snippets.md` (business rules R1–R12). Atlas answers: Q-029 to Q-034. Rules of the original not changed here are kept. Directive syntax: ADR 0005.

## Catalog

1. **25 kinds**: the original's 27 minus **Local search** (browser find instead) and **Diagram** (Diagrams is a separate Tessello module; existing diagram links render as plain images that enlarge on click). The **Kanban board** snippet stays; its behavior: Kanban round.
2. Picker, search, forms, the table grid editor and the save rules (R1–R3, R5–R11) are kept. Every default text and tooltip is translated (cross-cutting language rule).

## Changed from the original

3. **Source positions**: every rendered block carries its source line range. Edit, Delete and Insert-after use it, and check before writing that the source there is still what was rendered. No matching by order among blocks of the same shape.
4. **Failures** keep the dialog open with its content and show the error inside it with **Retry**. On a conflict the Document is re-read and the block located again by its content: found → Retry applies there; not found → "This block changed on disk" with **Copy Markdown**.
5. **Reopen in their form**: the original's 21 kinds; Mermaid Builder charts (pie, timeline, tree view, sequence) parsed back into builder rows, else a plain code block; layout columns (options editable, column content untouched); attachment links as links (text and target). Emojis stay plain text.
6. **File attachment** from the right-click insert opens the file chooser, as from the editor. Escape closes the dialog everywhere. The unused "detected type" messages are removed.
7. **Layout** form: 2–4 columns; documents with up to 6 render.
8. **Content rules**: `|` in a table cell is escaped as `\|`; tree names are drawn as typed (no "/ makes folders" hint); pie weights are numbers ≥ 0 with no total cap.
