# Documents: the Tree

Atlas page: `features/documents.md` (business rules R1–R23). Atlas answers: Q-041 to Q-046. Rules of the original not changed here are kept.

## Changed from the original

1. **Names exactly as typed** for a new Document, a new Folder and a rename. **New document** asks for one Name: the file is `<Name>.md` and its body starts with `# <Name>` (frontmatter: `timestamp` only). Refused: empty; `/ \ : * ? " < > |`; a leading or trailing space or dot; `liv-doc-main.md`; a name differing only by case from a sibling. The dialog keeps the live preview of the resulting path.
2. **Folders show their real name**: no prefix dropping, no `_`/`-` to spaces, no capitals.
3. **New entries in a custom-ordered Folder** are appended to the end of its order, whatever the way they were created or moved in.
4. **Delete folder** confirms with counts by kind ("4 documents, 3 images, 1 other file") and warns how many Documents elsewhere link into the Folder; those links become plain text (R12). Deletion is permanent.
5. **Hidden entries** offer Show, Rename and Delete without being shown first.
6. **The count** above the Tree counts what the Tree shows, or the search results; it and the badge tooltips are translated with plural rules.
7. **Reserved files:** only the Folder manifest `liv-doc-main.md` is special: hidden, read-only in the Module, changed only through Tree actions. `index.md` and `log.md` are ordinary Documents.
8. **`images/` and `files/`** at the Project root stay reserved (R8, R21): pasted Images go to `images/`, attachments to `files/`; both are created only when first needed and cannot be renamed, moved or deleted.
9. **Other files** (shown only with **Show hidden items**): images and videos are previewed, text up to 1 MB, anything else is offered as **Download**.
10. **Dropped:** Extra Files (replaced by Projects), linked files, status highlighting, the Export button (not in v1), opening a file with the computer's application.
11. **View preferences** (sidebar width, Show hidden items, Show attachments) are kept in the Module's storage for all Projects; the Folders open in the Tree are remembered per Project.
12. **Failures** show a translated message (cross-cutting rule), including refused Hide/Show, failed full-text search and New folder errors.

## Kept from the original

- Default order (R3): custom order, then Folders, then Documents, alphabetical ignoring case; other files last.
- Order and hidden list in each Folder's manifest; Tree changes in a Folder whose manifest is invalid are refused (R4).
- Drag and drop zones and timing (R10, R11).
- Links follow renames and moves, including the relative links inside a moved Document (R12), for changes made by the Module.
- Search: title matches at once, full text after 0.35 s, ignoring accents and case, older answers ignored (R14); what is searched: [frontmatter](frontmatter.md) rule 9.
- Attachment badges (R17, R18). Annotation badges: annotations round.
