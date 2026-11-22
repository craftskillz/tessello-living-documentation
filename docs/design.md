# Codebase design

How the Module's code is cut into modules (in the deep-module sense), where the seams are, and how each one is tested. Vocabulary of the domain: [CONTEXT.md](../CONTEXT.md). Behavior: [docs/spec/](spec/README.md). Status: **confirmed 2026-11-22**. Order: prototypes (4) → Host `folders.*`/`files.*` by TDD in `../tessello` (SDK + Test Host first) → first slice (connect, tree, read, edit with autosave and version check, Agent edits).

## Layout

Same stack and layout as the sibling Modules (`tessello-git-integration`): Svelte 5, esbuild, `@tessello/sdk`, `node:test`, Playwright, `just`.

```
src/lib/        domain modules, no DOM unless named (render, speech)
src/view/       the View: routes, Svelte screens (thin: call src/lib)
src/widget/     the Widget: active Project name and favorites
test/           node:test, through the module interfaces, on the SDK Test Host
e2e/            Playwright journeys on the built View
```

## Seams (only where two adapters exist)

| Seam | Production adapter | Test adapter |
|---|---|---|
| **Folder files** (`folders.*`, `files.*`, ADR 0022) | Host requests | Test Host's in-memory folder (to be added to `@tessello/sdk/testing`) |
| **Module storage** | Host storage | Test Host storage |
| **Speaker** | `speechSynthesis` | Fake speaker recording utterances |
| **Clock** | `Date.now`, timers | Manual clock (5-second polling, autosave delay) |

Everything else is in-process and tested directly through its interface. isomorphic-git reads `.git` through a small `fs` shim over Folder files: an internal seam of History, not exposed.

## Deep modules

### 1. `document` — the Document model (pure)

`parseDocument(text) → DocumentModel`: Frontmatter (raw block, fields, validity), title (rule: `title` › first `#` › file name), Tags, Type, language, `html_template`, and the block tree with **source ranges** for every block, Tag marker, Link, Image, directive and Kanban block. One parser (remark/mdast, which keeps positions) used by everything below.

`setField(text, name, value) → text | InvalidFrontmatter`: in place or appended, every other byte kept.

Hides: YAML parsing, list-or-string tags, directive comments, Kanban detection rule, code-block exclusions. Used by: rendering, snippets, tag markers, annotations, HTML generation, read aloud, search.

### 2. `edits` — text edits (pure)

`TextEdit = { range, text }`; `applyEdits(text, edits) → text`. Section editor, HTML in-place edits, snippet insertion, Tag marker insert/remove, Versions restore and field writes all produce `TextEdit`s against the model's source ranges. One splicing rule, one place to test it.

### 3. `project` — a Project and every file change in it

The only module that writes a Project folder. Interface (sketch):

```ts
openProject(folder: FolderFiles, storage): Promise<Project>
project.tree(): Tree                         // order + hidden from Folder manifests
project.read(path): Promise<{ text, version }>
project.write(path, edits | text, { ifVersion }): Promise<Version>   // conflict → Conflict
project.create / rename / move / remove(path, …)
project.settings / setSettings               // .living-doc.json
project.changes(): AsyncIterable<Change>     // 5-second poll, Agent edits
```

Hides the cascades of R12-style rules: rewriting relative Links on rename and move, updating Folder manifests (order append, hidden), carrying annotations, favorites and Kanban column folders, refusing names, never overwriting Images, lazy creation of Project metadata. Tested on the in-memory folder with journeys from the spec ("rename a Folder: links in other Documents follow, favorites follow").

### 4. `annotations` — placement and storage

`placeAnnotations(model, list) → Placed[]` (pure: placed / surrounding changed / orphan) and `AnnotationStore` over `project` (`add / edit / remove` with re-read, re-apply, retry on conflict).

### 5. `render` — Document model → HTML (DOM-free string or hast)

Directives, Tag marker pills, Mermaid placeholders, Kanban block, annotations columns hooks, every block tagged with its source range (`data-src="from-to"`) so clicks map back to `edits`. The HTML view's templates (Interview sheet, Article) are a second renderer over the same model: title, lead, `##` sections, table of contents; **Download HTML** inlines CSS and embeds Images.

### 6. `history` — Versions

`openHistory(repository: FolderFiles, projectPath)`; `history.commits(path, days) → Commit[]` (following renames at 50%), `history.fileAt(commit, path) → text`; `diff(a, b) → Hunk[]` (Myers, pure). Restores go through `project.write` with `edits`.

### 7. `reading` — read aloud

`readingScript(renderedRoot, lang, labels) → Sentence[]` (DOM in, pure out; `Intl.Segmenter`, overlong split, announcements) and `Reader(speaker, clock)` (play, pause, next section, stop, start from selection). Tested with the fake speaker and a DOM from `linkedom`/happy-dom.

### 8. `projects` — the Project list, grants, preferences

Module storage: Projects (folder grant ids, Repository grant id, name), active Project, last opened Document, favorites (ADR 0007), Marker state, reading voices and speed, tree preferences. Opening rule (deep link › last opened › top favorite › first Document). Unavailable Project and Reconnect.

### 9. Smaller modules

`templates` (`.templates/` library, placeholders, Convert to files), `kanban` (board model over `project`: columns ↔ folders mapping, card order), `snippets` (25 kinds → Markdown, reopenable Mermaid forms), `search` (title, tags, description, type, body), `i18n` (en/fr, plurals).

## Not modules

- The View's screens: thin Svelte over the modules above; covered by Playwright journeys.
- Directive and snippet catalogues: data, tested through `render` and `snippets`.
