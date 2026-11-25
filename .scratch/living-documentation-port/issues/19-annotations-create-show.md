# 19: Annotations I: create and show

**What to build:** In the reading view of an ordinary Document I select a passage and add a note, stored in the Project's `.annotations.json` (compatible with the original, no author). Annotations are placed only where passage and surroundings match; else, when the passage occurs once, placed and marked "surrounding text changed" (orange); else orphans (red), never attached to a guess. The Marker cycles Normal → Active → Hidden (Normal and Hidden remembered). Column buttons show the note on hover and scroll on click. Not in the section preview, the Folder manifest, Kanban boards or the HTML view. A blank note keeps Save disabled.

**Blocked by:** 01 (Reading: links, images and the document stylesheet)

**Status:** ready-for-human (built in fb5bafd; awaiting the trial in the local Host)

- [x] Create an annotation; the file stays compatible with the original
- [x] Placement rules with orange and red states
- [x] Marker states remembered as specified
- [x] Column buttons: hover shows, click scrolls
- [x] Absent where the spec says
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- Built in two seams. **Library** (`src/lib/annotations.ts`, `test/annotations.test.ts`, 27 tests): `placeAnnotations(text, list)` (pure), `readAnnotations`, `addAnnotation` (re-reads and re-applies its append on a version conflict, 3 attempts), `annotationKey` (path without `.md`, as the original), the `MarkerState` type; `markerHidden` in the display preferences (`src/lib/projects.ts`). **View** (`src/view/Annotations.svelte`, `src/view/highlights.ts`, the Marker in `Header.svelte`, `e2e/annotations.test.ts`, 14 journeys). Unit 553/553, browser 214/214 (one unrelated flaky failure on a first full run, green on the rerun); `tessello validate` installable (the three known Mermaid warnings).
- Placement works on the reading view's text, leaving out diagrams (`svg`, `[data-mermaid]`), scripts, styles and the View's buttons; the selection's passage and its 30 characters of surrounding text are taken from that same text. With surrounding text, the first match wins (as the original); without any, the passage must occur once.
- Differences from the original: the date follows the interface language (medium style); failures show a message; a malformed `.annotations.json` refuses the save with a message and leaves the file untouched (the original read it as empty and overwrote it); the surrounding text is stored trimmed (matching ignores spacing, so the original's files still place). The Marker's Normal and Hidden states are remembered (spec rule 5).
- Column buttons: hover shows the popup; a click scrolls only (keyboard focus also shows the popup); an orphan's click shows its popup next to the button. Their accessible name is the note cut at 60 characters, its warning first; no native `title`, so it does not cover the popup.
- Additions: Escape cancels the creation popup, Cmd/Ctrl+Enter saves it; the annotations are read again when the open Document or `.annotations.json` changes on disk.
- Not in this ticket: Edit and Delete (ticket 20); the original's sidebar annotation counts are not in `docs/spec/annotations.md`, so not built. Kanban boards do not exist yet (ticket 21): it must not mount the annotations there.
- Still to do: the trial in the local Host, on an old Living Documentation folder with a `.annotations.json`.
