# 29: Tree: look and current Document

**What to build:** The Tree is plain to look at, and the open Document is not distinct enough. Restyle the Tree so it reads as one clear list. The open Document stands out at a glance: accent background, a bar on its left edge and bold text. It is scrolled into view when it opens, from a link, a favorite or the Widget. Folders and Documents get their own icons and an open/closed chevron, with even spacing, indentation guides for depth, a hover state and a visible keyboard focus. All of this works in light and dark themes. Hidden entries keep their greyed italic look, and so do the Folder manifest and other files under Show hidden items. Behavior stays as it is, apart from what the open question below may change.

**Blocked by:** None (can start immediately)

**Status:** needs-triage

- [ ] The open Document is unmistakable (background, left bar, bold), and `aria-current="page"` stays on it
- [ ] It is scrolled into view when it opens from outside the Tree (link, favorite, Widget, deep link)
- [ ] Icons for Folders and Documents, open/closed chevron, indentation guides, hover and focus states
- [ ] Light and dark themes; White background unaffected; hidden entries and other files keep their distinct look
- [ ] Drag and drop feedback (before/after/into) still reads clearly on the new rows
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); the User agrees with the look

**Open question (for the User, at triage):** should the Tree show each Document's displayed title instead of its file name? The original showed file names. Slice 1 lists file names as a known gap. Titles would change what the Tree shows, what search (ticket 11) matches in the Tree, and how browser tests find rows.

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md` and `docs/spec/documents-tree.md` first. Look at the original's Tree (`../living-documentation/src/frontend-svelte/`) for reference; this ticket does not have to copy it. Code: `src/view/Tree.svelte`, the Tree styles in `src/view/View.svelte`, `src/lib/base.css`.
