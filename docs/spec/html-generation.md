# HTML generation

Atlas page: `features/html-generation.md` (business rules R1–R12). Atlas answers: Q-019, Q-079 to Q-084. Rules of the original not changed here are kept.

## Scope

1. One Document presented with an HTML template, and the HTML view. No folder HTML ZIP export (Q-019).
2. Two built-in templates: **Interview sheet** (`interview-sheet`) and **Article** (`article`). No custom HTML templates, no dark version, no relation to the Template library in v1.

## Choosing a template

3. **Generate as HTML** (or the current template name) in an ordinary Document's header opens the template dialog. Not on the Folder manifest.
4. Choosing writes only the `html_template` field, in place, version-checked. Invalid Frontmatter refuses it: "Fix the frontmatter first".
5. An unknown `html_template` value stays in the file. The header shows **Generate as HTML**; the dialog notes "Unknown template '<x>' in this document"; the HTML view shows a translated message with **Choose a template**.

## HTML view

6. A route inside the View, `#/p/<projectId>/html/<path>`, with **← Document**. The generated page renders in a shadow root with the template's CSS; the Document's own scripts never run.
7. Structure as in the original (R6): title, lead, `##` sections, table of contents with anchors. Directives (ADR 0005) and Tag markers render as in the reading view.
8. In-place editing: double-click on paragraphs and headings 2–4 edits text; on code, lists, quotes and tables edits Markdown (R9–R11). Saves are version-checked (R12); the scroll position is kept.
9. Right-click opens the section editor on that section; on the lead, only the lead (after the `#` title, before the first `##`).
10. Links: a target with a known HTML template opens in its HTML view, else in its reading view; both stay in the View and Back returns.
11. **Download HTML**: one standalone `.html` file, template CSS inlined, images embedded. This is also the way to print (no printing in v1). The page and the file take the Project's table colours (`colorPalette`, documents-snippets.md rule 12), in their light form.
12. Annotations are not shown in the HTML view (Q-060).
