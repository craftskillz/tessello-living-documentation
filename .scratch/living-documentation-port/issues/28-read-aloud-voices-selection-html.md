# 28: Read aloud II: voices, selection and the HTML view

**What to build:** A ⚙ next to Listen chooses a voice per language and a speed (0.75×–2×), kept in the Module's storage (defaults: the browser's default voice, 1×). Listen starts from the word where my selection begins (announced block if inside one; next readable text if on unread text; start otherwise), the start point captured at the click and kept across the language dialog. Listen in the HTML view reads the main content only, highlighting inside the generated page; regenerating the page stops the reading.

**Blocked by:** 25 (HTML view I: template, view and Download HTML), 27 (Read aloud I: Listen)

**Status:** ready-for-agent

- [ ] Voice and speed per language remembered
- [ ] Start from the selection as specified
- [ ] Listen in the HTML view, main content only
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
