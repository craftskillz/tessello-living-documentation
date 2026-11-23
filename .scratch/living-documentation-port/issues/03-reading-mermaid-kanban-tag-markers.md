# 03: Reading: Mermaid, Kanban blocks and Tag marker pills

**What to build:** Mermaid diagrams render; a Kanban block (outside code) renders read-only as a board preview (the board itself is a later ticket); Tag markers (unclosed tags that are not HTML elements and not closed in the Document) show as yellow pills with their name, the whole tag on hover. Other raw HTML stays out.

**Blocked by:** 02 (Reading: the original's formats)

**Status:** ready-for-human (built; awaiting the trial in the local Host)

- [x] Mermaid code blocks render as diagrams; a broken diagram shows its error, not a blank
- [x] A Kanban block renders read-only; one inside code does not
- [x] Tag markers render as pills (name cut at about 20 characters, whole tag on hover); HTML element names are not markers
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Built** (2026-11-23):
  - `src/lib/tagMarkers.ts` (pure): the original's tag syntax, `isMarkerName` (not a standard HTML element, not closed anywhere in the Document) and `pillLabel` (19 characters and "…" past 20).
  - `src/lib/kanban.ts` (pure): `parseKanbanBlock`, up to 6 columns, colors sky, amber, emerald, rose, violet, slate (defaults by index).
  - `renderDocument` finds markers on the Markdown tree, so code, inline code and comments never hold one. Markers come from inline HTML, from text the parser does not take as HTML (accents), and from HTML blocks. Escaped `\<tag>` and entities are not markers, and neither is anything inside inline raw `<code>`, `<pre>`, `<script>`, `<style>` or `<textarea>`.
  - A Mermaid block becomes a `[data-mermaid]` placeholder. `src/view/mermaid.ts` draws it with `mermaid` 11 (`securityLevel: "strict"`), redraws on a theme change, and on failure shows the translated message followed by the source.
  - Styles: yellow pill (`cursor: help`, whole tag in `title`), Mermaid centered, red error box, and the board preview in the original's six column themes, light and dark.
  - Tests: 164 unit (`test/tagMarkers.test.ts` and `test/kanban.test.ts` new) and 55 browser (`e2e/diagrams.test.ts` new, 5 journeys). `tessello validate` passes.
- **Differs from the original:**
  - The pill shows the tag name, not the **b** glyph (spec rule 1). Every standard HTML element name is excluded, not only void elements.
  - A Kanban block renders as a read-only preview of its columns, with no cards, where the block is written. The board is ticket 21. Only the first block of a Document renders, and none inside `:::compare`.
  - Pills carry `data-src` (the tag's exact range), for ticket 13.
  - `code-width` and `code-align` directives apply to Mermaid diagrams too, as the original's layout did.
  - An HTML block that holds a marker shows its markers and its plain text (other tags dropped); without a marker it stays out.
  - Diagrams follow dark mode (Mermaid's dark theme) unless White background is on.
- **Left over:**
  - The diagram error is translated, but Mermaid's own reason after the colon stays in English.
  - `dist/view/app.js` grew from 1.2 MB to 4.7 MB with Mermaid inlined. Splitting or lazy loading is still to decide.
  - `tessello validate` now warns 3 times: `localStorage`, `sessionStorage` and an embedded frame in `view/app.js`. They come from Mermaid's code (the sandbox iframe mode is not used: `securityLevel` is `strict`). Whether Mermaid draws in the real sandbox is to check in the local Host.
  - Dark-mode drawing has no browser journey.
  - Review smells, left for a later refactor: the marker finder lives in `render.ts` rather than `tagMarkers.ts`; mdast nodes are built by hand with `as never`; the Mermaid width and align CSS repeats the `pre` rules.
