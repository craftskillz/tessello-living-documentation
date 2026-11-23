# 12: Projects and Project settings

**What to build:** I switch between Projects, connect more, remove one (files untouched), and reconnect unavailable ones. A folder overlapping an existing Project is refused (design to settle first: the Host checks containment only at request time with `mustContain`). A Project settings panel edits `.living-doc.json` (created lazily). Project settings › Connect repository grants the repository containing the Project folder (refused otherwise), for Versions.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Project switcher: switch, connect, remove, reconnect
- [ ] Overlap refused (decision recorded in an ADR)
- [ ] Project settings panel over `.living-doc.json`, created only when a setting is saved
- [ ] Connect repository refuses a folder that does not contain the Project folder
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
