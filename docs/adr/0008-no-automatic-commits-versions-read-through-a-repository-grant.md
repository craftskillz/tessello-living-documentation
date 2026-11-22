# No automatic commits; Versions reads git history through a Repository grant

The original runs `git` after every save: one commit per save with a generic message, sweeping in unrelated changes, and optional pushes. A Tessello Module cannot run `git`, and a Project is the developer's own repository, which they and their agents already commit; automatic commits would pollute that history. The Module therefore makes no commits and no pushes. It keeps **Versions** by reading history only: each Project may get an optional **Repository grant** on the repository root (which must contain the Project folder, checked by the Host), and the Module reads `.git` with isomorphic-git through the Host's file requests.

## Considered Options

- **A companion command in the style of `tessello sync` that watches and commits**: rejected for v1; another process to run, for commits the developer does not want.
- **isomorphic-git commits from the Module**: rejected; local commits only (GitHub's git endpoint sends no CORS headers, so no push), and the same history pollution.
- **Dropping Versions**: rejected; comparing with earlier commits and restoring blocks is the useful half of the feature.

## Consequences

- No Git settings, toasts or "not configured" reminder. Automatic commits may return with the Tessello Bridge.
- Versions compares the current file on disk with a commit, follows renames with git's 50% similarity rule, uses a Myers diff, and writes each restored block at once with a version check.
- Selection history (`git log -L` in the original) is not rebuilt in v1.
- A prototype (2026-11-22) read 30 days of a file's history on a 1379-commit, 61 MB repository in 0.2 s cold, provided the fs shim lists `.git` once and caches every read; isomorphic-git's `follow` matches identical content only, so the 50% rename rule is the Module's own code.
- The Host must support a grant that contains another grant (ADR 0022 in the tessello repository).
