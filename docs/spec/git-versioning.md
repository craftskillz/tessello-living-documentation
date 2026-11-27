# Git versioning (Versions)

Atlas page: `features/git-versioning.md` (business rules R1–R15). Atlas answers: Q-063 to Q-071. Decision: ADR 0008.

## Dropped in v1

1. Automatic commits and pushes (R1–R6), Git settings, Git toasts, the "not configured" reminder, selection history (R13).

## Repository grant

2. Project settings › **Connect repository** opens the Host's picker; a folder that does not contain the Project folder is refused. Used read-only, for `.git`.
3. Without it there is no **Versions** button; Project settings offers "Connect repository to see versions".
   Project settings › Repository also holds the **Versions period (days)** Versions opens with: 1–3650, default 180 (the original: 30), personal like the grant (Module storage). The dialog's own field changes it only until the dialog closes.

## Versions

4. Offered in the header of an ordinary Document and of a Kanban board; not on the Folder manifest, not while editing.
5. Reads the current branch (HEAD). Commits that changed the Document in the period (1–3650 days), newest first, as cards (short id, message, date in the interface locale, author).
6. **Left**: "Current file" (the file on disk). **Right**: the chosen commit. Default: the latest commit that changed the Document, or the one before when the file is identical to it.
7. History follows renames: a commit where this path appears while another `.md` disappears with at least 50% similar content continues the history under the old path.
8. Myers diff, no size fallback. Folding as in R12.
9. **<** writes that block into the file at once (version-checked), refreshes the comparison, and offers **Undo** for the restores of this dialog session. On a conflict the comparison reloads and says so.
10. Failures show a translated message.
11. When reading took more than 3 seconds and the repository holds more than 1000 loose objects (`.git/objects/xx/…`, not in a packfile), the dialog shows a note until it closes: reading is slow, run `git gc` at the root of the repository, with **Copy git gc**. Each loose object is a request to the Host; a packed repository is read in a few (2026-11-27, a 6533-object repository read slowly until packed). The Module never runs `git` itself (ADR 0008).
