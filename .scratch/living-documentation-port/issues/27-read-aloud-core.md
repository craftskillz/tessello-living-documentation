# 27: Read aloud I: Listen

**What to build:** Listen (reading view of ordinary Documents, not while editing, not on Kanban boards or the Folder manifest; hidden when the browser has no voices) reads with the browser's voices (ADR 0009): Pause/Resume, Next section (disabled on the last), Stop; the spoken sentence highlighted and centred. The language comes from `language`, `lang`, `locale` or `langue` (aliases kept; any code); when missing, the Reading language dialog offers languages with a voice (interface language first) and writes `language: <code>` in place, version-checked, every failure shown with Retry; a language without a voice is reported and never overwritten. Sentences split with `Intl.Segmenter` and at line breaks; overlong sentences spoken in pieces; a collapsible block's summary read then its content; code, tables, images and diagrams announced in the Document's language when available. Opening another Document, editing or leaving stops the reading.

**Blocked by:** 01 (Reading: links, images and the document stylesheet)

**Status:** ready-for-agent

- [ ] Controls and highlight
- [ ] Language rules and the dialog writing `language` in place
- [ ] Segmenting, long sentences and announcements (reading script tested pure)
- [ ] Reader tested with a fake speaker and manual clock
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
