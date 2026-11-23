# 03: Reading: Mermaid, Kanban blocks and Tag marker pills

**What to build:** Mermaid diagrams render; a Kanban block (outside code) renders read-only as a board preview (the board itself is a later ticket); Tag markers (unclosed tags that are not HTML elements and not closed in the Document) show as yellow pills with their name, the whole tag on hover. Other raw HTML stays out.

**Blocked by:** 02 (Reading: the original's formats)

**Status:** ready-for-agent

- [ ] Mermaid code blocks render as diagrams; a broken diagram shows its error, not a blank
- [ ] A Kanban block renders read-only; one inside code does not
- [ ] Tag markers render as pills (name cut at about 20 characters, whole tag on hover); HTML element names are not markers
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
