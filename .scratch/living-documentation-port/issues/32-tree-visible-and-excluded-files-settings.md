# 32: Project settings: files shown in the Tree and entries excluded

**What to build:** Two Project settings, kept in `.living-doc.json` and changed from the Project settings dialog (`src/view/ProjectSettings.svelte`, "shared" section), each with its default value.

1. **Files shown by default**: the extensions of other files (not Documents) that the Tree shows without **Show hidden items**. Default: the images (`png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, `avif`, `bmp`, `ico`), `pdf` and `txt`. Every other file stays shown only with **Show hidden items**, as today (`docs/spec/documents-tree.md` rule 9).
2. **Excluded entries**: names of folders or files, matched at any depth, that the Tree treats as hidden. They are left out like a hidden entry and shown greyed and italic with **Show hidden items**. Default: `.git`, `node_modules`, `.DS_Store`. Today only `.DS_Store` is left out, in the code, and a `.git` folder at the Project root shows as a Folder.

Decided with the User (2026-11-26): the lists are per Project, shared through `.living-doc.json` with the team and the agents, not personal preferences; excluded entries appear with **Show hidden items**, as hidden entries do.

**Blocked by:** None (can start immediately)

**Status:** done (bd79a5a, c4cd225, e72bf4a)

- [x] Two new keys in `.living-doc.json`, for example `treeShownExtensions` and `treeExcluded` (string arrays; the original ignores keys it does not know). Missing key, malformed file, or a value that is not an array of strings gives the default. An empty array is kept as written: nothing shown by default / nothing excluded. Extensions compared without the dot and ignoring case; names compared exactly. Unit-tested in `test/projectSettings.test.ts`
- [x] The Tree (`Project.tree`): other files with a shown extension appear at the end of their Folder without **Show hidden items**, and open in the other-file preview as today (ticket 10). Excluded entries are left out without **Show hidden items** and flagged hidden with it. An excluded Folder's content is not listed or read without **Show hidden items**. Unit-tested on the Test Host disk
- [x] Excluded entries are also left out of the full-text search, the Types list and the Documents counted as linking to a deleted entry. Deleting a Folder still counts and removes everything in it, excluded entries included
- [x] `images/` and `files/` follow the same rules: with the defaults, pasted images and PDF or text Attachments show in the Tree without **Show hidden items**
- [x] Project settings dialog: in the shared section, one field per list, comma-separated (`png, jpg, pdf`), with a hint giving the default and a **Restore defaults** button. Each change writes only its key, version-checked, leaving the rest of `.living-doc.json` as written (`changeSetting`); a failed write shows a translated message and the field goes back; the Tree refreshes at once
- [x] A change to `.living-doc.json` made outside the Module (an agent, a teammate's commit) is picked up like any other agent edit
- [x] `docs/spec/documents-tree.md` rule 9 updated, and a new rule for the two settings; `GLOSSARY.md` if a new term is needed
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [x] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder), on a Project inside a git repository

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs (0003: on-disk format) and `docs/spec/documents-tree.md` first. Prior art: ticket 31 (`markdownSoftBreaks`, `src/lib/projectSettings.ts`), ticket 10 (hidden items, other files). Tests at the five seams of the spec's Testing Decisions.

## Comments

- Keys: `treeShownExtensions` and `treeExcluded` (string arrays). Extensions are read and written without the dot, lower-cased; names exactly, trimmed. A missing or invalid value gives that list's default, independently of the other; an empty list is kept.
- `Project.setVisibility` is called by the View when the settings are read (before the first Tree, so no flash of the default Tree) and when they change; `Project.isExcluded` is what search asks.
- With **Show hidden items**, every other file the Tree shows only because of it is flagged hidden and greyed: an excluded one, or one whose extension is not shown (`data.csv`). Before, every other file was greyed.
- Excluded entries go further than the ticket's list: their Documents are never read for Links (a rename or move does not rewrite them, a delete does not unlink them), nor for Types, nor searched even with Show hidden items; changes inside them are not agent edits (`check()`), so with Show hidden items on, a new file under `.git/` shows at the next Tree reload, not at once. Reason: `.git` and `node_modules` can hold thousands of files and are not documentation.
- Inside an excluded Folder shown with Show hidden items, the children are not greyed themselves, as for a Folder hidden through its manifest (unchanged behavior).
- A dotfile such as `.gitignore` has the extension `gitignore`. `liv-doc-main.md` cannot be excluded (it stays the Folder manifest).
- **Restore defaults** (one per field) writes the default list explicitly into `.living-doc.json`, it does not remove the key: a later change of the defaults will not reach that Project.
- The open other-file panel closes when its file leaves the Tree (a setting change or Show hidden items turned off), no longer every time Show hidden items is turned off.
- `e2e/tree.test.ts`: two tests follow the new defaults (`notes.txt` shown without Show hidden items; the svg preview test puts its file in `node_modules/`).
- After the trial: the Project settings dialog was widened and laid out in columns with grey rules between its zones (c4cd225, e72bf4a), checked by screenshots. A click anywhere on a Tree row now opens its entry (ef6a6a1). Not done: no e2e for `treeShownExtensions` changed by an agent (the same path as `treeExcluded`, which is tested).
- Review judgement calls left: the two settings fields in `ProjectSettings.svelte` and the failure ladder of `changeVisibility` / `changeSoftBreaks` in `View.svelte` are duplicated in shape.
