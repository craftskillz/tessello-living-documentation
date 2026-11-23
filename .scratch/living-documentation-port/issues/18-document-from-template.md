# 18: New Document from a template

**What to build:** The New document dialog can start from a template: frontmatter drops `title`, `timestamp`, `date`, `sources`, `resource`, sets `timestamp` to now and keeps the rest; the first `#` heading becomes `# <Name>` (added when none); `{{title}}` and `{{date}}` (`YYYY-MM-DD`) are replaced anywhere, other `{{…}}` stay; relative links and images are rewritten for the new location; the Document is an independent copy.

**Blocked by:** 08 (Tree: new Document and new Folder), 17 (Template library)

**Status:** ready-for-agent

- [ ] Frontmatter, heading and placeholders as specified
- [ ] Links and images rewritten for the new location
- [ ] Appended to the Folder's custom order like any new Document
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
