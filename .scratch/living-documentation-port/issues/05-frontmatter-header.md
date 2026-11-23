# 05: Frontmatter in the header

**What to build:** The header shows the displayed title, `description` as a subtitle, Tag pills, the creation date (`timestamp`) and the modified date (file time) in the Host locale and the reader's time zone, and the Type pill (Add type when none, suggestions from Types used in the Project, clearing removes the field; written in place, version-checked). Invalid YAML shows a non-blocking warning with its line; field writes are refused with "Fix the frontmatter first", opening the editor (ADR 0004).

**Blocked by:** 01 (Reading: links, images and the document stylesheet)

**Status:** ready-for-agent

- [ ] Header shows title, description, Tag pills, both dates
- [ ] Setting, changing and clearing the Type writes only that field, in place, every other byte kept
- [ ] Invalid YAML: warning with its line; Type changes refused with "Fix the frontmatter first"
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
