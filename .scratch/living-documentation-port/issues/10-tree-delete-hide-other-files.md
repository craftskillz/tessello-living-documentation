# 10: Tree: delete, hide and show, reserved folders, other files

**What to build:** Deleting a Document (Tree or header) confirms with the number of Documents linking to it; deleting a Folder confirms with counts by kind and incoming links; those links become plain text; deletion is permanent. Entries can be hidden and shown (Folder manifest), hidden ones keeping Show, Rename and Delete. `images/` and `files/` are reserved (no rename, move or delete). Show hidden items reveals other files: images and videos previewed, text up to 1 MB shown, anything else offered as Download.

**Blocked by:** 09 (Tree: rename and move)

**Status:** ready-for-agent

- [ ] Delete Document and Folder with the counts; incoming links become plain text
- [ ] Hide and Show through the manifest; hidden entries keep their menu
- [ ] `images/` and `files/` cannot be renamed, moved or deleted
- [ ] Other files previewed or downloadable with Show hidden items
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
