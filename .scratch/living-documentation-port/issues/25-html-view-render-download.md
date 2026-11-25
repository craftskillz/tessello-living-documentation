# 25: HTML view I: template, view and Download HTML

**What to build:** Generate as HTML (header of an ordinary Document, not the Folder manifest) opens the template dialog with the two built-in templates (Interview sheet, Article); choosing writes only `html_template`, in place, version-checked (refused on invalid frontmatter). The HTML view is a View state with ← Document, the page rendered in a shadow root with the template's CSS: title, lead, `##` sections, table of contents with anchors, directives and Tag markers. An unknown `html_template` stays in the file, with a translated message and Choose a template. Download HTML produces one standalone file, CSS inlined and images embedded. Annotations are not shown.

**Blocked by:** 03 (Reading: Mermaid, Kanban blocks and Tag marker pills)

**Status:** ready-for-human (built; awaiting the trial in the local Host)

- [x] Template dialog writes only `html_template`
- [x] HTML view inside the View with the template's structure
- [x] Unknown template message without rewriting the file
- [x] Download HTML is standalone
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

**Note from ticket 31:** render with the Project's `softBreaks` (`readSettings` in `src/lib/projectSettings.ts`); `renderDocument` requires it.

## Comments

- Built in three seams: `setField` and the `htmlTemplate`/`language` fields in `src/lib/document.ts`; the page renderer `src/lib/htmlPage.ts` with the library `src/lib/htmlTemplates.ts` (CSS of both original templates ported in `src/lib/htmlTemplates/`, scoped on `.ld-html-page` so it works in a shadow root and as a page); the View (`HtmlTemplateDialog.svelte`, `HtmlView.svelte`, Header actions). Journeys in `e2e/html-view.test.ts`. Unit 471/471, browser 183/183; `tessello validate` installable (the three known Mermaid warnings).
- Differs from the original: the template choice is version-checked (Q-080): on a conflict the dialog stays open with a message and the Document is re-read. Invalid frontmatter refuses with "Fix the frontmatter first" and opens the editor. Unknown value: Generate as HTML in the header, a note in the dialog, a translated message with Choose a template in the HTML view; the file keeps the value.
- The header shows **View as HTML** and a palette button **Change the HTML template** (the original's layout), not the template name of spec rule 3. The HTML view toolbar has ← Document, the title, Change the HTML template and Download HTML.
- Download HTML: a drawn Mermaid diagram is embedded as SVG; links to other Documents or files become their text (they cannot resolve outside the Module); `data-src` is dropped. An image that cannot be read shows its missing-image text.
- In the HTML view, a link to another Document leaves it for the target's reading view; ticket 26 makes it open the target's HTML view when it has a template, and adds in-place editing and the right-click section editor.
- Tag markers are left out of the title, the section anchors and the table of contents (the original does the same); they show in the page.
- Left over from the review: a template's id is spread over `HTML_TEMPLATES`, the header classes in `htmlPage.ts` and the names in the dialog (worth gathering on `HtmlTemplate` if a template is added); `chooseTemplate` lives in `View.svelte` and is tested through e2e only.
- Still to do: the trial in the local Host (check the Download HTML link in the Host's srcdoc frame).
