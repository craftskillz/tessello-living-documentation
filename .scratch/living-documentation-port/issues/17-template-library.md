# 17: Template library

**What to build:** Each Project has a template library as Markdown files in `.templates/<folder>/<name>.md`, hidden from the Tree (ADR 0006); a Project holding `.document-templates.json` is offered Convert to files once (the JSON left untouched). The library screen (a View state) and the header Templates menu create, rename, duplicate (`<name> copy`, `<name> copy 2`), move and delete templates and folders (naming rule of the Tree), search by name and content ignoring case and accents, edit like Documents (autosave once named, Revert, conflict banner) and preview resolving images and links from the template's location.

**Blocked by:** 06 (Editing, complete)

**Status:** ready-for-agent

- [ ] Templates as files under `.templates/`; Convert to files once
- [ ] Library screen and Templates menu with all actions
- [ ] Editing like Documents; preview resolves images and links
- [ ] Search by name and content
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
