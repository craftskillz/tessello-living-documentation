# 16: Favorites and the Widget

**What to build:** I star Documents as personal favorites per Project (Module storage, at most 200, seeded once from `.living-doc.json`, never written there). The Favorites menu shows current titles, Missing entries with Remove (never removed automatically), reorders by drag and Alt + ↑/↓, closes with Escape; a failed save restores the list with a message. Renames, moves and deletes in the Module update favorites. A Project opens on its top existing favorite when there is no last Document. The Widget lists the Active Project's favorites; a click opens the View on that Document (View params); an unavailable Project shows Reconnect.

**Blocked by:** 09 (Tree: rename and move), 10 (Tree: delete, hide and show, reserved folders, other files)

**Status:** ready-for-agent

- [ ] Favorite toggle (not on the Folder manifest); seeding once
- [ ] Menu with titles, Missing, reorder, Escape
- [ ] Favorites follow renames, moves and deletes
- [ ] Opening rule uses the top favorite
- [ ] Widget lists favorites and opens the View on one; Reconnect when unavailable
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
