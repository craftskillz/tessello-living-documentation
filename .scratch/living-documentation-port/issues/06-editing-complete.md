# 06: Editing, complete

**What to build:** Editing works as decided: autosave about 1 s after typing stops and at once when opening another Document or Project, no overlapping saves (text typed during a save is saved next); Revert restores the file as it was at Edit (confirmation if changed) and closes; Done closes after the last save; the conflict banner's Compare is a side-by-side diff and Take theirs copies my text to the clipboard first, autosave paused until I choose. The section editor (heading to the next heading of the same level) uses the source ranges, with the same rules.

**Blocked by:** 01 (Reading: links, images and the document stylesheet)

**Status:** ready-for-agent

- [ ] Autosave on pause and on switching Document or Project; no overlapping saves
- [ ] Revert and Done behave as specified
- [ ] Compare shows a side-by-side diff; Take theirs copies my text first; Keep mine overwrites
- [ ] The section editor edits one section through its source range, with the same autosave and conflict rules
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
