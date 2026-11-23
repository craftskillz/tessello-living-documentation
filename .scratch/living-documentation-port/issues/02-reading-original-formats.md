# 02: Reading: the original's formats

**What to build:** Documents written with the original's formats render as before: table directives (style, border, color), image directives (width, alignment), quote directives (type, title, icon), column layouts (`layout-columns` … `col`, up to 6 columns), `:::compare`, callouts, footnotes, heading anchors, code highlighting, and collapsible long code blocks (ADR 0005).

**Blocked by:** 01 (Reading: links, images and the document stylesheet)

**Status:** ready-for-agent

- [ ] Each directive renders as in the original (expected HTML per directive)
- [ ] `:::compare` and column layouts render
- [ ] Callouts and footnotes render
- [ ] Headings get anchors; `#anchor` links scroll to them
- [ ] Code is highlighted; long code blocks collapse
- [ ] The View's address never changes (the e2e assertion is kept for every new journey)
- [ ] Every text in English and French; every failure shows a translated message
- [ ] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder) on an old folder using these formats; differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.
