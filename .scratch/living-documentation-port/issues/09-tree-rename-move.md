# 09: Tree: rename and move

**What to build:** I rename and move Documents and Folders from menus and by drag and drop (zones and timing as the original). Relative links in other Documents, and inside a moved Document, are rewritten; Folder manifests keep the entry's place under its new name or append it at its destination; a name collision is refused. Folder moves go file by file through the Host.

**Blocked by:** 08 (Tree: new Document and new Folder)

**Status:** ready-for-agent

- [ ] Rename and move of Documents and Folders, from menus and drag and drop
- [ ] Links elsewhere and inside moved Documents rewritten
- [ ] Manifests updated (renamed in place, appended at the destination)
- [ ] Collisions refused with a message
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
