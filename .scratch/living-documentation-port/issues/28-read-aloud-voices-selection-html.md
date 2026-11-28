# 28: Read aloud II: voices, selection and the HTML view

**What to build:** A ⚙ next to Listen chooses a voice per language and a speed (0.75×–2×), kept in the Module's storage (defaults: the browser's default voice, 1×). Listen starts from the word where my selection begins (announced block if inside one; next readable text if on unread text; start otherwise), the start point captured at the click and kept across the language dialog. Listen in the HTML view reads the main content only, highlighting inside the generated page; regenerating the page stops the reading.

**Blocked by:** 25 (HTML view I: template, view and Download HTML), 27 (Read aloud I: Listen)

**Status:** done (ee0a739)

- [x] Voice and speed per language remembered
- [x] Start from the selection as specified
- [x] Listen in the HTML view, main content only
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [x] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Seams.** `projects`: `readingPreferences()`, `setReadingVoice(language, name | null)`, `setReadingRate(rate)` under the storage key `reading` (voices keyed by primary subtag; speed clamped 0.75–2, two decimals). `readingScript`: `readingStart(root, script, point)` (R9) and `chooseVoice`. View: the ⚙ panel and the selection capture in `ReadAloud.svelte`, Listen in `HtmlView.svelte`'s bar.
- **Voice per language** is per primary code (`en`, `fr`): one choice covers `en-US` and `en-GB` Documents. The ⚙ panel has a language select (the Document's language first) and a voice select whose first option is "Browser default".
- **Speed** applies from the next sentence; dragging shows the value live, releasing keeps it.
- **Start point** kept as child indexes from the read root plus an offset, so it survives the re-render after the Reading language dialog writes `language:`; when it no longer resolves, the reading starts at the beginning.
- **Selection rules (R9):** the reading starts at the start of the word (an apostrophe ends a word: "l'arbre" → "arbre"); the highlight covers only the part spoken. On unread text, the next readable thing, an announced block included. A point after the last readable text starts at the beginning, as the original's "otherwise".
- **HTML view:** reads `main` only; the highlight styles are injected into the page's shadow root; every redraw of the page (in-place edit, template change, agent edit) stops the reading, as does Back.
- **Not done:** the screenshot comparison with the cog panel (docs/ui.md).
- Tried in the local Host by the User (2026-11-28): approved as is.
