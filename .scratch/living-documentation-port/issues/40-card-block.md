# 40: The Card block

**What to build:** A new block, the Card: a frame around free Markdown, with a title, a style, a width and an alignment. Written like the column layouts (ADR 0005):

```markdown
<!-- card: My title | style: bristol | width: 1/2 | align: right -->

Free **Markdown**: lists, tables, images, code…

<!-- /card -->
```

Outside the Module (GitHub, IDE previews) the comments are invisible and the content reads as plain Markdown.

**Blocked by:** none

**Status:** done (d580d50, d22d8f6, cd72018, 68a1412, bb46c81)

- [x] `src/lib/directives.ts`: `card` (title, `style`, `width`, `align`) and `/card`; unknown values ignored, like every directive
- [x] `src/lib/render.ts`: the Card as a container around its content (rendered like any other Markdown), its source range on the whole block
- [x] Styles in `src/lib/document.css`, light and dark: `plain`, `bristol` (perforated index card), `deck` (playing card); `plain` by default
- [x] Width as the images' presets (`full` by default, `3/4`, `2/3`, `1/2`, `1/3`, `1/4`); `align` left (default), center, right; the Card stays alone on its line (text never flows around it)
- [x] Snippet "Card" in the picker's **Structure** category, with its own icon: title, style, width, alignment; a Card reopens in its form from the reading view's block actions, its content untouched
- [x] HTML generation: the HTML view, its templates (Interview sheet, Article) and **Download HTML** render the Card in its style, the standalone file carrying the Card CSS
- [x] Format (ticket 36) leaves the comments as they are and formats the content
- [x] Every text in English and French; spec in `docs/spec/documents-snippets.md` and reading rule 7
- [x] Typecheck, unit and browser suites green
- [x] Tried in the local Host

## Settled

- With the User, 2026-11-27:
  - The title lives in the directive (`card: Title`), not as a heading inside: it stays out of the table of contents and the sections (it does not show on GitHub).
  - A Card narrower than the page stays alone on its line; two Cards side by side go in a column layout.
  - The Card is a snippet of the Structure category, and the HTML generation supports it.
  - The styles were chosen from a throwaway prototype first: `prototypes/PROTOTYPE-card-styles/index.html` (variants A Realistic, B Minimal, C Labelled; theme, width and alignment switchable).
  - Prototype verdict: variant A (Realistic) for Plain and Playing card; Bristol is A's cream paper, title font and colour, with one row of punched holes across the top, no red margin and no ruled lines. The prototype is kept on the branch `prototype/card-styles` (283cf32), out of main.

## Comments

- The glossary already had **Card** (a Kanban board's Card): the new block is the **Card block** in the code and the docs, labelled "Card" in the snippet picker only.
- Widths are written as the images' presets (`width: 1/2`), not as percentages.
- The bristol's holes are cut out with a CSS mask, so they show whatever is behind the card (the page, an Interview sheet section…), with a light rim drawn around each one to stay visible on a white page.
- A card's comment before a table is not taken for the table's directive, in the rendering and in the block actions.
- The snippet's icon is 🃏. The picker now lists 26 kinds, 24 of them reopened from the reading view.
- Typecheck, 1189 unit tests and 411 browser tests green. Not yet tried in the local Host.
- After the User's first look (2026-11-27): the bristol paper is a little darker (`#f8efd4`, `#ece2c3` in a dark Document) and keeps two holes in every four places (● · · ●, the two mask layers intersected); the playing card shows a neutral double lozenge ◈ in both top corners instead of the ace of hearts in two opposite corners.
- Background colour, asked by the User (2026-11-27): `color:` after `style`, one of twelve backgrounds (`CARD_PALETTE` in snippets.ts, repeated in document.css and the HTML pages' CSS); the text, title and plain-frame inks come with it. Swatches in the form, Default first (the style's own).
- Bristol, after the User's second look (2026-11-27): light squares (1.25rem, about 13% blue; on a coloured card, its ink at 12%) and a red rule under the title from edge to edge (its title's colour on a coloured card).
- After a later look (2026-11-27): the holes are evenly spaced, one in every three places (● · · ● · · ●), a single mask layer.
- Tried in the local Host by the User (2026-11-28): approved as is.
