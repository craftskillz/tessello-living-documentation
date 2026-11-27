# 41: Mermaid diagrams take the size their form writes

**What to build:** The Code block form writes `<!-- mermaid-width: … -->` and `<!-- mermaid-align: … -->` before a Mermaid diagram, but the reading view applied only `code-width` and `code-align`: the width and alignment chosen in the form did nothing. A Mermaid block now takes both spellings; another code block still ignores `mermaid-*`.

**Blocked by:** none

**Status:** built, awaiting the trial in the local Host

- [x] `src/lib/render.ts`: before a Mermaid block, `mermaid-width` / `mermaid-align` act as `code-width` / `code-align` (last valid one wins)
- [x] Reading view and HTML generation (their CSS already sized `.ld-mermaid` by the `ld-code-*` classes)
- [x] Reading rule 7 of `docs/spec/documents-reading-and-editing.md`
- [x] Typecheck, unit and browser suites green
- [ ] Tried in the local Host
- [ ] The skill `living-documentation` drops its warning ("write `code-width` before a Mermaid block")

## Comments

- The test that pinned the old behaviour ("mermaid directives are consumed and not output", from the original tool) is replaced by the new rule.
