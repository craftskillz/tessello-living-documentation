# 18: New Document from a template

**What to build:** The New document dialog can start from a template: frontmatter drops `title`, `timestamp`, `date`, `sources`, `resource`, sets `timestamp` to now and keeps the rest; the first `#` heading becomes `# <Name>` (added when none); `{{title}}` and `{{date}}` (`YYYY-MM-DD`) are replaced anywhere, other `{{…}}` stay; relative links and images are rewritten for the new location; the Document is an independent copy.

**Blocked by:** 08 (Tree: new Document and new Folder), 17 (Template library)

**Status:** ready-for-human (built in c0975a7; awaiting the trial in the local Host)

- [x] Frontmatter, heading and placeholders as specified
- [x] Links and images rewritten for the new location
- [x] Appended to the Folder's custom order like any new Document
- [x] The View's address never changes (the e2e assertion is kept for every new journey)
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder); differences from the original noted in the ticket

Spec: `.scratch/living-documentation-port/spec.md`. Read `GLOSSARY.md`, the ADRs and the `docs/spec/` page of this feature first. Tests at the five seams of the spec's Testing Decisions.

## Comments

- `documentFromTemplate` (pure, `src/lib/templates.ts`) makes the text; `TemplateLibrary.createDocument(template, folder, name)` reads the template first (gone: NotFound, nothing written) and calls `Project.createDocument(folder, name, content)`, which now takes an optional `content(path)`: same naming rule, refusals and manifest order.
- Frontmatter is edited line by line (ADR 0004): dropped keys (any case) go with their continuation lines; `timestamp: <toISOString()>` becomes the first line; a template without frontmatter gets one. `{{date}}` is the local date. Placeholders are replaced first, then the heading, then the links.
- Heading: the first ATX `#` line outside fences; a setext heading (`Title` / `===`) is not recognised, so `# <Name>` is added above it.
- A link from a template to itself becomes a link to the new Document (the self-link stays a self-link).
- Differences from the original: no `title` field is written (the Name is the file name and the heading); the original's "blank lines at the start of the body reduced by one" is not kept.
- Dialog: **Template folder** (Blank document first) › **Template**, between Name and Location; choosing a template fills the Name. The Templates menu's template rows now open this dialog (Open library still opens the screen); the library screen has **Create a document**, which leaves the screen like Back. The folders load just after the dialog opens, so the selects appear a moment later.
- A template gone before the dialog opens: "This template no longer exists.", Create disabled until another choice; gone after: the same message on Create, the dialog stays.
