# 11: Search

**What to build:** A search box over the Tree finds Documents by displayed title at once and by full text after 0.35 s, ignoring accents and case, matching title, Tags, description, Type and body (never field names or raw frontmatter, excerpts without frontmatter); older answers are ignored; the count above the Tree counts the results with plural rules.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Title matches at once; full text after a short pause
- [ ] Matches title, Tags, description, Type and body only
- [ ] Accents and case ignored; stale answers dropped; translated count
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
