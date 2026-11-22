# Documents: tag markers

Atlas page: `features/documents/tags.md` (business rules R1–R13). Atlas answers: Q-035 to Q-040. Rules of the original not changed here are kept (syntax R1, normalization R5, write position R6, removal counting R9).

1. **Marker** = an unclosed tag whose name is not a standard HTML element and is not closed anywhere in the Document. Shown as a small yellow pill with the tag name (cut at about 20 characters); the whole tag, free text included, on hover. No **b** glyph.
2. **Locating the click** uses the rendered block's source position and the offset inside the block, not a search for the clicked text. Insertion is allowed in table cells; refused in code, diagrams, compare blocks and Kanban boards. No "appears several times" refusal.
3. **Insert and Remove** write with the version check. On a conflict the Document is re-read and the action retried once at the same spot if its text is unchanged; otherwise "This passage changed on disk; try again". Other failures show a message.
4. **Suggestions**: the names in Project settings › **Tag names**, plus names already used as markers in the Project.
5. **Project settings › Tag names**: invalid names are shown with an error naming them; the settings cannot be saved until fixed. Same normalization as the original (brackets removed, lower case, duplicates removed, order kept).
6. Markers show in the reading view, the section preview and the HTML view. Export and printing are not in v1.
