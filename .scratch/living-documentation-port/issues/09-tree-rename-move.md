# 09: Tree: rename and move

**What to build:** I rename and move Documents and Folders from menus and by drag and drop (zones and timing as the original). Relative links in other Documents, and inside a moved Document, are rewritten; Folder manifests keep the entry's place under its new name or append it at its destination; a name collision is refused. Folder moves go file by file through the Host.

**Blocked by:** 08 (Tree: new Document and new Folder)

**Status:** done (0e40d23)

- [x] Rename and move of Documents and Folders, from menus and drag and drop
- [x] Links elsewhere and inside moved Documents rewritten
- [x] Manifests updated (renamed in place, appended at the destination)
- [x] Collisions refused with a message
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [x] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Move to…** is a new entry-menu item (the original moved only by drag and drop): a dialog with a Destination (not the entry's own Folder, nor a Folder's own sub-folders), the resulting path and a live name-taken check. The menu opens by right-click, the ContextMenu key or Shift+F10 (on `keydown`: some platforms fire no `contextmenu` for the key); Hide/Show and Delete come with ticket 10.
- **Drops:** before/after a sibling write the destination's `order` with the entry there, counting hidden entries (R11); a Folder without a manifest gets one. A drop *inside* a Folder appends to its custom order only (the original wrote a full order even into a Folder that had none); a drop that changes nothing writes nothing. A Folder dropped into itself or one of its sub-folders shows "Could not move" with the reason.
- **Hidden entries:** a moved entry leaves its source's `order` and `hidden`; at the destination it is visible (as the original). A rename keeps its place in `order` and `hidden`.
- **Case-only rename** goes through a temporary name `<new>.liv-doc-renaming` in the same Folder (a case-insensitive disk takes `a → A` for an existing destination).
- **Writes:** every link rewrite and manifest change is version-checked; on a conflict (an agent wrote meanwhile) it is re-read and retried once, then the failure is shown. `check()` no longer reports the old paths of a move, nor the Module's own rewrites, as agent edits.
- **Open Document:** before a rename or move its autosave is flushed and editing ends (link rewriting may change it); if the flush fails, the dialog closes and nothing happens. It then stays open at its new path, re-read; the back trail and closed Folders follow.
- **Messages:** a collision shows the existing "taken" text, not the original's "…already exists there"; new: invalid manifest for a change, into itself, missing entry or destination. "Could not move “x.md”." names the entry as the Tree shows it.
- **Links:** port of the original's rewriting (inline links, images, reference definitions, `?doc=`, absolute `/` links; fenced code untouched). As the original, a link written with a raw space or `<…>` is not rewritten.
- **Not here:** `images`/`files` at the root are not protected yet (ticket 10); favorites and annotations follow with tickets 16 and 19/20.
- **Tried in the local Host** by the User (2026-11-24): works.
