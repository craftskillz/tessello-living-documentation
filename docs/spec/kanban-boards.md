# Kanban boards

Atlas page: `features/kanban-boards.md` (business rules R1–R15). Atlas answers: Q-048 to Q-053. Rules of the original not changed here are kept (1–6 columns, six colors, card descriptions, moving a card moves its file, missing column folders created on opening).

1. **Detection**: a Document is a board only when the Kanban block is real Markdown, outside code blocks and inline code. Header and board use the same rule.
2. **Board text**: the Document's own text renders above the board as an introduction.
3. **Header**: **Favorite**, **Edit** (full-document editor), **⚙ Edit columns**, **Copy path**, **Delete**. No Listen, Marker, Lines or table of contents. Versions: Git round.
4. **Column folders** keep the original's mapping (R3: accents removed, other characters → `_`). **Edit columns** refuses two names mapping to the same folder.
5. **Renaming a column** renames its folder; links and favorites follow. **Removing a column** whose folder holds cards asks: move its cards to another column, or keep the folder (cards leave the board).
6. **Deleting the board** keeps column folders and cards; the confirmation says so.
7. **Card order**: the column folder's Folder manifest order, then alphabetical. Dragging within a column reorders; new or moved-in cards go to the end.
8. **New card**: name as typed (Tree rule), file `<Name>.md`, starting with `# <Name>`; translated skeleton text, or an optional **Template** from the Project's library.
9. A name collision blocks a move with a message. Failures show messages; the board refreshes through the 5-second change check; the error banner can be closed.
