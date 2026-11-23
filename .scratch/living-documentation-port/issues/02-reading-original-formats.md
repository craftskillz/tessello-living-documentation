# 02: Reading: the original's formats

**What to build:** Documents written with the original's formats render as before: table directives (style, border, color), image directives (width, alignment), quote directives (type, title, icon), column layouts (`layout-columns` … `col`, up to 6 columns), `:::compare`, callouts, footnotes, heading anchors, code highlighting, and collapsible long code blocks (ADR 0005).

**Blocked by:** 01 (Reading: links, images and the document stylesheet)

**Status:** ready-for-human (built; awaiting the trial in the local Host)

- [x] Each directive renders as in the original (expected HTML per directive)
- [x] `:::compare` and column layouts render
- [x] Callouts and footnotes render
- [x] Headings get anchors; `#anchor` links scroll to them
- [x] Code is highlighted; long code blocks collapse
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder) on an old folder using these formats; differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Built** (2026-11-23):
  - `src/lib/directives.ts` is the directive catalogue (ADR 0005): the allowed values and class names, as pure functions.
  - `renderDocument` (`src/lib/render.ts`) renders the formats with a remark pass.
    - Table, image, quote and code directives decorate the next block, including inside blockquotes.
    - Column layouts become `.ld-columns` / `.ld-column`, and `:::compare` becomes `.ld-compare`.
    - Compare regions are masked by a same-length comment, so every `data-src` stays exact, including inside compare.
    - Footnotes use ids `ld-fn-*` / `ld-fnref-*`, with links as `data-anchor`.
    - Code is highlighted with `rehype-highlight` (`detect: true`, as the original's highlight.js), and Mermaid is left plain for ticket 03.
  - `renderDocument` takes optional translated labels (footnotes, back link, compare columns).
  - `src/view/collapsible.ts` folds code blocks taller than 400px, with a translated Show more / Show less.
  - `src/lib/document.css` ports the original's styles: tables, images, code width, callouts, columns, compare, footnotes and the highlight.js github / github-dark colors.
  - Tests: 110 unit (`test/directives.test.ts` new), 30 browser (`e2e/formats.test.ts` new, 6 journeys); `tessello validate` passes.
- **Differs from the original:**
  - Directive comments are read from the Markdown tree, not by regex:
    - a directive inside fenced code or HTML is never applied;
    - any number of comments may precede a block (the original took at most 3, or 2 for an image);
    - a `:::compare` inside fenced code stays code.
  - Footnote ids follow the Markdown label (`[^b]` gives `ld-fn-b`). Inside a compare they are `ld-compare-<n>-fn-*`, where the original had `ld-fn-compare-<n>-*`. The back link label has no index suffix.
  - The compare's Markdown source is escaped but not syntax-highlighted. Its labels are translated ("Markdown" / "Result", "Markdown" / "Rendu"), where the original hard-coded "Syntaxe" / "Rendu".
  - Code blocks are light in light mode (github theme) and dark in dark mode. Ticket 01 had them always dark.
  - The fold height is a fixed 400px. The original's `codeBlockMaxHeight` setting is not ported.
  - There is no Copy button on code blocks. The ticket does not ask for it; still to decide.
  - An image directive on a missing image is lost (the alt text shows instead).
- **Left over:**
  - `tessello validate` warns about `localStorage` / `sessionStorage` in `view/app.js`. These are false positives: the words appear in highlight.js's JavaScript keyword list.
  - Image and code width/align are covered by unit tests only.
  - Review smells, left for a later refactor:
    - `render.ts` builds class and data attributes the same way for images, code and tables;
    - directive knowledge lives in `render.ts` rather than in the `document` model (docs/design.md §1).
