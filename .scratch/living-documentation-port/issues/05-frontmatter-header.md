# 05: Frontmatter in the header

**What to build:** The header shows the displayed title, `description` as a subtitle, Tag pills, the creation date (`timestamp`) and the modified date (file time) in the Host locale and the reader's time zone, and the Type pill (Add type when none, suggestions from Types used in the Project, clearing removes the field; written in place, version-checked). Invalid YAML shows a non-blocking warning with its line; field writes are refused with "Fix the frontmatter first", opening the editor (ADR 0004).

**Blocked by:** 01 (Reading: links, images and the document stylesheet)

**Status:** ready-for-human (built in 0fbb673; awaiting the trial in the local Host)

- [x] Header shows title, description, Tag pills, both dates
- [x] Setting, changing and clearing the Type writes only that field, in place, every other byte kept
- [x] Invalid YAML: warning with its line; Type changes refused with "Fix the frontmatter first"
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- Built in three seams. **Document model** (`src/lib/document.ts`, `test/document.test.ts`): `created` read from `timestamp` (moved from `project.ts`); `setType(text, type | null)`, which quotes the value as YAML needs, collapses whitespace and clears on blank. `setField` and `setType` now replace a field over all its lines (block scalars, continued values), keep a one-line field's trailing comment (`type: ADR  # why`), match a quoted key (`"type":`) instead of adding a duplicate, and remove the whole field when clearing. **Project** (`src/lib/project.ts`, `test/project.test.ts`): `modified(path)` lists only the file's Folder; `types()` gives the Types used, hidden Documents included, not manifests or `.templates/`. **View** (`src/view/DocumentMeta.svelte`, `e2e/header.test.ts`): 8 journeys, among them add, change (CRLF kept), clear and Escape, suggestions, invalid YAML, a conflict, and French. Unit 525/525, browser 200/200; `tessello validate` installable (the three known Mermaid warnings).
- No migration: nothing is rewritten when reading or opening a Project. The only write is the Type pill, on the `type` field alone.
- Layout: the header block sits above the rendered body, not on the paper (inside the article it would enter the text read from the article). It holds Created, Modified and the Type pill on one line, then the invalid-YAML note, the description and the `#tag` pills. The title stays where it was: the body's own `#` heading, else the displayed title as `<h1>`. A frontmatter `title` that differs from the body's heading is therefore not shown in the reading view (unchanged from before; the Tree and favorites use it).
- The created date is shown as written, with no time-zone conversion (as the Tree and the original). The modified date uses the reader's time zone.
- The Folder manifest (read-only) shows no header block.
- A failure to load the suggestions or the modified date stays silent (no suggestions, no date): neither blocks reading.
- The Type field is collapsed to one line. A value that differs only in whitespace is normalized when saved.
- Still to do: the trial in the local Host.
