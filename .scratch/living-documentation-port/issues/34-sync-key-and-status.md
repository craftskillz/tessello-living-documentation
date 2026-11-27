# 34: Automatic commits: the Projects `tessello sync` commits, and its state in Project settings

**What to build:** For `npx tessello sync --living-documentation <repository>` (ADR 0011), the Module records in its storage, under the key `sync`, each Project that has a Repository grant: its id, its name, the repository folder's name, the Project folder's path in that repository (`""` when the repository is the Project folder; the path Versions finds, `projectPathInRepository` in `src/lib/history.ts`) and its typed `location` when it has one. The entry is written when the Repository grant is connected (and refreshed when Versions finds the path), and removed when the grant is removed or the Project is forgotten. Project settings › Repository shows what `sync` last did for this Project, read from the key `syncStatus` that `sync` writes: the last commit (time, short id, Documents) or the problem, and, when nothing was ever written, how to start it: in the Modules folder, `npx tessello sync --living-documentation <the repository's path>`, with a copy button.

**Blocked by:** none (the `tessello` side is `../tessello/.scratch/git-integration/issues/11-sync-living-documentation.md`, which needs this key)

**Status:** needs-triage

- [ ] Key `sync`: `{ "projects": [{ "id", "name", "repository": "<folder name>", "path": "<in the repository>", "location"?: "<typed>" }] }`, written, refreshed and removed as above; nothing else of the storage changes
- [ ] Project settings › Repository shows the `syncStatus` of the Project (last commit or problem) and the command to run when there is none
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host with `npx tessello sync --living-documentation <repository>` running; differences noted in the ticket

Decision: `docs/adr/0011-tessello-sync-commits-the-projects-of-a-repository.md`. Spec: `docs/spec/git-versioning.md`.

## To settle (needs-triage)

- The exact format of `syncStatus` (written by `sync`, one entry per Project id: `{ lastCommit?: { at, id, documents }, problem?: { kind, message, since }, heartbeat }`), agreed with the `tessello` ticket.
- How `sync` recognises a repository given on the command line: the typed `location` lying inside it when there is one, else the folder name and the path existing in it (proposed in the `tessello` ticket).
