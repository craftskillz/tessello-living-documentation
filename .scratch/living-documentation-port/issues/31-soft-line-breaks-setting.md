# 31: Project setting: every newline is a line break

**What to build:** A Project setting, "Treat every newline as a line break", kept in `.living-doc.json` under the original's key `markdownSoftBreaks`. When it is on, a single newline in a Document's source is rendered as a line break (`<br>`), as GitHub does in comments. When it is off, the rendering is plain CommonMark: two adjacent lines merge into one paragraph, and a line break needs two trailing spaces or `<br/>`. When the key is missing or is not a boolean, the setting is **on**, as in the original's code. The original's help text says the default is off, but its `config.ts` default is `true`, so existing folders were rendered with line breaks. The User changes it from the settings cog (⚙) of the Document header (`src/view/Settings.svelte`, ticket 29), as a checkbox with the help text, next to Titles or file names and the label filter. The cog says it is a Project setting, shared through the repository. It applies wherever a Document is rendered: the reading view, the editor's preview, and the HTML view and its download (tickets 25 and 26). This is spec story 107 and `docs/spec/documents-reading-and-editing.md` rule 17.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human (built in a79d3cb; awaiting the trial in the local Host)

- [x] `markdownSoftBreaks` read from `.living-doc.json`: `true` or `false` as written; missing, malformed file or not a boolean gives `true`; unit-tested
- [x] On: a single newline inside a paragraph, list item, blockquote or table cell renders as `<br>`; never inside code blocks, inline code, Mermaid or front matter; unit-tested in `test/render.test.ts`
- [x] Off: plain CommonMark (today's rendering); two trailing spaces and `<br/>` still break the line
- [x] Source line numbers (Lines) and the table of contents are unchanged by the setting
- [x] Settings cog: a checkbox "Treat every newline as a line break" with the help text, marked as a setting of the Project (shared, in `.living-doc.json`); a change writes only this key, version-checked, leaving the rest of `.living-doc.json` as written (the file is created if missing); a failed write shows a translated message and the checkbox goes back; the open Document re-renders at once
- [x] A change to `.living-doc.json` made outside the Module (an agent, a teammate's commit) is picked up like any other agent edit
- [ ] The HTML view and Download HTML follow the setting; if ticket 25 or 26 is already done, follow it there too, otherwise note it in the Comments for whichever comes later
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder), on a folder written with the original

**From the original:**
- `src/lib/config.ts`: `markdownSoftBreaks: boolean`, default `true` (line 181).
- `frontend-svelte/src/routes/Admin.svelte`: the checkbox under Appearance. Here it moves to the settings cog.
- i18n keys `admin.appearance.soft_breaks_label` and `admin.appearance.soft_breaks_hint` in `frontend-svelte/public/i18n/en.json` and `fr.json`. Reuse their wording, but drop "(default)" from the "Unchecked" line, since checked is the default.
- It is applied with marked's `breaks` option in `routes/htmlTemplates.ts` and `routes/export.ts`, and in `SectionEditor.svelte`'s preview.
- In the HTML view's editing, `frontend-svelte/src/lib/html-view/blockMarkdown.ts` writes a `<br>` back as a bare newline when the setting is on, and as a hard break otherwise. This matters for ticket 26.

**Notes for the agent:**
- The renderer is unified/remark (`src/lib/render.ts`, `renderDocument`); today it has no line-break option. `remark-breaks` does exactly this, as a remark plugin. Check that it keeps the source positions Lines relies on (`src/view/lines.ts`), or write the small equivalent plugin (split `text` nodes on `\n` into `break` nodes).
- The setting is Project-wide and shared with the team (it lives in the repository), unlike `DisplayPreferences`, which are personal and kept in the Module's storage. Do not put it in `DisplayPreferences`.
- This is the Module's first write to `.living-doc.json` (today it is only read, for favorites: `src/lib/projects.ts`). Write it as a small reusable step (read, change one key, write with the version) that ticket 12's Project settings panel can reuse. ADR 0003: keep the original's format; other keys and their order stay as written.
- Read aloud (ticket 27) already splits sentences at line breaks in the source; nothing to change there.

Spec: `.scratch/living-documentation-port/spec.md` (stories 11 and 107). Read `GLOSSARY.md`, ADR 0003 (on-disk format compatible with the original) and `docs/spec/documents-reading-and-editing.md` first.

## Comments

- **Reading and writing:** `src/lib/projectSettings.ts`: `readSettings(project)` (`DEFAULT_SETTINGS`: on) and `changeSetting(project, key, value)`, the reusable step for ticket 12 (read with the version, change one key, write at that version; `null` creates the file, so `Project.save` now takes `string | null`). A file that is not a JSON object is refused (`Refused("invalidSettings")`, translated) and left untouched; a conflict says the settings changed on disk, and the checkbox shows the disk's value again. The file is written again with `JSON.stringify` at its own indentation (tab or spaces, else 2) and a trailing newline: keys, their order and values stay, but other formatting does not (an array on one line comes back one item per line).
- **Rendering:** `renderDocument`'s `softBreaks` option is required, so a new caller cannot forget it. A small remark plugin (no new dependency) splits `text` nodes at newlines into `break` nodes and drops the spaces around them, as GitHub does; code, inline code, html, Mermaid and the frontmatter block are never touched. Blocks keep their `data-src`, so Lines and the table of contents are the same on and off.
- **Settings cog:** a fieldset "This Project (shared in .living-doc.json)" with the checkbox and its help, after the Tree's labels and the label filter. The checkbox changes at once; a failed write puts it back.
- **Outside changes:** the agent check reports `.living-doc.json` like any file, and the View reads the settings again.
- **Not done here, for tickets 25 and 26:** the HTML view and Download HTML must pass `softBreaks` from `readSettings` (the option being required makes it hard to forget). For ticket 26: the original writes a `<br>` back as a bare newline when the setting is on and as a hard break when off (`frontend-svelte/src/lib/html-view/blockMarkdown.ts`).
- **Left over:** when a Project with the setting off opens, its first Document can show with line breaks for a moment, until the settings are read. Also the trial in the local Host, on a folder written with the original.
