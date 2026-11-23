# 07: Pasted or dropped Images and files

**What to build:** In the editor, a pasted or dropped image asks for a name (a timestamp proposed, refused characters as in the Tree, `<name>-2` proposed when taken), is saved in `images/` without ever overwriting, and its link is inserted at the paste or drop point; other dropped files go to `files/`. Both folders are created only when first needed.

**Blocked by:** 06 (Editing, complete)

**Status:** ready-for-agent

- [ ] Pasted and dropped images saved in `images/` under the confirmed name; never overwrite (create-only write)
- [ ] Other files saved in `files/`
- [ ] The relative link is inserted at the point of paste or drop
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
