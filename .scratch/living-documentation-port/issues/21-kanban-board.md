# 21: Kanban I: the board

**What to build:** A Document whose Kanban block is real Markdown shows its own text then the board. Columns map to folders (the original's mapping: accents removed, other characters `_`), created when missing on opening; cards are the Documents in each column folder in its manifest order, then alphabetical. I drag cards within a column (reordering the manifest) and between columns (moving the file, links and favorites following, appended at the end); a name collision blocks the move with a message. Header: Favorite, Edit, Edit columns (next ticket), Copy path, Delete.

**Blocked by:** 03 (Reading: Mermaid, Kanban blocks and Tag marker pills), 09 (Tree: rename and move)

**Status:** ready-for-agent

- [ ] Board under the Document's text; detection rule shared with the header
- [ ] Column folders and card order
- [ ] Drag within and between columns with the file moved and order kept
- [ ] Collision message; refresh through the change check
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
