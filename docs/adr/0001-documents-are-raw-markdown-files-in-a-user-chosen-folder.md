# Documents are raw Markdown files in a folder the User chooses

Tessello Modules normally keep their data in the Host storage, which writes each key as an escaped JSON file in a hidden folder. We keep Documents instead as plain `.md` files, with real Folders and Image files, in a folder the User picks anywhere on disk (typically a code repository's `docs/`). The original's whole point is documentation next to the code that coding agents read and write directly; Markdown escaped inside JSON would make that impossible. A Document is identified by its relative path, Links are standard relative Markdown links (the Module rewrites them when it renames or moves a file itself, not after an Agent edit), and Images are real files referenced by relative path.

## Considered Options

- **Host storage, one key per Document, with stable IDs and `doc:<id>` links**: rejected. Simpler for the Module, but the files are unreadable for agents and `git` diffs show JSON strings.
- **Files inside the Modules folder (`.tessello/data/…`)**: rejected. Backed up by `tessello sync`, but hidden away from the code it documents.

## Consequences

- Requires a new Host capability (file access to granted folders), designed in the tessello repository first; the Module cannot be built against the Host until it exists.
- Coding agents are in scope through the files; the original's MCP server is out of scope.
- Agent edits happen while the View is open: the View re-reads on becoming visible, and a save is refused over a file changed since it was read.
- No import or export in v1: opening a folder is the import.
- Path identity means favorites, annotations and Kanban cards break when an agent moves a file; each feature decides how to detect that.
- Git versioning cannot run `git` from the Module; it is decided in its own feature round.
