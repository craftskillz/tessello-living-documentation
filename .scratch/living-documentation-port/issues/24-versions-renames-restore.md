# 24: Versions II: renames and restore

**What to build:** History follows renames: a commit where this path appears while another `.md` disappears with at least 50% similar content continues under the old path (the Module's own rule; isomorphic-git's follow matches identical content only). The **<** button writes that block into the file at once (version-checked), refreshes the comparison and offers Undo for the restores of this dialog session; on a conflict the comparison reloads and says so.

**Blocked by:** 23 (Versions I: commits and compare)

**Status:** ready-for-agent

- [ ] Rename following at 50% similarity
- [ ] Restore one block, version-checked, with Undo for the session
- [ ] Conflict reloads the comparison with a message
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
