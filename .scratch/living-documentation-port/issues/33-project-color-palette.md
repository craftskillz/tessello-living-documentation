# 33: Project settings: a palette for the predefined colours

**What to build:** The predefined colours that snippets and directives use can be changed per Project from the Project settings dialog (`src/view/ProjectSettings.svelte`), with a colour palette, and kept in `.living-doc.json`. The reading view, the snippet dialog's previews (the table grid) and the HTML view use the Project's colours; a Project without the setting keeps today's colours.

Asked by the User (2026-11-26), during the follow-up of ticket 14: "Dans project settings on pourrait customiser avec une palette de couleur les couleurs prédéfinies". Scope to settle with the User before building (needs-triage):

- **Which colours**: the five table colours (Info, Success, Warning, Danger, Note: accent, soft, stripe and text shades, `document.css` `table-color-*`); the callout types (`ld-callout-*`); the six swatches of colored text and colored sections (`SWATCHES` in `src/lib/snippets.ts`, written into the file as hex values); the Kanban column colours. All, or tables first?
- **One colour or four shades**: does the User pick one accent per colour and the shades (soft, stripe, text) follow, or every shade? Light and dark themes: one choice derived for both, or two?
- **Names**: can a colour be renamed or added, or only the five/six fixed names recoloured?
- **Colored text and sections** write their colours into the Document (`style="color:#…"`): does the palette change only what new snippets write, or also how existing ones read?
- **On disk**: a new key of `.living-doc.json` (for example `colorPalette`), shared with the team and the agents as the other Project settings are; the original ignores keys it does not know. Missing key, malformed file or invalid colour → today's colour.

**Blocked by:** 14 (Snippets I: picker, forms and block actions)

**Status:** needs-triage

- [ ] Scope above settled with the User and written here
- [ ] The setting in `.living-doc.json`, read and changed through `src/lib/projectSettings.ts` (only its key written, version-checked); unit-tested on the Test Host disk
- [ ] Project settings dialog: a palette per predefined colour, a **Restore defaults** button; a failed write shows a translated message and the colour goes back
- [ ] The reading view, the snippet dialog and the HTML view (Download HTML included) use the Project's colours, light and dark themes
- [ ] A change made outside the Module (an agent, a teammate's commit) is picked up like any other agent edit
- [ ] `docs/spec/` updated (snippets and Project settings), `GLOSSARY.md` if a new term is needed
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder)
