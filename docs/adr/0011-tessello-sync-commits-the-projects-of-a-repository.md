# `tessello sync --living-documentation` commits the Projects of a repository

ADR 0008 left out automatic commits: a Module cannot run `git`, and committing the developer's whole repository would sweep unrelated changes into it. Its own Consequences let automatic commits come back later, and the CLI's `tessello sync` already runs `git` on the machine for the Git Integration Module (Tessello ADR 0020). So `npx tessello sync --living-documentation <repository>` (repeatable, one repository each) commits, round after round, **only what lies under the folder of each Living Documentation Project in that repository**, never the rest of it. The User names the repositories (the browser never gives the Module a path on disk). The Projects are deduced, never typed: the Module records in its storage, for each Project with a Repository grant, where the Project folder lies in that repository (the path Versions already finds), and `sync` reads that from the Modules folder, as it reads Git Integration's `config`. Commits land in the repository holding the Project, so **Versions shows them**.

## Considered Options

- **`--repository <path>` committing the whole repository (`git add -A`)**: rejected. In a code repository it would commit half-written code, local configuration or badly ignored secrets every few seconds: the reason of ADR 0008.
- **`--repository` with `--only <folder>`**: rejected. Two concepts for the User to type, when the Module already knows the Project folders.
- **Backing up the Project folders into the Tessello data repository (`--data-project`)**: rejected. Git cannot commit files outside its work tree, so `sync` would copy them: the Documents twice, and Versions could not read that history (the Repository grant must contain the Project folder).
- **Commits made by the Module with isomorphic-git**: rejected in ADR 0008 (no push, the Module reads `.git` only).

## Consequences

- **The option names the Module.** `tessello sync` already depends on one Module's storage (Git Integration); this adds a second, read in the same way (one `{ "key", "value" }` file per key under `.tessello/data/@craftskillz/living-documentation/`). A change of that key's format must update both repositories.
- **What a round does, per repository**: the Projects of the Module's storage that lie in it are its paths to commit; `git add -A -- <path>…`, a commit whose message lists the changed Documents, after the files have stopped changing (the quiet wait of `sync`). **No push**: a code repository has its own remotes and branches. The interval is Git Integration's (60 s by default).
- **A repository with nothing to commit from** says why and the other repositories go on: "Cannot sync <path>: no Living Documentation Project is configured in this repository. In Living Documentation, open Project settings › Repository and connect this repository to the Project." Likewise for a folder that is not a git repository or does not exist.
- **The Module writes** a key of its storage that `sync` reads (the Project folder's path in its repository, and enough to recognise the repository); it is written when the Repository grant is connected and when Versions finds the path, removed when the grant is removed.
- **Personal, like the Repository grant**: only the User who runs `sync` gets commits. Agents and teammates are unaffected.
- ADR 0008 still holds for the Module itself: it never commits nor pushes.
