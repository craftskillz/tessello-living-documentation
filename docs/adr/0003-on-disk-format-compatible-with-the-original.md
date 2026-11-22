# The on-disk format stays compatible with the original

A Project folder is read and written in the original's formats: `.living-doc.json` for Project metadata, a `liv-doc-main.md` Folder manifest per Folder for order and hidden entries, annotations in one `.annotations.json` at the Project root (keyed by Document), the original's Images folder, and its YAML frontmatter. A folder can therefore be opened by either application, and existing documentation folders work unchanged. We fix defects inside those formats rather than redesign them; changes are additive only, and anything incompatible needs its own ADR. The exact formats come from the original's source, read during the technical pass, not from this ADR.

**Amended:** two exceptions: templates are Markdown files (ADR 0006), and favorites are personal, kept in the Module's storage (ADR 0007).
