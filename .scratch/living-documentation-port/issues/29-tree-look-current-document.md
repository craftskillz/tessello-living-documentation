# 29: Tree: look and current Document

**What to build:** The Tree is plain to look at, and the open Document is not distinct enough. Restyle the Tree so it reads as one clear list. The open Document stands out at a glance: accent background, a bar on its left edge and bold text. It is scrolled into view when it opens, from a link, a favorite or the Widget. Folders and Documents get their own icons and an open/closed chevron, with even spacing, indentation guides for depth, a hover state and a visible keyboard focus. All of this works in light and dark themes. Hidden entries keep their greyed italic look, and so do the Folder manifest and other files under Show hidden items. Behavior stays as it is, except for the titles-or-file-names choice below.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human (built in d997354; awaiting the trial in the local Host)

- [x] The open Document is unmistakable (background, left bar, bold), and `aria-current="page"` stays on it
- [x] It is scrolled into view when it opens from outside the Tree (link, favorite, Widget, deep link)
- [x] Icons for Folders and Documents, open/closed chevron, indentation guides, hover and focus states
- [x] Light and dark themes; White background unaffected; hidden entries and other files keep their distinct look
- [x] A settings cog in the Document header chooses file name or title for the Tree's Documents, kept as a display preference (default: file name); with titles, the file name is the tooltip; every text in English and French
- [x] A label filter in the cog (pattern + replacement, per Project, display only): `2026_04_11_13_25_crer_vos_dossiers` can show as `crer_vos_dossiers`; an invalid pattern is refused with a message; a blank result falls back to the label; tooltip shows the full name; unit-tested as a pure function with worked examples
- [x] Drag and drop feedback (before/after/into) still reads clearly on the new rows
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); the User agrees with the look

**Titles or file names (decided by the User, 2026-11-24):** a settings cog (⚙) goes in the Document header, beside Copy path, Lines and the other display buttons. It opens a small menu where the User chooses what the Tree shows for each Document: its **file name** (the default, as in the original) or its **displayed title**. The choice is a display preference kept in the Module's storage (`DisplayPreferences`, for all Projects, like Show hidden items). With titles, the row's tooltip shows the file name. Folders, Folder manifests and other files always show their names. The Tree's order does not change.

**Label filter (decided by the User, 2026-11-24):** a second setting in the same cog. It is a **pattern** (a JavaScript regular expression) and a **replacement**, empty by default. Together they rewrite the label each Tree row shows for Documents and Folders, whether the label is a file name or a title. Example: pattern `^\d{4}(_\d{2}){4}_` with an empty replacement shows `2026_04_11_13_25_crer_vos_dossiers` as `crer_vos_dossiers`. The rules:
- The replacement may use `$1`-style groups.
- The pattern replaces every match (flag `g`).
- Only the display changes: names on disk, Links, order, drag and drop, the header path and Copy path are untouched.
- The tooltip shows the full name.
- When the result is empty or blank, the original label shows.
- An invalid pattern shows a translated message under the field, is not kept, and changes nothing.
- It is kept per Project in the Module's storage, because naming habits belong to a Project. It is not written to `.living-doc.json`.
- Search (ticket 11) still matches the real names and titles.

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md` and `docs/spec/documents-tree.md` first. Look at the original's Tree (`../living-documentation/src/frontend-svelte/`) for reference; this ticket does not have to copy it. Code: `src/view/Tree.svelte`, the Tree styles in `src/view/View.svelte`, `src/lib/base.css`.

## Comments

- **Look:** rows are a grid (chevron or spacer, then icon and label); indentation guides are a line under each Folder; hover tint, a focus ring around the whole row; the open Document (and an open Folder manifest) gets an accent tint, a 3px bar on its left edge and a bold label. Folder icons switch between closed and open with the chevron. The date stays under the label on one line (cut with an ellipsis). Hidden entries, the Folder manifest (🔒) and other files keep their grey italic look. No background-colour transition on rows: it delayed a storage write enough for a reload right after a TOC resize to lose it (`e2e/header.test.ts`).
- **Scroll into view:** done after every successful open (`revealInTree` in View): any closed Folder around the Document is opened first, then its row is scrolled into view (`block: "nearest"`, so a click in the Tree does not move it). Only the link case has its own e2e; favorites, the Widget and the start Document go through the same `show()`.
- **Drag and drop:** rows also accept on `dragenter` (the pointer can cross from a row's padding into its link with no `dragover` in between). The existing before/after/into tests pass on the new rows.
- **Titles:** `TreeDocument.title` comes from the read the Tree already does for the dates (no extra read, one more parse per Document).
- **Settings cog:** `src/view/Settings.svelte`, beside the Table of contents button; Escape or a click outside closes it. Titles or file names is `DisplayPreferences.treeLabels`; the label filter is kept per Project under the storage key `labelFilters` and forgotten with the Project. A valid pattern applies at each keystroke; an invalid one shows its message and keeps the last valid filter.
- **Not asked, fixed on the way:** `show()` ignores a read that finishes after another Document was asked for (a click while the start Document was still loading could show the wrong text).
- **Left over:** "label" and "label filter" are not in GLOSSARY.md yet (the review noted "Labels" is an Avoid word for Tags).

