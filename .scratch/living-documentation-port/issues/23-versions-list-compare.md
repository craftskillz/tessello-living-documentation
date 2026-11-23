# 23: Versions I: commits and compare

**What to build:** With a Repository grant, Versions (in the header of an ordinary Document and a Kanban board, not while editing) lists the commits of the current branch that changed the Document in a period (1–3650 days, default 30), newest first (short id, message, date in the locale, author), and compares the file on disk (left) with a chosen commit (right; default the latest that changed it, or the one before when identical), with a Myers diff and folding. History is read with isomorphic-git through a read-only reader that lists `.git` once per session and caches every read (prototype: 0.2 s for 30 days on 1379 commits). Without the grant, Project settings offers "Connect repository to see versions". No automatic commits (ADR 0008).

**Blocked by:** 12 (Projects and Project settings)

**Status:** ready-for-agent

- [ ] Commit list for a period on HEAD
- [ ] Compare file on disk with a commit; default choice as specified
- [ ] Fast on a real repository (listing once, cached reads)
- [ ] Tested on a real `.git` fixture made at test time
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder) on a real repository; differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
