# Templates

Atlas page: `features/templates.md` (business rules R1–R17). Atlas answers: Q-085 to Q-090 (Q-082: HTML generation round). Decision: ADR 0006. Rules of the original not changed here are kept.

## Storage

1. One library per Project, as files: `.templates/<folder>/<name>.md` at the Project root, hidden from the Tree. Every template belongs to a folder (R1).
2. A Project holding `.document-templates.json` is offered **Convert to files** once; the JSON is left untouched.

## Library

3. Template and folder names follow the Tree's naming rule (as typed, same refused characters), unique per folder. **Duplicate** names the copy `<name> copy`, then `<name> copy 2`…
4. Folders and templates are listed alphabetically; a moved template keeps its name in the new folder.
5. Both searches (header **Templates** menu and library screen) match name and content, ignoring case and accents.
6. **Editing** a template works like editing a Document: CodeMirror, autosave about 1 second after typing stops once the template has a name, **Revert**, and the Compare / Keep mine / Take theirs conflict banner. No "Discard your changes?" dialog.
7. **Preview** resolves images and links from the template file's location; path-based images show; links stay inert.
8. Screens kept: the three-column library screen (`#/p/<projectId>/templates`), the **Templates** menu in the View header, the New document dialog's template fields. Texts translated with plural rules; unused messages removed.

## Creating a Document from a template

9. Frontmatter: `title`, `timestamp`, `date`, `sources`, `resource` dropped; `timestamp` set to now; other fields kept.
10. The template's first `#` heading is replaced by `# <Name>`, or added when there is none.
11. `{{title}}` (the name typed) and `{{date}}` (today, `YYYY-MM-DD`) are replaced anywhere; other `{{…}}` stay literal.
12. Relative links and images are rewritten for the new Document's location.
13. The Document is an independent copy (R6).
