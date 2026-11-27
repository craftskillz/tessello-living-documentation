# 34: Automatic commits: the Projects `tessello sync` commits, and its state in Project settings

**What to build:** For `npx tessello sync --living-documentation <repository>` (ADR 0011), the Module records in its storage, under the key `sync`, each Project that has a Repository grant: its id, its name, the repository folder's name, the Project folder's path in that repository (`""` when the repository is the Project folder; the path Versions finds, `projectPathInRepository` in `src/lib/history.ts`) and its typed `location` when it has one. The entry is written when the Repository grant is connected (and refreshed when Versions finds the path), and removed when the grant is removed or the Project is forgotten. Project settings › Repository shows what `sync` last did for this Project, read from the key `syncStatus` that `sync` writes: the last commit (time, short id, Documents) or the problem, and, when nothing was ever written, how to start it: in the Modules folder, `npx tessello sync --living-documentation <the repository's path>`, with a copy button.

**Blocked by:** none (the `tessello` side is `../tessello/.scratch/git-integration/issues/11-sync-living-documentation.md`, which needs this key)

**Status:** done (8a1133d)

- [x] Key `sync`: `{ "projects": [{ "id", "name", "repository": "<folder name>", "path"?: "<in the repository>", "location"?: "<typed>" }] }`, written, refreshed and removed as above; nothing else of the storage changes
- [x] Project settings › Repository shows the `syncStatus` of the Project (last commit or problem) and the command to run when there is none
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [x] Tried in the local Host with `npx tessello sync --living-documentation <repository>` running; differences noted in the ticket

Decision: `docs/adr/0011-tessello-sync-commits-the-projects-of-a-repository.md`. Spec: `docs/spec/git-versioning.md`.

## Settled

- `syncStatus`, the key `sync` writes and the Module reads (User, 2026-11-27):

```json
{
  "heartbeat": "2026-11-27T14:32:05Z",
  "projects": {
    "<Project id>": {
      "repository": "/Users/me/code/arolla",
      "lastCommit": { "at": "2026-11-27T14:31:50Z", "id": "a1b2c3d", "documents": ["docs/guide.md", "docs/api.md"] }
    },
    "<another Project id>": {
      "repository": "/Users/me/code/other",
      "problem": { "kind": "not-a-repository", "message": "Cannot sync …: it is not a git repository (no .git).", "since": "2026-11-27T14:00:00Z" }
    }
  }
}
```

`heartbeat`: the last round. Per Project: the repository used, then `lastCommit` (time, short id, Documents committed) and/or the current `problem` (kind, message, since). A repository with no configured Project has no entry (its message goes to the terminal only). Written atomically by `sync` only; read by the Module only.

  Project settings › Repository shows "Last automatic commit: today at 14:31 (a1b2c3d), 2 documents", or the problem in red, or, when `heartbeat` is missing or older than three intervals, "The synchronisation is not running" with the command to copy.

- `sync` recognises a repository given on the command line by the Project's typed `location` lying inside it when there is one, else by the repository folder's name with the Project path existing in it (User, 2026-11-27).

- `path` is absent while unknown (User, 2026-11-27). Versions finds the Project folder only among the files git tracks, so a Project never committed has no path; `sync` then recognises it by its typed `location`, and Project settings asks for the location ("Type this Project's location above…").

## Comments

- **`path` optional**: the key differs from the format above in that one point (see Settled). The `tessello` ticket 11 must treat a missing `path` as "recognise by `location` only".
- **`name`** is the Project folder's name, not the name the User gave it.
- **When the path is looked for**: when Versions reads a history, and in the background when Project settings opens with an available grant whose entry has no path (also creates the entry for a grant connected before this ticket). Typing the location also creates the entry of such a grant.
- **Display**: Project settings reads `syncStatus` when it opens and every 15 s while open. Besides "not running", a third case: sync running with no entry for this Project → "running, but not for this repository" with the command. When running with a problem, only the problem shows (no command). `sync`'s own message is English; a translated lead precedes it. A failed read of `syncStatus` shows a translated message (not covered by e2e: the Test Host cannot fail a storage read).
- **The command's path**: the path `sync` used, else the typed location minus `path`, else a placeholder `<path of <repository>>` to replace (also what Copy copies).
- **"Not running"** uses three of the default 60 s intervals (180 s): the Module cannot read Git Integration's configured interval.
- Tried by the User in the local Host with `tessello sync --living-documentation` (tessello 3e37cb3) running, 2026-11-27; no difference reported.
