# 01: Reading: links, images and the document stylesheet

**What to build:** Reading an existing Living Documentation folder looks right for ordinary Markdown: a relative link to another Document (or the original's `?doc=<id>` link) opens it in the View, scrolled to its `#anchor`, with a back trail; external links open in a new tab; a link to a missing Document shows a message. Project Images show from the folder itself (read through the Host, shown from their bytes); a missing one shows its alt text and a mark. A stylesheet in the look of the original, light and dark from the Host theme. Every rendered block carries its source range for later tickets.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Relative `.md` links and `?doc=<id>` links open the target in the View, with `#anchor` scrolled to; Back returns
- [ ] External `http(s)` links open in a new tab; nothing navigates the View
- [ ] A link to a missing Document shows a message
- [ ] Images of the Project show; a missing Image shows its alt text and a missing mark; object URLs are released when the Document changes
- [ ] Headings, paragraphs, lists, quotes, code, tables, images and rules styled like the original, light and dark
- [ ] Every rendered block carries its source range
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder) on an old Living Documentation folder; differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
