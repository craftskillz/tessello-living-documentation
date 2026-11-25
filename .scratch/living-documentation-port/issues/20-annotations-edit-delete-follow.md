# 20: Annotations II: edit, delete, conflicts and cascades

**What to build:** I edit a note (creation date kept, `updated` added) and delete one (confirmation). Writes to `.annotations.json` re-read and re-apply only their own change on a version conflict, retrying a few times before a message. Renames, moves and deletes in the Module update or remove annotations; annotations of a Document moved outside the Module stay unused and reappear if it comes back.

**Blocked by:** 09 (Tree: rename and move), 19 (Annotations I: create and show)

**Status:** done (495ee22)

- [x] Edit and Delete from the reading popup
- [x] Concurrent writes do not lose others' annotations
- [x] Cascades on rename, move and delete
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [x] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- Built in two seams. **Library**: `editAnnotation` and `removeAnnotation` in `src/lib/annotations.ts`; all three writes share one read–change–write loop (re-read and re-apply only their own change on a Conflict, 3 attempts, then the Conflict). Cascades in `src/lib/project.ts` (`relocate` for rename and move, `remove`) through the pure `src/lib/annotationKeys.ts`. **View**: Edit and Delete in the reading popup (`src/view/Annotations.svelte`), 7 new journeys in `e2e/annotations.test.ts`. Unit 583/583, browser 221/221; `tessello validate` installable (the three known Mermaid warnings).
- A remapped key keeps its place in the file. When the new key already holds annotations (left by a Document an agent moved away), the two lists are joined, the existing ones first; the original overwrote them.
- Deleting a Folder `f` drops only the keys under `f/`: a Document `f.md` beside it keeps its annotations (the original dropped them too).
- A Document's key goes when its last annotation is deleted (as the original's DELETE).
- The cascades go through `project.ts`'s `update`, which retries once on a conflict. A malformed `.annotations.json` is left untouched and the rename, move or delete still succeeds (as the original).
- Failures: a translated message each, specific for an annotation deleted meanwhile (the list is read again), a malformed file, and a file that kept changing through the retries.
- Differences from the original: notes can be edited (it had no edit); the popup's date line adds " · edited <date>"; Cancel in the confirmation closes the popup instead of going back to the reading popup; Escape cancels the form and the confirmation, Cmd/Ctrl+Enter saves the edit.
- Tried in the local Host by the User on 2026-11-25: validated.
