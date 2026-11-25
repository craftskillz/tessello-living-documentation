# 07: Pasted or dropped Images and files

**What to build:** In the editor, a pasted or dropped image asks for a name (a timestamp proposed, refused characters as in the Tree, `<name>-2` proposed when taken), is saved in `images/` without ever overwriting, and its link is inserted at the paste or drop point; other dropped files go to `files/`. Both folders are created only when first needed.

**Blocked by:** 06 (Editing, complete)

**Status:** ready-for-human (built in fff6370; awaiting the trial in the local Host)

- [x] Pasted and dropped images saved in `images/` under the confirmed name; never overwrite (create-only write)
- [x] Other files saved in `files/`
- [x] The relative link is inserted at the point of paste or drop
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- Seams: `src/lib/pasted.ts` (pure: proposed name, free name, extension, link), `Project.fileNames` / `Project.addFile` (create-only write; Refused "taken" also on a write conflict), `Editor.svelte`'s `onfiles` (the paste or drop point is followed through any typing until the link comes back), the name dialog in `View.svelte`.
- The proposed name is the local time `YYYY-MM-DD_HH-mm-ss` (colons are refused by the Tree's rule). The image's extension comes from its type (png, jpg, gif, webp, svg, avif, bmp), else from its file name, else png; it is shown after the field.
- The image link's text is the chosen name, `![name](images/name.png)`, relative to the Document (the original wrote `![image](/images/…)`). An Attachment's link is `[📎 notes.txt](../files/notes.txt)`. Spaces, `(`, `)` and `%` in the path are escaped.
- An Attachment is saved without a prompt: its refused characters become `_`, and when its name is taken the first free `<name>-2`, `-3`… is used (the original replaced files silently). A `.md` file dropped into `files/` is saved as an Attachment.
- Several files in one paste or drop are handled in order, one name dialog per image; their links are inserted one per line. Cancel skips only that image.
- No size limit (the original refused files over 200 MB); a very large file is read whole into memory.
- New glossary term **Attachment** (the files in `files/`); the code that handles both never calls an Image an attachment.
- If the editor closes while a link is awaited (the dialog is modal, so only by an outside event), the file stays saved and no link is inserted.
- Not done: the screenshot of the dialog beside the cog panel (docs/ui.md); no e2e for a failed write (the failure toast is translated, `imageSaveFailed` / `fileSaveFailed`).
- To try in the local Host: paste a screenshot from the system clipboard and drop a file from Finder in the srcdoc frame (the e2e builds the events itself).
