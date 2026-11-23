# 15: Snippets II: Mermaid Builder, layout columns and attachments

**What to build:** The Mermaid Builder kinds (pie, timeline, tree view, sequence), layout columns (2–4 in the form) and file attachments complete the 25 kinds, and reopen in their forms (builder rows parsed back, else a plain code block; column options editable, content untouched; attachment links as text and target). Pie weights are numbers ≥ 0 with no total cap; tree names drawn as typed.

**Blocked by:** 14 (Snippets I: picker, forms and block actions)

**Status:** ready-for-agent

- [ ] The remaining kinds insert correct Markdown
- [ ] They reopen in their forms
- [ ] Pie and tree rules as specified
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
