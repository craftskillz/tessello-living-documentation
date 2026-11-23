# 06: Editing, complete

**What to build:** Editing works as decided: autosave about 1 s after typing stops and at once when opening another Document or Project, no overlapping saves (text typed during a save is saved next); Revert restores the file as it was at Edit (confirmation if changed) and closes; Done closes after the last save; the conflict banner's Compare is a side-by-side diff and Take theirs copies my text to the clipboard first, autosave paused until I choose. The section editor (heading to the next heading of the same level) uses the source ranges, with the same rules.

**Blocked by:** 01 (Reading: links, images and the document stylesheet)

**Status:** ready-for-human (built; awaiting the trial in the local Host)

- [x] Autosave on pause and on switching Document or Project; no overlapping saves
- [x] Revert and Done behave as specified
- [x] Compare shows a side-by-side diff; Take theirs copies my text first; Keep mine overwrites
- [x] The section editor edits one section through its source range, with the same autosave and conflict rules
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- Pure modules added: `edits` (applyEdits), `sections` (sectionAt, replaceSection, rule R5), `diff` (sideBySide, Myers), `autosave` (no overlap, queue, pause/stop/reset, injected timer). The View drives both editors through them.
- The section editor opens from a right-click on any block (**Edit section**, next to Copy image / Copy table; Shift + right-click keeps the browser's menu). It is a modal dialog with CodeMirror and a live preview, as in the original; synchronized scrolling of the original is not ported. Images in the preview are read from the Project like the reading (fixed after the first trial in the Host).
- Escape and Ctrl/Cmd + Enter mean **Done** in the section dialog (never discard: Revert is the only way back).
- **Take theirs** in the section editor copies my section, then closes the editor on the disk's version (my section's range no longer applies to their text). In the full-document editor it loads their text in the editor.
- **Keep mine** writes the whole file as I edit it (my section in the text I started from) over theirs. **Revert** during a conflict also overwrites the disk's change.
- Leaving the Document (Tree, link, Widget) while a conflict is pending shows "choose Keep mine or Take theirs before leaving it" and stays. There is no Project switcher in the View yet, so "save on switching Project" waits for ticket 12.
- A Document deleted on disk while edited shows the banner without Keep mine / Take theirs (as before); Revert is the only way out. Restoring a deleted file needs a create-only write: left over.
- After a save the View keeps the text it wrote (the write is exact, nothing normalized) instead of reading it back.
- To try in the local Host: the right-click menu and the clipboard copy of Take theirs in the srcdoc frame.
