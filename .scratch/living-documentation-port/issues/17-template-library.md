# 17: Template library

**What to build:** Each Project has a template library as Markdown files in `.templates/<folder>/<name>.md`, hidden from the Tree (ADR 0006); a Project holding `.document-templates.json` is offered Convert to files once (the JSON left untouched). The library screen (a View state) and the header Templates menu create, rename, duplicate (`<name> copy`, `<name> copy 2`), move and delete templates and folders (naming rule of the Tree), search by name and content ignoring case and accents, edit like Documents (autosave once named, Revert, conflict banner) and preview resolving images and links from the template's location.

**Blocked by:** 06 (Editing, complete)

**Status:** ready-for-agent

- [x] Templates as files under `.templates/`; Convert to files once
- [x] Library screen and Templates menu with all actions
- [x] Editing like Documents; preview resolves images and links
- [x] Search by name and content
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- `src/lib/templates.ts` keeps the library over `Project` (new `Project.entries(under)` to list `.templates/`); the Tree never shows `.templates/`, with or without hidden items. A template Folder is kept on disk by its Folder manifest, as Tree Folders are.
- The Templates menu sits in the sidebar's tool row beside Favorites (the View has no top bar); it lists, searches (name and content) and opens the library. Clicking a template opens the library on it: ticket 18 turns this into New document from it.
- The library screen replaces the sidebar and the Document (a View state). New template writes `# <name>` at once and opens the editor (it then has a name, so autosave applies); Duplicate writes the copy at once. Revert goes back to the text when Edit was clicked, without a confirmation, like Documents.
- Convert to files is offered while `.document-templates.json` exists and `.templates/` does not. Names the Tree's rule refuses are made acceptable (refused characters → `_`, edges trimmed, empty → Template/Folder, taken → " 2"…). Leftover: a legacy library with no folder writes nothing, so the offer stays.
- Search reads each template at each query (no index): fine for small libraries.
- Not yet tried in the local Host.
