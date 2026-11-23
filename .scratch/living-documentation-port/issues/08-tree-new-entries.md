# 08: Tree: new Document and new Folder

**What to build:** From the Tree I create a Document by typing one Name (`<Name>.md`, frontmatter with `timestamp` only, then `# <Name>`) or a Folder, with the naming rule (refused: empty, `/ \ : * ? " < > |`, leading or trailing space or dot, `liv-doc-main.md`, a name differing only by case from a sibling) and a live preview of the path. New entries are appended to a custom-ordered Folder's manifest. The Tree shows each Document's creation date, else its modified date; changes in a Folder whose manifest is invalid are refused with a message.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human (built; awaiting the trial in the local Host)

- [x] New Document and new Folder with the naming rule and path preview
- [x] Appended to the manifest order when the Folder has a custom order; manifest otherwise untouched
- [x] Tree shows creation, else modified dates
- [x] Refused in a Folder with an invalid manifest
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Host change:** the Host gave no modified time, so `files.list` file entries now carry `modified` (ms since the epoch): `../tessello` branch `feat/folder-files-capability`, commit 61d9700 (SDK, Test Host, host-core, Convention §6.5, ADR 0022), not pushed. Rebuild the local Host (`npm run start:host`) before the trial.
- **Dates:** a `timestamp` is shown as written (to the minute, no time-zone conversion, as the original); new Documents get `toISOString()` (UTC), so their time shows in UTC, as in the original. Without a timestamp that reads as a date, the file's modified time in the reader's time zone. `tree()` now reads every Document for its timestamp.
- **A Document Name ending in `.md`** (any case) is refused ("Type the name without .md: it is added for you."), the User's choice over `x.md.md`. A Folder name may end in `.md`.
- **Icons:** Lucide's file-plus and folder-plus (ISC licence), inline SVG.
- **New Document opens** after creation (as the original); a new Folder is shown open in the Tree.
- **Clashes (accepted by the User):** the dialog checks the name live against what the Tree shows; a clash with a hidden or non-Markdown file is refused by the Project on Create, with the same message in the dialog.
- **Manifest changed meanwhile:** if an agent changes the parent manifest between our read and write, the entry is created but not appended to the order (no message).
- **Not here:** `images` and `files` at the Project root are not refused as Folder names yet (reserved folders: ticket 10). A non-refusal failure shows the generic translated message with the raw reason as a detail.
- **`tessello validate`:** installable, with 3 sandbox warnings in `view/app.js` (localStorage, sessionStorage, embedded frame), from bundled libraries, not from this ticket.
