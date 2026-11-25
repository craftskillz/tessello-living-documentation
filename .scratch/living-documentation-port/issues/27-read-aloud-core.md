# 27: Read aloud I: Listen

**What to build:** Listen (reading view of ordinary Documents, not while editing, not on Kanban boards or the Folder manifest; hidden when the browser has no voices) reads with the browser's voices (ADR 0009): Pause/Resume, Next section (disabled on the last), Stop; the spoken sentence highlighted and centred. The language comes from `language`, `lang`, `locale` or `langue` (aliases kept; any code); when missing, the Reading language dialog offers languages with a voice (interface language first) and writes `language: <code>` in place, version-checked, every failure shown with Retry; a language without a voice is reported and never overwritten. Sentences split with `Intl.Segmenter` and at line breaks; overlong sentences spoken in pieces; a collapsible block's summary read then its content; code, tables, images and diagrams announced in the Document's language when available. Opening another Document, editing or leaving stops the reading.

**Blocked by:** 01 (Reading: links, images and the document stylesheet)

**Status:** ready-for-human (built; awaiting the trial in the local Host)

- [x] Controls and highlight
- [x] Language rules and the dialog writing `language` in place
- [x] Segmenting, long sentences and announcements (reading script tested pure)
- [x] Reader tested with a fake speaker and manual clock
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Seams.** `src/lib/readingScript.ts` (pure: script, sentences, pieces, language and voice rules) and `src/lib/reader.ts` (Reader over a Speaker); the browser Speaker is `src/view/speech.ts`, the controls and the Reading language dialog `src/view/ReadAloud.svelte`. Unit: 22 + 19 tests; browser: `e2e/read-aloud.test.ts` (10 journeys, `speechSynthesis` faked).
- **No clock.** Nothing in the Reader is timed, so it is tested with a fake Speaker only.
- **Pause is a cancel.** Browser pause/resume is unreliable with some Chrome voices: Pause cancels the utterance and Resume speaks the current piece again from its start (the original resumed mid-sentence).
- **No DOM library in the unit tests** (installing one was refused): the script walks a minimal node interface that the DOM satisfies, and the tests feed it the Module's own rendered hast.
- **Pieces** of an overlong sentence are at most 200 characters, cut at the last `,` `;` `:` before the limit, else a space.
- **Collapsible blocks** (`<details>`: summary, then content) are handled by the script, but the rendering drops raw HTML today, so none reach it.
- **Also read:** the footnotes' "Footnotes" heading (Next section stops there); the displayed title when the body has no `#` heading. Kanban block column titles in an ordinary Document are not read.
- **Any re-render stops the reading** (an agent edit reloading the Document too), so the highlight never points at stale text.
- **Dialog languages** are the primary codes of the installed voices (`en`, `fr`, `de`…), named in the interface language; the choice writes `language: <code>` with `setField`.
- **Left for ticket 28:** start from the selection (the start point captured at the click), voice and speed, the HTML view.
