# 23: Versions I: commits and compare

**What to build:** With a Repository grant, Versions (in the header of an ordinary Document and a Kanban board, not while editing) lists the commits of the current branch that changed the Document in a period (1–3650 days, default 30), newest first (short id, message, date in the locale, author), and compares the file on disk (left) with a chosen commit (right; default the latest that changed it, or the one before when identical), with a Myers diff and folding. History is read with isomorphic-git through a read-only reader that lists `.git` once per session and caches every read (prototype: 0.2 s for 30 days on 1379 commits). Without the grant, Project settings offers "Connect repository to see versions". No automatic commits (ADR 0008).

**Blocked by:** 12 (Projects and Project settings)

**Status:** ready-for-human (built; awaiting the trial in the local Host)

- [x] Commit list for a period on HEAD
- [x] Compare file on disk with a commit; default choice as specified
- [x] Fast on a real repository (listing once, cached reads)
- [x] Tested on a real `.git` fixture made at test time
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder) on a real repository; differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Where the Project lies in the repository:** the Host gives no paths, so `history` finds it in the git index: the folder named like the Project folder; when several, the one whose files and versions match the Project's. A Project not yet committed shows "No commits", not a failure.
- **Commits that changed the Document:** read with `git.log({ since })` then kept when the file's blob differs from every parent's (git's default simplification), not `log({ filepath })`, which drops the oldest commit at the period's edge and throws when the file is gone at HEAD. Deleting commits are listed; comparing with one shows "This Document does not exist in this commit" with every current line as added.
- **Period edge:** like `git log --since`, the walk stops at the first commit older than the period, so rebased history with out-of-order dates may hide a commit.
- **"Once per session"** is read as once per opening of the dialog: a fresh History on open and on Refresh, so new commits appear; within it `.git` is listed once and each file read once (counted in the unit tests). Speed on a large repository is to be checked in the Host trial.
- **Added beyond the original:** none of its Save/commit (ADR 0008). Kept from it: Expand all / Collapse all, fold bars, the commit cards.
- **Repository unavailable:** Project settings has no Reconnect for the repository yet; the message says to disconnect and connect it again. The browser journey does not cover this case.
- **Test Host quirk:** bytes come back from the browser Test Host as a JSON object; `history`'s file layer converts them, as `project.readBytes` does.
- GLOSSARY.md has no entry for Versions or Commit.
