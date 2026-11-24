# 26: HTML view II: editing in place and links

**What to build:** In the HTML view, a double-click edits paragraphs and headings 2–4 as text, and code, lists, quotes and tables as Markdown, in place; saves are version-checked and keep the scroll position. A right-click opens the section editor on that section (the lead alone for the lead). A link opens the target's HTML view when it has a known template, else its reading view, within the View, Back returning.

**Blocked by:** 06 (Editing, complete), 25 (HTML view I: template, view and Download HTML)

**Status:** ready-for-agent

- [ ] In-place editing per element kind, version-checked, scroll kept
- [ ] Right-click to the section editor, lead alone for the lead
- [ ] Links between HTML views and reading views
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

**Note from ticket 31:** when the HTML view's edits are written back, a `<br>` becomes a bare newline if the Project's `softBreaks` is on and a hard break (two spaces, newline) if off, as the original's `blockMarkdown.ts` does.
