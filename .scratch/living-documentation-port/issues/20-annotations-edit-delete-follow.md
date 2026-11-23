# 20: Annotations II: edit, delete, conflicts and cascades

**What to build:** I edit a note (creation date kept, `updated` added) and delete one (confirmation). Writes to `.annotations.json` re-read and re-apply only their own change on a version conflict, retrying a few times before a message. Renames, moves and deletes in the Module update or remove annotations; annotations of a Document moved outside the Module stay unused and reappear if it comes back.

**Blocked by:** 09 (Tree: rename and move), 19 (Annotations I: create and show)

**Status:** ready-for-agent

- [ ] Edit and Delete from the reading popup
- [ ] Concurrent writes do not lose others' annotations
- [ ] Cascades on rename, move and delete
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
