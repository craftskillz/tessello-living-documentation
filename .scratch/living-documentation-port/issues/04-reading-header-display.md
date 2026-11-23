# 04: Reading header and display preferences

**What to build:** The reading header offers Copy path, Lines, White background, the table of contents, Edit and Delete placeholders as they exist; Lines, table of contents state and width, and White background are remembered in the Module's storage. Images enlarge with Shift/Cmd + click; Copy image and Copy table work. The Folder manifest opens read-only (frontmatter as a YAML block, Lines, table of contents, Copy path; no Edit, Delete or Favorite).

**Blocked by:** 01 (Reading: links, images and the document stylesheet)

**Status:** ready-for-agent

- [ ] Copy path copies the Document's path in the Project
- [ ] Lines, White background and the table of contents work and are remembered
- [ ] Image enlargement, Copy image and Copy table work
- [ ] The Folder manifest opens read-only with only its allowed actions
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
