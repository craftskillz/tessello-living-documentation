# 14: Snippets I: picker, forms and block actions

**What to build:** The snippet picker (search, forms, table grid editor) inserts snippets; rendered blocks offer Edit, Delete and Insert-after through their source ranges, checking the source is unchanged before writing. A failed save keeps the dialog with its content and a Retry; on a conflict the Document is re-read and the block found again by content, else "This block changed on disk" with Copy Markdown. Covers the simpler kinds of the 25 (all but the Mermaid Builder kinds, layout columns and attachments).

**Blocked by:** 06 (Editing, complete)

**Status:** ready-for-agent

- [ ] Picker, search, forms and the table grid editor; Escape closes
- [ ] Edit, Delete and Insert-after through source ranges, with the unchanged-source check
- [ ] Retry and Copy Markdown on failure
- [ ] `|` escaped in table cells; defaults and tooltips translated
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
