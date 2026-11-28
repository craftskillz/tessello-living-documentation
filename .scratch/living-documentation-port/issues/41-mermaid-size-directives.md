# 41: Mermaid diagrams take the size their form writes

**What to build:** The Code block form writes `<!-- mermaid-width: … -->` and `<!-- mermaid-align: … -->` before a Mermaid diagram, but the reading view applied only `code-width` and `code-align`: the width and alignment chosen in the form did nothing. A Mermaid block now takes both spellings; another code block still ignores `mermaid-*`.

**Blocked by:** none

**Status:** done (be35968, 5805843)

- [x] `src/lib/render.ts`: before a Mermaid block, `mermaid-width` / `mermaid-align` act as `code-width` / `code-align` (last valid one wins)
- [x] Reading view and HTML generation (their CSS already sized `.ld-mermaid` by the `ld-code-*` classes)
- [x] Reading rule 7 of `docs/spec/documents-reading-and-editing.md`
- [x] Typecheck, unit and browser suites green
- [x] Tried in the local Host
- [x] The skill `living-documentation` drops its warning and documents `mermaid-width` / `mermaid-align` (skill repository, cddca03)

## Comments

- The test that pinned the old behaviour ("mermaid directives are consumed and not output", from the original tool) is replaced by the new rule.
- Tried in the local Host by the User (2026-11-28): approved as is.
