# 22: Kanban II: columns, new cards, deleting a board

**What to build:** Edit columns (1–6, six colors) refuses two names mapping to the same folder; renaming a column renames its folder (links and favorites follow); removing a column whose folder holds cards asks to move them to another column or keep the folder. New card: name as typed, `<Name>.md` starting with `# <Name>`, a translated skeleton or a template. Deleting the board keeps its column folders and cards, and the confirmation says so.

**Blocked by:** 18 (New Document from a template), 21 (Kanban I: the board)

**Status:** ready-for-agent

- [ ] Edit columns with the collision refusal
- [ ] Rename and remove column behaviors
- [ ] New card from a skeleton or a template
- [ ] Delete board keeps folders and cards
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
