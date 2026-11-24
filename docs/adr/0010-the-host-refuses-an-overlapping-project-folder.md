# The Host refuses a Project folder that overlaps another

ADR 0002 says two Project folders are never the same, nested in, or around one another. The Module cannot check this itself: it only gets an opaque id and a name for each Folder grant, never a path. The Host can, because it keeps the browser's folder handles: `FileSystemDirectoryHandle.resolve` says in one call whether one folder is inside another, the same check `mustContain` already makes for the Repository grant. So **Connect a folder** sends `folders.request({ mustNotOverlap: <every Project folder> })`. When the chosen folder is the same as, inside, or around one of them, the Host refuses with `overlapping` before granting anything, and the error names the clashing folder's id, so the Module names the Project: "This folder overlaps the Project “shop”". This is a Host change (Convention §6.5, Tessello ADR 0022, branch `feat/folder-files-capability`).

## Considered Options

- **A query `folders.relation(a, b)`**: rejected. The Module would have to grant the folder first, compare it with each Project, then release it: a grant made and undone, and more requests.
- **Not refusing overlap in v1**: rejected. Two Projects would show the same files, and their Folder manifests, favorites and renames would clash.
- **Guessing from the files' lists**: rejected as unreliable.

## Consequences

- Repository grants are not listed in `mustNotOverlap`: a repository root contains its Project folder by design (ADR 0008).
- Choosing the folder of an existing Project is refused too, naming that Project, rather than silently switching to it.
- The protocol error gains an optional `folder` field (the id), first used by `overlapping`.
