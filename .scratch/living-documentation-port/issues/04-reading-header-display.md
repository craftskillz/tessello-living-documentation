# 04: Reading header and display preferences

**What to build:** The reading header offers Copy path, Lines, White background, the table of contents, Edit and Delete placeholders as they exist; Lines, table of contents state and width, and White background are remembered in the Module's storage. Images enlarge with Shift/Cmd + click; Copy image and Copy table work. The Folder manifest opens read-only (frontmatter as a YAML block, Lines, table of contents, Copy path; no Edit, Delete or Favorite).

**Blocked by:** 01 (Reading: links, images and the document stylesheet)

**Status:** done (d9fe29a)

- [x] Copy path copies the Document's path in the Project
- [x] Lines, White background and the table of contents work and are remembered
- [x] Image enlargement, Copy image and Copy table work
- [x] The Folder manifest opens read-only with only its allowed actions
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [x] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Built** (2026-11-23):
  - `projects.preferences()` / `setPreferences()` keep Lines, White background and the table of contents (open, width 160–400 px, default 224) under their own storage key `display`, the same for every Project.
  - `lineLabel` (`src/lib/lines.ts`) turns the blocks' `data-src` ranges into file lines; `src/view/lines.ts` labels each top-level block, shown by CSS only (never in copied or read text).
  - `renderDocument(..., { frontmatter: true })` shows a Document's frontmatter first as a highlighted YAML block; the model gains `frontmatterText` and `frontmatterEnd`.
  - The View: `Header.svelte` (Copy path, Lines, White background, Table of contents, Edit, Delete), `Toc.svelte` (headings as buttons, opens closed `<details>`, resizable), `ArticleTools.svelte` (right-click menu with Copy image / Copy table, Shift/Cmd + click enlargement in a `<dialog>`), `copy.ts` (ports of the original's copyTable and copyImage). The toast gains a success tone for confirmations, gone after 2 s.
  - Tests: 131 unit, 48 browser (18 new in `e2e/header.test.ts`, each checking that the page address never changes); `tessello validate` passes (the 2 known highlight.js warnings).
- **Trial in the local Host** (2026-11-23): validated by the User, including Copy path, Copy image and Copy table in the Host's sandboxed frame. The sticky header and the "Saving…" indicator (d9fe29a) came from this trial.
- **Differs from the original:**
  - White background is remembered (the original forgot it on reload), and keeps the Document in its light colors in a dark Host.
  - Delete is shown disabled with a "later version" title until the delete ticket.
  - A "Read-only" badge on the Folder manifest (the original said "Read-only: generated file").
  - The Table of contents button shows even without a heading; only the panel is hidden then.
  - Enlargement covers images only; Mermaid diagrams come with ticket 03.
  - Copy path, Copy image and Copy table confirm in the toast; a refused copy shows a translated failure.
  - The header stays on top while the Document scrolls, while reading and while editing; the table of contents and scrolled-to headings sit below it. While editing, "Saving…" shows only during a save; "Saved" is gone (asked by the User after the first build).
- **Left over:**
  - The Folder manifest opens only through the View's params (`doc`), since the Tree hides it; showing it with the hidden entries is ticket 10.
  - A manifest without a `#` heading shows its file name as the title above the YAML block.
  - A View opened through params while it is still starting can be overridden by the start Document (existing race in `View.svelte`).
  - Review smells, left for a later refactor: `Header` takes one prop and one callback per preference (could take the preferences and one toggle); the toast state could leave `View.svelte`; `copy.ts` is covered by browser tests only.
