# Documents: reading and editing

Atlas page: `features/documents/reading-and-editing.md` (business rules R1–R10). Atlas answers: Q-020 to Q-027 (Q-028: [frontmatter](frontmatter.md)). Rules of the original not changed here are kept.

## Editing

1. **Autosave** about 1 second after typing stops, and immediately when the User opens another Document or Project. No overlap between saves; text typed during a save is saved next (R3). No leave warning.
2. **Revert** (was Cancel) restores the file as it was when **Edit** was clicked, after a confirmation if anything changed, and closes the editor. **Done** closes after the final save.
3. **Conflict** (file changed on disk since editing started): "This document changed on disk since you started editing", with **Compare** (side-by-side diff, your text vs the disk), **Keep mine** (overwrite) and **Take theirs** (reload, your text copied to the clipboard first). The text stays in the editor and autosave pauses until the User chooses. Same behavior in the section editor.
4. **Editor**: CodeMirror 6 with Markdown highlighting, line numbers, undo and in-editor find, for both the full-document and the section editor. The prose wraps; table rows and fenced code lines stay whole and the editor scrolls horizontally to show them. Section rules R5 kept. **Format** (a button next to Snippets, and **Done**) aligns the tables and tidies the Markdown as one undoable change; the autosave never formats, so the text does not move while the User types.
5. **Pasted or dropped image**: a name prompt proposing a timestamp; the name is used as typed with the Tree's refused characters; if it exists in `images/`, the prompt says so and proposes `<name>-2`. Never overwrites. **Dropped other files** go to `files/`. The link is inserted at the paste or drop point.
6. After a save the Document is read back; a save normalizes nothing ([frontmatter](frontmatter.md) rule 2); only Format, at the User's request, does.

## Reading

7. **Rendering is complete**: Mermaid, syntax highlighting, collapsible long code blocks, footnotes, callouts, column layouts, Card blocks, `:::compare`, table and image directives (ADR 0005; a Mermaid block takes the `mermaid-width` and `mermaid-align` its form writes, as well as `code-width` and `code-align`), heading anchors and `#anchor` deep links. A bare `<br>` (`<br/>`, `<br />`) is a line break, in a paragraph or a table cell; any other raw HTML stays out, but for the snippets' own shapes.
8. **Links**: relative `.md` links and the original's `?doc=<id>` links are both followed; the Module writes only relative links. The back trail is kept.
9. **Header actions**: **Copy path** (relative path in the Project, replaces Copy MCP id), **Lines**, **White background**, table of contents, **Edit**, **Delete**. Validate, Metadata and Export PDF are removed. Favorite, Listen, Marker, HTML actions and Versions: their own rounds.
10. **Display preferences** remembered in the Module's storage: Lines, table of contents state and width, White background.
11. Image enlargement (Shift/Cmd + click), Copy image and Copy table kept (clipboard image copy inside the sandbox to be verified by a prototype).
12. **No in-document search box**: the Local search snippet is dropped; the browser's find is used.
13. **No printing** in v1.
14. **Folder manifest** opened read-only: frontmatter as a YAML block, Lines, table of contents and Copy path; no Edit, Delete or Favorite.
17. **Every newline is a line break** (Project setting `markdownSoftBreaks` in `.living-doc.json`, the original's key): on, a single newline in a paragraph renders as a line break; off, plain CommonMark (adjacent lines merge; two trailing spaces or `<br/>` break). Missing or not a boolean: **on**, as the original's code (its help text says off). Changed from the settings cog of the Document header. Applies to reading, the editor's preview and the HTML view. Added after the first rounds, hence its number.

## Deleting

15. **Delete** confirms with the number of Documents that link to this one; those links become plain text, and the Document leaves favorites. Permanent.
16. Failures show a translated message (cross-cutting rule), including a refused delete and a first Document that fails to load.
