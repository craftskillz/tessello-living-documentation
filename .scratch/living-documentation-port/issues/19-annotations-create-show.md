# 19: Annotations I: create and show

**What to build:** In the reading view of an ordinary Document I select a passage and add a note, stored in the Project's `.annotations.json` (compatible with the original, no author). Annotations are placed only where passage and surroundings match; else, when the passage occurs once, placed and marked "surrounding text changed" (orange); else orphans (red), never attached to a guess. The Marker cycles Normal → Active → Hidden (Normal and Hidden remembered). Column buttons show the note on hover and scroll on click. Not in the section preview, the Folder manifest, Kanban boards or the HTML view. A blank note keeps Save disabled.

**Blocked by:** 01 (Reading: links, images and the document stylesheet)

**Status:** ready-for-agent

- [ ] Create an annotation; the file stays compatible with the original
- [ ] Placement rules with orange and red states
- [ ] Marker states remembered as specified
- [ ] Column buttons: hover shows, click scrolls
- [ ] Absent where the spec says
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
