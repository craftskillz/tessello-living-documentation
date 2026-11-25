# 12: Projects and Project settings

**What to build:** I switch between Projects, connect more, remove one (files untouched), and reconnect unavailable ones. A folder overlapping an existing Project is refused (design to settle first: the Host checks containment only at request time with `mustContain`). A Project settings panel edits `.living-doc.json` (created lazily). Project settings › Connect repository grants the repository containing the Project folder (refused otherwise), for Versions.

**Blocked by:** None (can start immediately)

**Status:** done (12c940b, bd44fdb; Host ../tessello bb8aca1)

- [x] Project switcher: switch, connect, remove, reconnect
- [x] Overlap refused (decision recorded in an ADR)
- [x] Project settings panel over `.living-doc.json`, created only when a setting is saved
- [x] Connect repository refuses a folder that does not contain the Project folder
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [x] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- **Overlap (ADR 0010):** refused by the Host, not the Module: `folders.request({ mustNotOverlap })` in `../tessello` (branch `feat/folder-files-capability`, commit bb8aca1, not pushed; Convention §6.5 and ADR 0022 updated). The refusal `overlapping` carries the clashing folder's id in a new optional `folder` field of protocol errors, so the message names the Project. **Rebuild the local Host before trying.** Choosing the folder of an existing Project is now refused too (it used to switch to it).
- **Click rule:** `connect()` sends its request without reading the storage first, from the Project folders it last read (the View lists them on load). Called on a fresh `Projects` before any read, it would not refuse an overlap; the View never does that. To check in the Host: the Host itself reads its grants before opening the picker, for `mustNotOverlap` as for `mustContain`.
- **Panel:** opened from the switcher (Project settings…). Repository: Connect repository (refused when the folder does not hold the Project folder), its name, Disconnect (not asked for, but the only way to change it). The Repository grant is kept per User in the Module's storage, not in `.living-doc.json`. Shared section: the line-break checkbox (also in the cog); Tag names come with ticket 13. A grant is given back only when no other Project uses it as its folder or repository (two Projects in one repository share one grant; a repository can be the Project folder itself).
- **Removing the Active Project** opens the first available Project left, else an unavailable one (its screen), else the welcome screen. The unavailable screen has the switcher too, so the User is never stuck.
- **Left over:** an unavailable repository (after a browser restart) shows "(unavailable)" with Disconnect only; Reconnect for it belongs with Versions (ticket 23). If the open Document cannot be saved when connecting a folder, the new Project stays listed but the open one stays Active. `tessello validate` gives the same 3 warnings as before (from bundled libraries). The trial in the local Host.
- **After the first look in the Host (2026-11-25):** the sidebar shows the whole Project name (it wraps), with Favorites, New Document, New Folder and Show hidden on the line below. Project settings › This Project shows the folder's name and a **Name shown**, which replaces the folder's name in the sidebar, the switcher and the messages. It is personal, kept in the Module's storage (`displayName` of the stored Project), not in `.living-doc.json`; empty shows the folder's name again. **Absolute path: not possible.** The Host gives a Module only an opaque id and the folder's name, never its path (Convention §6.5), and the browser's folder picker does not reveal it either, so there is nothing to keep at connect time. Instead, the panel shows the folder's name and a **Location on disk** that the User types (personal, `location` of the stored Project, not checked). It also shows as the tooltip of the Project in the switcher. The settings panels share one look, `.ld-form` in `src/lib/base.css`, written down in `docs/ui.md`.
