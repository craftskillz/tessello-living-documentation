# 02 — Reading: links, images, styles and full rendering

Status: ready. Follows slice 1 (connect, Tree, read, edit with autosave, agent edits; commits up to `036fc35`).

## Why

In the local Host, an old Living Documentation folder opens but reads bare: no document styles (tables look broken), none of the original's formats, no images, and links between Documents may leave the View.

## Read first

- `GLOSSARY.md` (vocabulary), `docs/design.md` (modules: `document`, `render`, `project`), ADR 0005 (directives are HTML comments).
- `docs/spec/documents-reading-and-editing.md`, `docs/spec/documents-tag-markers.md`, `docs/spec/kanban-boards.md` (rendering only), `docs/spec/cross-cutting.md` (Navigation).
- The original's behavior: atlas `/Users/ymedaghri/Documents/testRetrodocLivingDocByClaude/features/documents/reading-and-editing.md`; source (read-only, never modify) `../living-documentation`, for its rendering rules and its CSS.
- **The View is an `about:srcdoc` page** in the Host (base `https://package.tessello.invalid/view/`): no URL routing, no `href` that resolves to an address, no `history.*State` with a URL. The SDK Test Host runs the View top-level, so tests do not catch this: keep the e2e assertion that the page address never changes.

## Scope

1. **Links** in a Document: a relative link to a `.md` of the Project opens it in the View (with its `#anchor` scrolled to); an external `http(s)` link opens in a new tab (`target=_blank`, `rel=noopener`); a link to a missing Document shows a message. Clicking any link never changes the View's address.
2. **Images** of the Project (relative `src`, ADR 0001): read as bytes through `project` and shown from blob URLs; a missing image shows its alt text and a missing-image mark. Blob URLs are revoked when the Document changes.
3. **Document stylesheet** in the look of the original (its CSS read, not copied blindly), light and dark from the Host theme: headings, paragraphs, lists, quotes, code, tables, images, horizontal rules.
4. **Full rendering** as the original: GitHub tables and the table / image / quote / column directives (`<!-- table-style: … -->`, `table-border`, `table-color`, `image-width`, `image-align`, `quote-type`, `quote-title`, `quote-icon`, `<!-- layout-columns: 2/1 | gap: lg -->` … `<!-- col -->`), `:::compare`, code highlighting, Mermaid diagrams, Kanban blocks shown read-only (the board itself is ticket "Kanban"), Tag marker pills (name shown, HTML element names excluded). Raw HTML other than these stays out. Every rendered block carries its source range (`data-src="from-to"`) for later slices.
5. **Check in the local Host** (`npm run start:host` in `../tessello`, module copied into the Modules folder) on an old Living Documentation folder before calling it done; note what differs from the original.

Out of scope: tree actions, snippets, annotations, the Kanban board's behavior, HTML view.

## Proposed seams (confirm with the User before the first test)

1. `render` (pure, Node): Markdown body + Document path → HTML string. One test per directive and extension, expected HTML from the original's behavior; links rewritten to in-View targets; image `src` left as Project paths for the View to resolve.
2. `links` (pure, Node): resolve a link from a Document path → `{ kind: "document", path, anchor } | { kind: "external", url } | { kind: "missing" }`.
3. `project.readImage(path)` (Node, Test Host disk): bytes and type; missing → null.
4. View journeys (Playwright, built View on the Test Host): a link opens the other Document without changing the address; an external link opens a new tab; an image of the Project shows; a table, a directive-styled quote and a Mermaid diagram render.
