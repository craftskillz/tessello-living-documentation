# Templates are Markdown files in `.templates/`, not the original's JSON library

The original keeps a Project's template library in one file, `.document-templates.json`, with every template's Markdown escaped inside JSON. That is the very format ADR 0001 rejected for Documents: agents cannot work with it and its git diffs are unreadable. Templates therefore become real files, `.templates/<folder>/<name>.md` at the Project root, hidden from the Tree. This is the one deliberate break with ADR 0003: the original application no longer sees templates created by the Module.

## Consequences

- A Project that still holds `.document-templates.json` is offered a one-time **Convert to files**, which writes the `.md` files and leaves the JSON untouched for the original.
- Template and folder names follow the Tree's naming rule; order is alphabetical (files have no reliable creation order); concurrency is checked per template file, not for the whole library.
- Links and images inside a template are relative to the template file and are rewritten for the new Document's location when a Document is created from it.
