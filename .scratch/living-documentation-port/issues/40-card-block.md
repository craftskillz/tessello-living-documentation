# 40: The Card block

**What to build:** A new block, the Card: a frame around free Markdown, with a title, a style, a width and an alignment. Written like the column layouts (ADR 0005):

```markdown
<!-- card: My title | style: bristol | width: 50% | align: right -->

Free **Markdown**: lists, tables, images, code…

<!-- /card -->
```

Outside the Module (GitHub, IDE previews) the comments are invisible and the content reads as plain Markdown.

**Blocked by:** the User's choice of styles in the prototype (below)

**Status:** needs-info

- [ ] `src/lib/directives.ts`: `card` (title, `style`, `width`, `align`) and `/card`; unknown values ignored, like every directive
- [ ] `src/lib/render.ts`: the Card as a container around its content (rendered like any other Markdown), its source range on the whole block
- [ ] Styles in `src/lib/document.css`, light and dark: `plain`, `bristol` (perforated index card), `deck` (playing card); `plain` by default
- [ ] Width as the images' presets (100% by default, 75%, 66%, 50%, 33%, 25%); `align` left (default), center, right; the Card stays alone on its line (text never flows around it)
- [ ] Snippet "Card" in the picker (Structure): title, style, width, alignment; a Card reopens in its form from the reading view's block actions, its content untouched
- [ ] HTML view and its templates render the Card
- [ ] Format (ticket 36) leaves the comments as they are and formats the content
- [ ] Every text in English and French; spec in `docs/spec/documents-snippets.md` and reading rule 7
- [ ] Typecheck, unit and browser suites green
- [ ] Tried in the local Host

## Settled

- With the User, 2026-11-27:
  - The title lives in the directive (`card: Title`), not as a heading inside: it stays out of the table of contents and the sections (it does not show on GitHub).
  - A Card narrower than the page stays alone on its line; two Cards side by side go in a column layout.
  - The styles are chosen from a throwaway prototype first: `prototypes/PROTOTYPE-card-styles/index.html` (variants A Realistic, B Minimal, C Labelled; theme, width and alignment switchable).
