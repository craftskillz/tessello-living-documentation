# 11: Search

**What to build:** A search box over the Tree finds Documents by displayed title at once and by full text after 0.35 s, ignoring accents and case, matching title, Tags, description, Type and body (never field names or raw frontmatter, excerpts without frontmatter); older answers are ignored; the count above the Tree counts the results with plural rules.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human (built in 43ad5ed; awaiting the trial in the local Host)

- [x] Title matches at once; full text after a short pause
- [x] Matches title, Tags, description, Type and body only
- [x] Accents and case ignored; stale answers dropped; translated count
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- Built in two seams: `src/lib/search.ts` (folding with an index map so excerpts stay right when accents change lengths; `matchDocument`, `titleResults`, `searchProject` over `project.read`, `filterTree`, and `createLiveSearch`, the 0.35 s pause and stale-answer rule on a manual clock) in `test/search.test.ts`; the View (search field at the top of the sidebar, the count above the Tree, the filtered Tree) in `e2e/search.test.ts`. Unit 497/497, browser 192/192; `tessello validate` installable (the three known Mermaid warnings).
- The count is always shown: the Documents the Tree shows (manifests and other files not counted), or the results while searching. French uses its plural rule, so 0 reads "0 document".
- While searching, every Folder leading to a result is open (the User's closed Folders are kept for afterwards) and rows cannot be dragged (as the original).
- Excerpts are shown under each result whose body matches (the original computed them but never showed them): 60 characters before, 90 after, body only, so never frontmatter. They show the raw Markdown (`# Notes The quick…`), as the original's text did.
- When the Tree reloads during a search (agent edits, Show hidden items, a rename…), the full text runs again at once, so results and count follow the Tree.
- The title search matches the displayed title, whatever the Tree shows (file names or titles, label filter).
- A Document gone since the Tree was read is skipped; any other failed read fails the whole full-text search: the title matches stay, with "The full-text search failed; only title matches are shown." That message is tested at unit level only (the Test Host cannot make one read fail).
- Still to do: the trial in the local Host.
