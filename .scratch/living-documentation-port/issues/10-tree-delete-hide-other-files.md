# 10: Tree: delete, hide and show, reserved folders, other files

**What to build:** Deleting a Document (Tree or header) confirms with the number of Documents linking to it; deleting a Folder confirms with counts by kind and incoming links; those links become plain text; deletion is permanent. Entries can be hidden and shown (Folder manifest), hidden ones keeping Show, Rename and Delete. `images/` and `files/` are reserved (no rename, move or delete). Show hidden items reveals other files: images and videos previewed, text up to 1 MB shown, anything else offered as Download.

**Blocked by:** 09 (Tree: rename and move)

**Status:** done (7ba73e6)

- [x] Delete Document and Folder with the counts; incoming links become plain text
- [x] Hide and Show through the manifest; hidden entries keep their menu
- [x] `images/` and `files/` cannot be renamed, moved or deleted
- [x] Other files previewed or downloadable with Show hidden items
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [x] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Delete** from the entry menu (Documents and Folders, hidden ones included; the original deleted only Folders from the Tree) and from the header for the open Document. The dialog is shown after `deletion()` counted: a Folder's Documents, images and other files at any depth (manifests and `.DS_Store` not counted; "It is empty." when nothing), and the Documents outside it with a Link into it. Links become their text and reference definitions to it are dropped, as the original's `unlinkDeletedLinks` (images kept; `[text][ref]` uses, autolinks and inline code are not handled, as the original). The file is deleted first, then the manifest and the links are updated one by one, each version-checked and retried once; a failure partway is shown but not rolled back.
- **After a delete** of the open Document (or its Folder) the next Document of the Tree opens, else the one before, else "Choose a document in the Tree." (the original cleared `?doc`). Favorites follow with ticket 16.
- **Hide / Show** write the parent manifest's `hidden` (a manifest is created when the Folder has none). The menu is Hide or Show, Rename, Move to…, Delete for every Document and Folder; `images` and `files` at the root offer Hide/Show only.
- **Reserved:** besides no rename, move or delete of `images`/`files`, a Folder cannot be created, renamed or moved to those names at the root, and nothing can be created or moved into them (R8 and the original's server refusals); they are left out of the Location and Destination lists. A file inside them can still be deleted or moved out.
- **Show hidden items** (eye toggle, kept in the Module's storage for all Projects) shows hidden entries greyed and italic, each Folder's manifest first (🔒, opens read-only, no menu, no drag) and other files last.
- **Other files:** image and video from a blob URL, text in a plain `<pre>` without syntax colors or line numbers (the original had both), "⚠ Truncated at 1 MB" above files over 1 MiB, anything else "This file cannot be shown here." with **Download** (an `<a download>` made in script with a blob URL, never in the markup: check it in the Host's sandbox). A later click wins; opening a Document or turning Show hidden items off closes the panel.
- `Project.readImage` is now `readBytes`. Plurals go through `tn()` (`Intl.PluralRules`).
- **Tried in the local Host** by the User (2026-11-24): works.
