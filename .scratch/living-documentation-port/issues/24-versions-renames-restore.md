# 24: Versions II: renames and restore

**What to build:** History follows renames: a commit where this path appears while another `.md` disappears with at least 50% similar content continues under the old path (the Module's own rule; isomorphic-git's follow matches identical content only). The **<** button writes that block into the file at once (version-checked), refreshes the comparison and offers Undo for the restores of this dialog session; on a conflict the comparison reloads and says so.

**Blocked by:** 23 (Versions I: commits and compare)

**Status:** ready-for-human (built in 07f7efd; awaiting the trial in the local Host)

- [x] Rename following at 50% similarity
- [x] Restore one block, version-checked, with Undo for the session
- [x] Conflict reloads the comparison with a message
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Similarity** is line based, like git's score: the lines of a longest common subsequence over the larger line count (`sharedLines` in `diff.ts`, shared with the comparison). Only `.md` files inside the Project folder that disappear in the same commit are candidates; the most similar at 50% or more wins.
- **First parent only:** a rename is looked for against a commit's first parent, so a rename brought in by a merge's other parent is not followed.
- **Uncommitted renames are not followed:** after a rename in the Module that is not committed yet, the new path has no commits and Versions shows "No commits" until it is committed.
- **Commit.path:** each commit carries the Document's path there; when it differs, the right column's header shows it ("Commit abc1234 · old.md"). Added beyond the spec.
- **Restore** writes at once (no pending text nor Save as in the original, which also did not check the version). The block is the original's hunk: a run of changed rows, its `<` on its first row. A line differing only in its ending counts as unchanged, as in the comparison.
- **Undo** writes back the text before the last restore, version-checked; it is offered while this dialog stays open. A conflict clears it, so it never overwrites an agent's edit.
- **Conflict:** the dialog and the reading view take the disk's text and say "The file changed on disk: the comparison was reloaded. Nothing was written."; the commit list is not reloaded (Refresh does it). A Document deleted meanwhile says so and disables `<`. Status lines "Block restored." / "Restore undone." are added beyond the spec.
- **Folds** are keyed by their first line in the commit, so a restore keeps open folds open (R12).
