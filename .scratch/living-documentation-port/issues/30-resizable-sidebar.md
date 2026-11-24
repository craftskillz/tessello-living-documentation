# 30: Resizable sidebar

**What to build:** The sidebar holding the Tree has a fixed width of 16 rem. In a sub-folder that leaves about 18 characters per line, so long Document names are cut even on two lines. The User drags the sidebar's right edge to widen or narrow it. The width is kept as a display preference in the Module's storage, for all Projects, and comes back on the next visit. This is the "sidebar width" part of spec story 29 and of `docs/spec/documents-tree.md` rule 11. The rest of that rule (Show hidden items, Folders open in the Tree) is not part of this ticket.

**Blocked by:** None (can start immediately)

**Status:** done (be0d270, 1d3e6f4)

- [x] A handle on the sidebar's right edge (a `separator` with a translated accessible name, `col-resize` cursor, visible on hover) resizes it while dragged, and the Document area takes the rest
- [x] The width stays between 200 and 600 px, rounded to whole pixels; the default is today's 16 rem (256 px)
- [x] The width is kept in `DisplayPreferences` (storage key `display`, like the table of contents' width), written once on release, and is the same on the next visit; a malformed kept value gives the default; unit-tested in `test/projects.test.ts`
- [x] Dragging works over the whole window (pointer events on `window`, as `Toc.svelte` does) and does not select text, start a drag of a Tree row or open a Document
- [x] The table of contents' own resize still works (its test drags across the sidebar)
- [x] Light and dark themes; White background unaffected
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [x] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder)

**From the original** (`../living-documentation/src/frontend-svelte/src/lib/home/Sidebar.svelte`): a 6 px handle on the right edge, 200 to 600 px, default `w-72` (288 px), kept in `localStorage`. Here it is kept in the Module's storage instead (no `localStorage` in the Host's sandbox), and the default stays at today's width.

**Notes for the agent:**
- Today the layout is `.layout { grid-template-columns: 16rem 1fr }` in `src/view/View.svelte`. The width can become a CSS variable on `.layout`.
- Follow how the table of contents' width works: `TOC_WIDTH` and `clampTocWidth` in `src/lib/projects.ts`, and the handle in `src/view/Toc.svelte`. A shared clamp helper is welcome if both read better for it.
- Do not add a background-colour transition on Tree rows or on the handle under the moving pointer. Ticket 29 found that one delayed a storage write enough for an immediate reload to lose it (`e2e/header.test.ts`, the TOC width test).
- Optional, if cheap: arrow keys on the focused handle move the width by 16 px. The table of contents' handle has no keyboard resize today, so say in the Comments whether you added it to both or to neither.

Spec: `.scratch/living-documentation-port/spec.md` (story 29). Read `GLOSSARY.md` and `docs/spec/documents-tree.md` first ("Tree" is the structure, "sidebar" the screen area).

## Comments

- **Handle:** `src/view/ResizeHandle.svelte`, shared by the sidebar and the table of contents (drag on `window`, clamp, keys, `aria-valuenow/min/max`, hover and focus look, no background transition). The sidebar's handle is a sibling placed after the `nav`, positioned at `calc(var(--sidebar-width) - 3px)` on `.layout`, so it does not scroll with the Tree and the Tree comes first in the tab order. `clampWidth(width, bounds)` in `src/lib/projects.ts` is the shared clamp; `SIDEBAR_WIDTH` and `clampSidebarWidth` mirror the TOC's.
- **Keyboard:** added to both handles. ArrowRight widens the sidebar, ArrowLeft widens the table of contents (its handle is on its left edge), by 16 px; each key press is written. The handles are focusable separators; Svelte's a11y lint counts every separator as static, so its two warnings are silenced on the handle with the reason.
- **Writes:** `setDisplay` now chains its writes, so key presses in a row are kept in order (otherwise an older width could land last). This applies to every display preference, not only widths. While a width write is pending, the View shows the pending width.
- **Differs from before:** a click on a handle with no movement writes nothing (the TOC used to write its unchanged width).
- **Fixed after the first commit (with ticket 31):** a pending width was cleared by comparing widths, so 272, 288, 272 by the keys cleared it when the first 272 was kept and 288 showed until the last write landed (the arrow-keys e2e failed once in a full run). A counter of writes now clears it only after the last one.
- **Left over:** the trial in the local Host (dark theme, White background, hover look of the handle).
