# 33: Project settings: a palette for the predefined colours

**What to build:** The predefined colours that snippets and directives use can be changed per Project from the Project settings dialog (`src/view/ProjectSettings.svelte`), with a colour palette, and kept in `.living-doc.json`. The reading view, the snippet dialog's previews (the table grid) and the HTML view use the Project's colours; a Project without the setting keeps today's colours.

Asked by the User (2026-11-26), during the follow-up of ticket 14: "Dans project settings on pourrait customiser avec une palette de couleur les couleurs prédéfinies". Scope to settle with the User before building (needs-triage):

- **Which colours**: the five table colours (Info, Success, Warning, Danger, Note: accent, soft, stripe and text shades, `document.css` `table-color-*`); the callout types (`ld-callout-*`); the six swatches of colored text and colored sections (`SWATCHES` in `src/lib/snippets.ts`, written into the file as hex values); the Kanban column colours. All, or tables first?
- **One colour or four shades**: does the User pick one accent per colour and the shades (soft, stripe, text) follow, or every shade? Light and dark themes: one choice derived for both, or two?
- **Names**: can a colour be renamed or added, or only the five/six fixed names recoloured?
- **Colored text and sections** write their colours into the Document (`style="color:#…"`): does the palette change only what new snippets write, or also how existing ones read?
- **On disk**: a new key of `.living-doc.json` (for example `colorPalette`), shared with the team and the agents as the other Project settings are; the original ignores keys it does not know. Missing key, malformed file or invalid colour → today's colour.

**Scope (decided by the User, 2026-11-28):**

- **Which colours**: the five table colours only (Info, Success, Warning, Danger, Note). Callouts, the coloured text and section swatches and the Kanban columns stay as they are (later tickets if wanted).
- **One accent per colour**: the User picks one accent; the soft, stripe and text shades, light and dark, are derived from it.
- **Names**: fixed; only their colours change.
- **Coloured text and sections**: out of scope (tables are written by name, so every Document, old or new, follows the palette).
- **On disk**: the key `colorPalette` of `.living-doc.json`, an object of `#rrggbb` accents by colour name, only the changed ones written; Restore defaults removes the key. Missing key, malformed file, unknown name or invalid colour → today's colour.

**Blocked by:** 14 (Snippets I: picker, forms and block actions)

**Status:** ready-for-human (built and tested; to try in the local Host)

- [x] Scope above settled with the User and written here
- [x] The setting in `.living-doc.json`, read and changed through `src/lib/projectSettings.ts` (only its key written, version-checked); unit-tested on the Test Host disk
- [x] Project settings dialog: a palette per predefined colour, a **Restore defaults** button; a failed write shows a translated message and the colour goes back
- [x] The reading view, the snippet dialog and the HTML view (Download HTML included) use the Project's colours, light and dark themes
- [x] A change made outside the Module (an agent, a teammate's commit) is picked up like any other agent edit
- [x] `docs/spec/` updated (snippets and Project settings), `GLOSSARY.md` if a new term is needed
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder)

## Comments

- Built in two seams: `src/lib/tablePalette.ts` (palette from JSON, CSS derived with `color-mix`, doubled class so it wins in any order) with `setTablePalette` in `projectSettings.ts`; then the wiring (one `<style data-ld-table-palette>` in the View's head for the reading view and the snippet grid, `htmlPage`'s `tablePalette` option for the HTML view and Download HTML, five colour pickers and Restore defaults in Project settings). Journeys in `e2e/table-palette.test.ts`.
- Differs from the scope: a colour picked back to its default is dropped from `colorPalette` (the file holds only real changes); a hand-written `#rgb`, upper-case or spaced value is read as its `#rrggbb` rather than refused.
- The snippet form still labels the colours "Info (blue)" etc.; once recoloured the hue in brackets can be wrong. The dialog uses plain names (`tableColor_*`). Worth a follow-up if it bothers.
- No e2e covers the dark theme or the derived soft/stripe/text shades (only `--tbl-accent`); the selectors' specificity was checked by hand.
- Left: try it in the local Host.
