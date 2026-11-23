# 13: Tag markers: insert and remove

**What to build:** In the reading view I insert a Tag marker at the clicked spot (located by the block's source range and offset; allowed in table cells; refused in code, diagrams, compare blocks and Kanban boards) and remove one; writes are version-checked and retried once at the same spot when its text is unchanged, else "This passage changed on disk; try again". Suggestions come from Project settings › Tag names and markers already used; invalid Tag names are named in an error and block saving the settings (brackets removed, lower case, duplicates removed, order kept).

**Blocked by:** 03 (Reading: Mermaid, Kanban blocks and Tag marker pills), 12 (Projects and Project settings)

**Status:** ready-for-agent

- [ ] Insert and Remove at the clicked spot through source ranges
- [ ] Refused where the spec refuses
- [ ] Conflict retried once, else the message
- [ ] Suggestions and the Tag names setting with its validation
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
