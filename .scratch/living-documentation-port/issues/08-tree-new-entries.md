# 08: Tree: new Document and new Folder

**What to build:** From the Tree I create a Document by typing one Name (`<Name>.md`, frontmatter with `timestamp` only, then `# <Name>`) or a Folder, with the naming rule (refused: empty, `/ \ : * ? " < > |`, leading or trailing space or dot, `liv-doc-main.md`, a name differing only by case from a sibling) and a live preview of the path. New entries are appended to a custom-ordered Folder's manifest. The Tree shows each Document's creation date, else its modified date; changes in a Folder whose manifest is invalid are refused with a message.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] New Document and new Folder with the naming rule and path preview
- [ ] Appended to the manifest order when the Folder has a custom order; manifest otherwise untouched
- [ ] Tree shows creation, else modified dates
- [ ] Refused in a Folder with an invalid manifest
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
