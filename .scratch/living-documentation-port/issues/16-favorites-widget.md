# 16: Favorites and the Widget

**What to build:** I star Documents as personal favorites per Project (Module storage, at most 200, seeded once from `.living-doc.json`, never written there). The Favorites menu shows current titles, Missing entries with Remove (never removed automatically), reorders by drag and Alt + ↑/↓, closes with Escape; a failed save restores the list with a message. Renames, moves and deletes in the Module update favorites. A Project opens on its top existing favorite when there is no last Document. The Widget lists the Active Project's favorites; a click opens the View on that Document (View params); an unavailable Project shows Reconnect.

**Blocked by:** 09 (Tree: rename and move), 10 (Tree: delete, hide and show, reserved folders, other files)

**Status:** ready-for-human (built in 8dc51e8; awaiting the trial in the local Host)

- [x] Favorite toggle (not on the Folder manifest); seeding once
- [x] Menu with titles, Missing, reorder, Escape
- [x] Favorites follow renames, moves and deletes
- [x] Opening rule uses the top favorite
- [x] Widget lists favorites and opens the View on one; Reconnect when unavailable
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Where things are:** the Favorite toggle is in the Document header (reading an editable Document only: not while editing, not on a Folder manifest). The Favorites menu is a star button at the top of the Tree, beside the Project name: the View has no top bar like the original's. It closes on Escape (focus back on its button), a click outside or its button.
- **Storage:** key `favorites`, Project id → `[{ path, title }]`, paths with `.md`. Seeded on first need from `.living-doc.json` (`id` decoded, `.md` added), kept even when empty, never read again; the file is never written. Removing a Project forgets its favorites.
- **Cascade:** the Project that `projects.open()` returns updates favorites after its own rename, move and remove (favorites live in Module storage, so not in `project`; docs/design.md updated).
- **Titles:** the current title for each favorite. The kept one is used when the Document cannot be read, and its path when the kept title is empty, as the original showed the id. A favorite on a hidden Document is not Missing and can be where the Project opens. A last-opened hidden Document also stays the opening Document; before this, the first Document opened instead.
- **Failed save:** the list comes back with "The favorites could not be saved." unless a later change is already showing. Saves run one after the other. Starring a 201st shows "At most 200 favorites." and changes nothing (the original silently cut the list).
- **Widget:** the Active Project name and its favorites in stored order. Missing ones are greyed and do nothing. Each favorite opens the View with params `project`, `doc`, and the title opens it as it was. A hint shows when there are none, Connect a folder when there is no Project, Reconnect for an Unavailable Project, and a message when a reload fails. A Missing favorite can sit at the top of the Widget; the opening rule skips it.
- **Test change:** `e2e/tree.test.ts` "a Document dropped in the middle of a closed Folder…" now waits for the final Tree order. Once the move also writes favorites, a Tree read can see an earlier order on the way there. It settles on the right order. Not investigated further: probably the 5-second agent-edit check reloading the Tree mid-move.
- **Left over:** the star icon is drawn in both Header and Favorites. Some e2e journeys read the `favorites` storage key to wait for a save.

