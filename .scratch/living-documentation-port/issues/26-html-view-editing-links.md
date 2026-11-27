# 26: HTML view II: editing in place and links

**What to build:** In the HTML view, a double-click edits paragraphs and headings 2–4 as text, and code, lists, quotes and tables as Markdown, in place; saves are version-checked and keep the scroll position. A right-click opens the section editor on that section (the lead alone for the lead). A link opens the target's HTML view when it has a known template, else its reading view, within the View, Back returning.

**Blocked by:** 06 (Editing, complete), 25 (HTML view I: template, view and Download HTML)

**Status:** done (fe8f17e)

- [x] In-place editing per element kind, version-checked, scroll kept
- [x] Right-click to the section editor, lead alone for the lead
- [x] Links between HTML views and reading views
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [x] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

**Note from ticket 31:** when the HTML view's edits are written back, a `<br>` becomes a bare newline if the Project's `softBreaks` is on and a hard break (two spaces, newline) if off, as the original's `blockMarkdown.ts` does.

## Comments

- Built in three seams. Pure: `src/lib/htmlEdits.ts` (`blockToMarkdown` reads an edited paragraph or h2-h4 back as Markdown, `<br>` as a bare newline with soft breaks and a hard break without; `blockLines`, `blockEdit`), `htmlSectionAt` in `src/lib/sections.ts`, and a `sourceTargets` render option: in the HTML view, links and images carry their written target in `data-md` (Download HTML drops it). View: `src/view/htmlEditing.ts` (in-place and Markdown-field edits, ported from the original's `inlineEdit.ts`), `HtmlView.svelte` (double-click, right-click, status line), `View.svelte` (`saveHtmlEdit`, version-checked; trail entries remember the HTML view). Unit 1062/1062, browser 370/370 (Versions flaky once under load, green alone); `tessello validate` installable (the three known Mermaid warnings).
- As in the original: a block whose Markdown does not read back the same (an escape, an entity, an autolink written `<https://…>`) opens the section editor instead; an edit that cannot be written back stays open with "This edit cannot be saved in place…"; a conflict leaves the edit open with its text and the conflict message; the hint shows in the HTML view's bar.
- Differs from the original: a link opens the target's HTML view when it has a known template, else its reading view, with a Back trail shown in the HTML view too (rule 10); a link to a heading of the open Document scrolls in the HTML view. A right-click in the lead opens the lead alone (rule 9; on the title, the browser menu). While an edit or the section editor is open, the page is not redrawn (an agent edit shows once it closes). Moving focus to a link inside the block being edited does not end the edit. A save failure other than a conflict shows as a toast, not in the bar. Emptying a block also removes the blank lines around it.
- No R13 gate: in this port only the Folder manifest is read-only, and it has no HTML view.
- Left over from the review (judgement calls, not changed): `HtmlView.svelte` now holds the editing orchestration (could move to `htmlEditing.ts`); the h2-h4 set is in both `htmlEdits.ts` and `htmlEditing.ts`; the render option types repeat in `render.ts`.
- Tried in the local Host by the User: done.
