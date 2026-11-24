# 25: HTML view I: template, view and Download HTML

**What to build:** Generate as HTML (header of an ordinary Document, not the Folder manifest) opens the template dialog with the two built-in templates (Interview sheet, Article); choosing writes only `html_template`, in place, version-checked (refused on invalid frontmatter). The HTML view is a View state with ← Document, the page rendered in a shadow root with the template's CSS: title, lead, `##` sections, table of contents with anchors, directives and Tag markers. An unknown `html_template` stays in the file, with a translated message and Choose a template. Download HTML produces one standalone file, CSS inlined and images embedded. Annotations are not shown.

**Blocked by:** 03 (Reading: Mermaid, Kanban blocks and Tag marker pills)

**Status:** ready-for-agent

- [ ] Template dialog writes only `html_template`
- [ ] HTML view inside the View with the template's structure
- [ ] Unknown template message without rewriting the file
- [ ] Download HTML is standalone
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

**Note from ticket 31:** render with the Project's `softBreaks` (`readSettings` in `src/lib/projectSettings.ts`); `renderDocument` requires it.
