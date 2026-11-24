# 31: Project setting: every newline is a line break

**What to build:** A Project setting, "Treat every newline as a line break", kept in `.living-doc.json` under the original's key `markdownSoftBreaks`. When it is on, a single newline in a Document's source is rendered as a line break (`<br>`), as GitHub does in comments. When it is off, the rendering is plain CommonMark: two adjacent lines merge into one paragraph, and a line break needs two trailing spaces or `<br/>`. When the key is missing or is not a boolean, the setting is **on**, as in the original's code. The original's help text says the default is off, but its `config.ts` default is `true`, so existing folders were rendered with line breaks. The User edits it in the Project settings panel, as a checkbox with the help text below. It applies wherever a Document is rendered: the reading view, the editor's preview, and the HTML view and its download (tickets 25 and 26). This is spec story 107 and `docs/spec/documents-reading-and-editing.md` rule 17.

**Blocked by:** 12 (Projects and Project settings)

**Status:** ready-for-agent

- [ ] `markdownSoftBreaks` read from `.living-doc.json`: `true` or `false` as written; missing, malformed file or not a boolean gives `true`; unit-tested
- [ ] On: a single newline inside a paragraph, list item, blockquote or table cell renders as `<br>`; never inside code blocks, inline code, Mermaid or front matter; unit-tested in `test/render.test.ts`
- [ ] Off: plain CommonMark (today's rendering); two trailing spaces and `<br/>` still break the line
- [ ] Source line numbers (Lines) and the table of contents are unchanged by the setting
- [ ] Project settings panel: a checkbox "Treat every newline as a line break" with the help text; saving writes only this key, leaving the rest of `.living-doc.json` as written; the open Document re-renders at once
- [ ] A change to `.living-doc.json` made outside the Module (an agent, a teammate's commit) is picked up like any other agent edit
- [ ] The HTML view and Download HTML follow the setting; if ticket 25 or 26 is already done, follow it there too, otherwise note it in the Comments for whichever comes later
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder), on a folder written with the original

**From the original:**
- `src/lib/config.ts`: `markdownSoftBreaks: boolean`, default `true` (line 181).
- `frontend-svelte/src/routes/Admin.svelte`: the checkbox under Appearance.
- i18n keys `admin.appearance.soft_breaks_label` and `admin.appearance.soft_breaks_hint` in `frontend-svelte/public/i18n/en.json` and `fr.json`. Reuse their wording, but drop "(default)" from the "Unchecked" line, since checked is the default.
- It is applied with marked's `breaks` option in `routes/htmlTemplates.ts` and `routes/export.ts`, and in `SectionEditor.svelte`'s preview.
- In the HTML view's editing, `frontend-svelte/src/lib/html-view/blockMarkdown.ts` writes a `<br>` back as a bare newline when the setting is on, and as a hard break otherwise. This matters for ticket 26.

**Notes for the agent:**
- The renderer is unified/remark (`src/lib/render.ts`, `renderDocument`); today it has no line-break option. `remark-breaks` does exactly this, as a remark plugin. Check that it keeps the source positions Lines relies on (`src/view/lines.ts`), or write the small equivalent plugin (split `text` nodes on `\n` into `break` nodes).
- The setting is Project-wide and shared with the team (it lives in the repository), unlike `DisplayPreferences`, which are personal and kept in the Module's storage. Do not put it in `DisplayPreferences`.
- Read aloud (ticket 27) already splits sentences at line breaks in the source; nothing to change there.

Spec: `.scratch/living-documentation-port/spec.md` (stories 11 and 107). Read `GLOSSARY.md`, ADR 0003 (on-disk format compatible with the original) and `docs/spec/documents-reading-and-editing.md` first.
