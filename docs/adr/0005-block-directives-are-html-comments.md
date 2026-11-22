# Block directives are HTML comments written before the block

Documents need presentation details that Markdown cannot express: a table's style, border and color, an image's width and alignment, a callout's type and title, a column layout. Like the original, the Module writes each one as an HTML comment on the lines right before the block it applies to (`<!-- table-border: bordered -->`, `<!-- image-width: 50% -->`, `<!-- layout-columns: 2/1 | gap: lg -->` … `<!-- col -->`), and keeps `:::` fences only for a container wrapping a whole region (`:::compare … :::`). HTML comments are invisible in every other Markdown renderer (GitHub, IDE previews), so a Document stays clean outside the Module and only loses its styling; existing Documents already use this syntax (ADR 0003); agents read and write it without special knowledge.

## Considered Options

- **Attribute lists (`{.bordered width=50%}`, Pandoc / kramdown style)**: rejected. Shown as stray text by GitHub and most renderers, and incompatible with existing Documents.
- **`:::` containers for every directive**: rejected for the same reason; kept only where a region must be wrapped.

## Consequences

- New directives follow the same form: `<!-- <block>-<property>: <value> -->`, a bare `<!-- name -->` for a flag.
- A directive applies to the next block only; the renderer and the snippet editors must find it there, including inside blockquotes.
- The exact list of directives and values is taken from the original's source in the technical pass.
