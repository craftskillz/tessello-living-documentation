# Favorites are personal, kept in the Module's storage

The original keeps favorites in the Project's `.living-doc.json`, so they are committed to the repository and shared with everyone who clones it, and every star or reorder changes a file (a commit when Git integration is on). The Module is used by one person, and favorites are a personal shortcut, so the Module keeps them per Project in its own Host storage instead. The repository stays clean and the Widget reads them directly. This is a second deliberate break with ADR 0003.

## Consequences

- When a Project is first opened, its favorites are seeded once from `.living-doc.json` if it has any; afterwards the file is never written for favorites, and the original application keeps showing its own older list.
- Favorites are backed up with the Module's storage (Tessello export, `tessello sync`), not with the Project's repository.
