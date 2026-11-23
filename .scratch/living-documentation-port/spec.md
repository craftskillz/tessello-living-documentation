# Spec: Living Documentation as a Tessello Module

Status: ready-for-agent

## Problem Statement

A developer keeps their project documentation as Markdown files next to the code, where coding agents and `git` read and change them. The original Living Documentation application served those files through its own hub process: it ran on the developer's machine, committed after every save, and spoke text with a local speech engine. Inside Tessello there is no such process: a Module runs in a sandboxed `about:srcdoc` page with no address of its own and reaches the User's disk only through folders the User grants (Tessello ADR 0022, Convention §6.5).

Today the Module (slice 1) connects a Project folder, shows a basic Tree, opens a Document, edits it with autosave and the version check, and notices agent edits. But reading an existing Living Documentation folder looks bare: no document styles, none of the original's formats (directives, compare blocks, Kanban blocks, Mermaid, callouts), no images, and links between Documents are not handled. None of the original's other features exist yet: Tree actions, snippets, Tag markers, templates, favorites, annotations, Kanban boards, Versions, the HTML view, read aloud, Project settings.

## Solution

The Module becomes a complete port of the original's documentation features, decided feature by feature (`docs/spec/`, ADRs 0001–0009, atlas answers in `questions.md`): raw Markdown in User-chosen folders, the on-disk format kept compatible with the original (Folder manifests, `.living-doc.json`, `.annotations.json`), several Projects, every write version-checked against agent edits, no automatic commits, Versions read from the repository through a Repository grant, speech from the browser's own voices, and every text in English and French following the Host.

## User Stories

### Projects

1. As a developer, I want to connect my repository's `docs/` folder as a Project, so that I can read and edit my documentation in Tessello.
2. As a developer, I want my Markdown to stay as raw `.md` files in that folder, so that my coding agents and `git` keep working with them directly.
3. As a developer, I want to connect several Projects (one folder each), so that I can keep separate documentation spaces.
4. As a developer, I want one Active Project at a time, with a switcher, so that the Tree and favorites always belong to one Project.
5. As a developer, I want a folder that is inside, or contains, an existing Project to be refused, so that two Projects never manage the same files.
6. As a developer, I want my Projects and the Active Project remembered, so that the next visit opens where I was.
7. As a developer, I want a Project to open on the Document I last opened in it, else its top favorite, else its first Document, so that I land somewhere useful.
8. As a developer, I want a Project whose folder the browser no longer allows (after a restart) shown as unavailable with **Reconnect**, so that one click brings it back.
9. As a developer, I want to remove a Project without touching its files, so that the Module forgets it safely.
10. As a developer, I want the Project's metadata file (`.living-doc.json`) created only when a setting needs it, so that connecting a folder adds nothing to it.
11. As a developer, I want a Project settings panel over `.living-doc.json` (for example the suggested Tag names), so that settings shared with my team live in the repository.
12. As a developer, I want to connect the repository that contains the Project folder (Repository grant), refused when it does not contain it, so that Versions can read its history.

### Tree

13. As a developer, I want the Tree to follow each Folder manifest's `order` and `hidden` lists, then Folders, then Documents alphabetically ignoring case, so that my existing folders look as they did in the original.
14. As a developer, I want names shown exactly as typed on disk (no prefix dropping, no `_` to spaces), so that what I see is what my agents see.
15. As a developer, I want the Tree to show each Document's creation date, else its modified date, so that I can tell old from new.
16. As a developer, I want to create a Document by typing one Name, giving `<Name>.md` starting with a `timestamp` frontmatter and `# <Name>`, so that new files follow one simple rule.
17. As a developer, I want names refused when empty, containing `/ \ : * ? " < > |`, starting or ending with a space or dot, equal to `liv-doc-main.md`, or differing only by case from a sibling, so that every file name is valid everywhere.
18. As a developer, I want to create, rename, move and delete Folders and Documents from the Tree (menus and drag and drop), so that I organize documentation without leaving the Module.
19. As a developer, I want relative links in other Documents rewritten when I rename or move a Document or Folder in the Module (including links inside a moved Document), so that nothing breaks.
20. As a developer, I want new or moved-in entries appended to the end of a custom-ordered Folder, so that my order is kept.
21. As a developer, I want deleting a Folder to confirm with counts by kind and the number of Documents elsewhere that link into it, so that I know what I lose.
22. As a developer, I want links to a deleted Document or Folder turned into plain text, so that no dead link remains.
23. As a developer, I want to hide and show entries (kept in the Folder manifest), and hidden entries to keep Show, Rename and Delete, so that I can tidy the Tree.
24. As a developer, I want Tree changes refused in a Folder whose manifest is invalid, with a message, so that I never lose its order.
25. As a developer, I want `images/` and `files/` at the Project root reserved and created only when first needed, so that attachments have a fixed place.
26. As a developer, I want other files shown with **Show hidden items**, images and videos previewed, text up to 1 MB shown, anything else offered as Download, so that I can see what sits in my folder.
27. As a developer, I want the Tree updated silently when an agent adds, removes or renames files, so that I always see the folder as it is.
28. As a developer, I want a search over displayed title, Tags, description, Type and body, title matches at once and full text after a short pause, ignoring accents and case, so that I find a Document quickly.
29. As a developer, I want my view preferences (sidebar width, Show hidden items, Show attachments) and the Folders open in the Tree remembered, so that the View stays as I left it.

### Frontmatter

30. As a developer, I want the frontmatter left exactly as written, the Module changing only the fields it sets (`timestamp` at creation, `language`, `html_template`, `type`) in place, so that my agents' and my own formatting survive.
31. As a developer, I want the displayed title to be `title`, else the first top-level heading, else the file name as typed, so that every Document has a sensible title without writing one.
32. As a developer, I want Tags read from a list or a comma-separated string and shown as pills, so that both styles work.
33. As a developer, I want `description` shown as a subtitle and the creation and modified dates shown in my locale and time zone, so that the header tells me what the Document is.
34. As a developer, I want an optional free-text Type set only by an agent or with the header's type pill (with suggestions from the Types already used), so that classification is explicit, never guessed from the folder.
35. As a developer, I want invalid YAML to show a non-blocking warning with its line, and field writes refused with "Fix the frontmatter first", so that a broken frontmatter is never made worse.

### Reading

36. As a developer, I want Documents rendered with a stylesheet in the look of the original, light and dark following the Host, so that my documentation is pleasant to read.
37. As a developer, I want GitHub tables, task lists, footnotes, callouts, heading anchors and collapsible long code blocks rendered, so that ordinary Markdown looks right.
38. As a developer, I want the original's directives rendered (table style, border and color; image width and alignment; quote type, title and icon; column layouts with `<!-- col -->`), so that formatted Documents look as before.
39. As a developer, I want `:::compare` blocks, syntax-highlighted code and Mermaid diagrams rendered, so that technical content reads well.
40. As a developer, I want images of my Project shown from the folder itself, and a missing image shown as its alt text with a mark, so that pictures work without a server.
41. As a developer, I want a relative link to another Document, or the original's `?doc=<id>` link, to open it in the View (scrolled to its `#anchor`), with a back trail, so that I can follow my documentation.
42. As a developer, I want external links to open in a new tab, so that the View is never replaced.
43. As a developer, I want a link to a missing Document to show a message, so that I know it is broken.
44. As a developer, I want header actions **Copy path**, **Lines**, **White background**, table of contents, **Edit** and **Delete**, and my Lines, table of contents and White background choices remembered, so that I read the way I like.
45. As a developer, I want to enlarge an image (Shift/Cmd + click), copy an image and copy a table, so that I can reuse content.
46. As a developer, I want an agent's edit to appear in place while I read, so that I always see the current file.
47. As a developer, I want the Folder manifest opened read-only (frontmatter as a YAML block, Lines, table of contents, Copy path), so that I can see it without breaking it.
48. As a developer, I want deleting a Document to confirm with the number of Documents that link to it, turn those links into plain text, and remove it from favorites, so that deletion leaves things clean.

### Editing

49. As a developer, I want to edit a Document in CodeMirror (Markdown highlighting, line numbers, undo, find), so that editing raw Markdown is comfortable.
50. As a developer, I want my changes saved about one second after I stop typing, and at once when I open another Document or Project, with text typed during a save saved next, so that I never lose work.
51. As a developer, I want **Revert** to restore the file as it was when I clicked Edit (after a confirmation if anything changed), and **Done** to close after the last save, so that I can abandon an edit safely.
52. As a developer, I want a change made on disk while I edit to show a banner with **Compare** (side by side), **Keep mine** and **Take theirs** (my text copied to the clipboard first), autosave paused until I choose, so that neither my text nor my agent's is silently lost.
53. As a developer, I want to edit one section (heading to next heading of the same level) in a section editor with the same rules, so that long Documents are easy to change.
54. As a developer, I want a pasted or dropped image saved in `images/` under a name I confirm (a timestamp proposed, `<name>-2` proposed when taken, never overwriting) and its link inserted, so that screenshots are one paste away.
55. As a developer, I want dropped non-image files saved in `files/` with a link inserted, so that attachments are easy.

### Snippets

56. As a developer, I want a picker of 25 snippet kinds with search, forms and a table grid editor, so that I can insert structured content without remembering syntax.
57. As a developer, I want Edit, Delete and Insert-after on a rendered block to use its source position and check the source is unchanged before writing, so that the right block is changed.
58. As a developer, I want a failed snippet save to keep the dialog open with its content and a **Retry**, and a block changed on disk to offer **Copy Markdown**, so that my input is never lost.
59. As a developer, I want Mermaid Builder charts (pie, timeline, tree view, sequence), layout columns and attachment links reopened in their forms, so that I can change them later.
60. As a developer, I want `|` in table cells escaped, tree names drawn as typed and pie weights accepted as any numbers ≥ 0, so that snippet output is always valid.
61. As a developer, I want every snippet default text and tooltip in my language, so that the picker speaks English or French with me.

### Tag markers

62. As a developer, I want an unclosed tag that is not an HTML element (`<add-footnote>`, `<rewrite-section in three parts>`) shown as a yellow pill with its name, the whole tag on hover, so that instructions for my agents are visible.
63. As a developer, I want to insert and remove Tag markers at the clicked spot (table cells included; not in code, diagrams, compare blocks or Kanban boards), version-checked and retried once on a conflict, so that I can leave instructions precisely.
64. As a developer, I want Tag name suggestions from Project settings and from markers already used, with invalid names named in an error, so that my team uses consistent instructions.

### Templates

65. As a developer, I want a template library per Project as files in `.templates/<folder>/<name>.md`, hidden from the Tree, so that templates are versioned and readable by agents.
66. As a developer, I want a Project holding the original's `.document-templates.json` offered **Convert to files** once, so that my old templates come over.
67. As a developer, I want to create, rename, duplicate (`<name> copy`), move and delete templates and folders, edited like Documents (autosave, Revert, conflict banner), with a preview resolving images and links, so that the library is easy to maintain.
68. As a developer, I want to search templates by name and content, ignoring case and accents, from the header menu and the library screen, so that I find one quickly.
69. As a developer, I want a Document created from a template to get `timestamp` now, its first heading replaced by `# <Name>`, `{{title}}` and `{{date}}` replaced, relative links rewritten for its location, and dropped fields (`title`, `timestamp`, `date`, `sources`, `resource`) removed, so that it starts clean.

### Favorites and Widget

70. As a developer, I want to star Documents as personal favorites per Project (at most 200, kept in the Module's storage, seeded once from `.living-doc.json`), so that my shortcuts are mine and never written to the repository.
71. As a developer, I want each favorite to show the Document's current title, a missing one shown as **Missing** with **Remove** (never removed automatically), so that the list stays truthful.
72. As a developer, I want to reorder favorites by drag or Alt + ↑/↓, the menu closing with Escape, so that it is keyboard friendly.
73. As a developer, I want favorites updated when I move, rename or delete in the Module, so that they follow my Documents.
74. As a developer, I want the Widget to show the Active Project's name and its favorites, a click opening the View on that Document, and **Reconnect** for an unavailable Project, so that the Home is a launchpad.

### Annotations

75. As a developer, I want to annotate a passage in the reading view with a note stored in the Project's `.annotations.json`, so that review notes are shared through the repository and readable by agents.
76. As a developer, I want an annotation placed only where its passage and surroundings match, else marked "surrounding text changed" when the passage occurs once, else shown as an orphan, so that a note is never attached to a guess.
77. As a developer, I want to edit (keeping the creation date, adding `updated`) and delete annotations, a blank note keeping Save disabled, so that notes stay current.
78. As a developer, I want the Marker to cycle Normal → Active → Hidden, Normal and Hidden remembered, so that annotations do not get in my way.
79. As a developer, I want column buttons showing the note on hover and scrolling to it on click, so that I can review quickly.
80. As a developer, I want annotation writes retried after re-reading on a version conflict, and moves, renames and deletes in the Module to carry or remove annotations, so that concurrent edits never lose notes.

### Kanban boards

81. As a developer, I want a Document containing a Kanban block (outside code) shown as a board under its own text, so that I can track work in my documentation.
82. As a developer, I want each column mapped to a folder (accents removed, other characters `_`), cards being the Documents in it ordered by that folder's manifest, so that boards stay plain files.
83. As a developer, I want to add cards (name as typed, translated skeleton or a template), drag them between and within columns (moving the file, keeping order), so that I can work the board.
84. As a developer, I want to edit columns (1–6, six colors), refused when two names map to the same folder; renaming a column renames its folder with links and favorites following; removing one with cards asks to move them or keep the folder, so that boards stay consistent.
85. As a developer, I want deleting a board to keep its column folders and cards, so that no work is lost.

### Versions

86. As a developer, I want no automatic commits or pushes, so that my repository history stays mine.
87. As a developer, I want **Versions** on a Document (with a Repository grant) listing the commits of the current branch that changed it in a period (default 30 days), newest first, with id, message, date and author, so that I see its history.
88. As a developer, I want to compare the file on disk with a chosen commit (default: the latest that changed it, or the one before when identical), following renames at 50% similarity, so that history survives reorganizations.
89. As a developer, I want to restore one block from the old version with **<**, written at once with the version check and undoable during the dialog session, so that I can recover a passage safely.
90. As a developer, I want Versions fast on a real repository, so that I use it.

### HTML view

91. As a developer, I want to present a Document with one of two built-in HTML templates (Interview sheet, Article), chosen in a dialog that writes only `html_template`, so that I can produce a polished page.
92. As a developer, I want the HTML view inside the View (title, lead, `##` sections, table of contents, directives and Tag markers), with **← Document**, so that presenting never leaves the Module.
93. As a developer, I want to edit paragraphs and headings as text and code, lists, quotes and tables as Markdown in place, version-checked and keeping my scroll position, and a right-click to open the section editor (the lead alone for the lead), so that I can polish the presented page.
94. As a developer, I want links in the HTML view to open the target's HTML view when it has a known template, else its reading view, so that presentations link naturally.
95. As a developer, I want **Download HTML** (one standalone file, CSS inlined, images embedded), so that I can share or print the page.
96. As a developer, I want an unknown `html_template` value left in the file with a translated message and **Choose a template**, so that nothing is silently rewritten.

### Read aloud

97. As a developer, I want **Listen** to read a Document aloud with my browser's voices, from the start or from my selection, so that I can review by ear.
98. As a developer, I want Pause, Resume, Next section and Stop, with the spoken sentence highlighted and kept centred, so that I can follow along.
99. As a developer, I want the Document's language taken from `language`, `lang`, `locale` or `langue` (any code), asked once when missing among the languages that have a voice and written as `language: <code>`, so that the right voice reads it.
100. As a developer, I want a language without a voice reported without overwriting the value, so that my file is never changed by mistake.
101. As a developer, I want to choose a voice per language and a speed (0.75×–2×), kept for me, so that reading suits me.
102. As a developer, I want sentences split by language-aware rules, long sentences spoken in pieces, and code, tables, images and diagrams announced in the Document's language, so that reading sounds natural.
103. As a developer, I want Listen in the HTML view too (main content only), and hidden when the browser has no voice, so that it works where it can.

### Everywhere

104. As a French-speaking developer, I want every text, date and plural in French when the Host is in French, so that the Module speaks my language.
105. As a developer, I want every failure to say what failed and what to do, never a raw error alone, so that I am never left guessing.
106. As a developer, I want changes made by agents noticed within about five seconds while the View is visible, and at once when it becomes visible again, so that the Module and my agents work side by side.

## Implementation Decisions

- **Tessello capability.** The Module declares the `folders` Permission and uses `folders.*` / `files.*` (Convention §6.5, Tessello ADR 0022): opaque folder ids, relative paths, versions on every file and `ifVersion` for conflicts (`null` to create only), folder moves done file by file, `mustContain` for the Repository grant, `unavailable` until `folders.reconnect`. `folders.request` and `folders.reconnect` must be sent directly from the User's click. Until the new SDK is published, the Module depends on the local SDK and CLI of the sibling `tessello` repository.
- **No address of its own.** The View is an `about:srcdoc` page with base `https://package.tessello.invalid/view/`: no URL or hash routing, no `href` that resolves to an address, no `history.*State` with a URL. Navigation is View state; the last opened Document is in storage; deep links come from the View's params (`project`, `doc`), as from the Widget. Screens the decisions described as routes (template library, HTML view) are View states.
- **Modules** (deep modules, docs/design.md):
  - `projects`: the Project list, Active Project, last opened Document per Project, favorites, display preferences, Marker state, reading voices and speed (Module storage); connect, reconnect, remove, where a Project opens.
  - `project`: the only module that writes a Project folder. Tree (Folder manifests), read and version-checked save raising a Conflict carrying the disk's text, `check()` for agent edits, and every cascade: link rewriting, manifest order and hidden updates, annotations, favorites and Kanban folders following renames, moves and deletes, Images never overwritten, lazy `.living-doc.json`.
  - `document`: pure Document model: frontmatter (valid or invalid with its line), displayed title, Tags, description, Type, language, `html_template`, body; `setField` in place; block tree with source ranges for blocks, Tag markers, Links, Images, directives and Kanban blocks (one parser, remark/mdast).
  - `edits`: text edits `{ range, text }` applied by one rule; section editor, snippets, Tag markers, HTML-view edits, restores and field writes all produce them.
  - `render`: Document model → HTML with `data-src` source ranges; directives; HTML templates and Download HTML as a second renderer over the same model.
  - `annotations`: placement (pure) and storage in `.annotations.json` (retry after re-read on conflict).
  - `history`: isomorphic-git over a read-only fs shim on the Repository grant, listing `.git` once per session and caching every read; commits in a period on HEAD, rename following at 50% (the Module's own, isomorphic-git's `follow` matches identical content only), Myers diff.
  - `reading`: reading script (pure, `Intl.Segmenter`) and a Reader driving a Speaker (browser `speechSynthesis` in production).
  - Smaller: `templates`, `kanban`, `snippets`, `search`, `i18n`.
- **On-disk compatibility** (ADR 0003): Folder manifest `liv-doc-main.md` (YAML `order`, `hidden`, names on disk with extension), `.living-doc.json`, `.annotations.json` at the root, `images/`, `files/`. Exceptions: templates as Markdown files in `.templates/` (ADR 0006), favorites personal in Module storage (ADR 0007).
- **Frontmatter left as written** (ADR 0004): no normalization; no status; Type only when explicit.
- **Directives are HTML comments** (ADR 0005).
- **No automatic commits**; Versions reads history through a Repository grant (ADR 0008).
- **Read aloud uses the browser's voices** (ADR 0009).
- **Agent edits**: `check()` every 5 seconds while visible and on becoming visible; the Tree updates silently; the open Document reloads while read, and is a Conflict while edited.
- **Stack**: Svelte 5, esbuild, CodeMirror 6, remark/rehype, Mermaid, isomorphic-git, `yaml`; built and validated like the sibling Modules.
- Prototype verdicts (2026-11-22, branch `prototypes`): the folder picker opens only within the click; folder moves must be copy then delete; grants return to `prompt` after a Chrome restart; clipboard image copy works in the sandbox; Versions on a 1379-commit, 61 MB repository: 0.2 s for 30 days with the listing and cache; 199 voices and long sentences work in the sandbox.

## Testing Decisions

- **A good test** exercises behavior through a module's interface or a User journey, asserts what a User or a caller observes (files on disk, what the View shows, what an interface returns), and survives refactors. No test reaches inside a module or mocks its internals; expected values come from the spec, the original's behavior or worked examples, never recomputed the way the code does.
- **Five seams, confirmed with the User:**
  1. **Projects and Projects' files**: `projects` and `project` in Node on the SDK Test Host's memory disk (`host.folders`: create, choose, write and remove as an agent, restart, refuse reconnects). Every file-changing rule is tested here. Prior art: the Module's project and projects tests.
  2. **Document model and rendering**: `document` and `render`, pure, with expected HTML and models. Covers frontmatter rules, directives and extensions, source ranges, links, images, Tag markers, snippet output, HTML templates, Download HTML, the reading script. Prior art: the Module's document tests.
  3. **View and Widget journeys**: Playwright on the built package attached to the Test Host; every journey keeps the assertion that the page address never changes (the Test Host runs the View top-level, unlike the Host). Prior art: the Module's view tests, Git Integration's e2e harness.
  4. **Versions**: `history` in Node on the Test Host disk holding a real `.git` fixture created with `git` at test time.
  5. **Read aloud**: the Reader with a fake Speaker and a manual clock.
- Run the typecheck and single test files during work, the full unit and browser suites at the end of each ticket, and `tessello validate` on the built package.
- Before a ticket is done, try it in the local Host (`npm run start:host` in the sibling `tessello` repository, the Module copied into a Modules folder), on an old Living Documentation folder where it applies.

## Out of Scope

- Import and export (opening a folder is the import), printing, MCP, the original's Extra Files and linked files, a frontmatter field form.
- Automatic commits and pushes, Git settings, selection history (`git log -L`).
- The original's Diagram snippet and diagram editor (a separate Tessello Module), its Local search snippet.
- Custom HTML templates and a dark HTML template; the folder HTML ZIP export.
- Kokoro speech; the original's speech endpoints.
- Annotations of Documents moved outside the Module (kept unused in the file; no screen in v1).
- Publishing the new `@tessello/sdk`: a separate task before this Module's first release.

## Further Notes

- Already built (slice 1, commits up to `036fc35` plus setup `7c946ae`): Project connect, list, Active Project, start Document, reconnect, remove; Tree from Folder manifests; read, version-checked save with Conflict, `check()`; Document title, Tags, description, Type, invalid YAML; a View with the Tree, a basic rendering, CodeMirror editing with autosave and the conflict banner; the Widget with the Active Project. 27 unit and 9 browser tests.
- Known gaps from slice 1: Project overlap is not refused yet (the Host checks containment only at request time with `mustContain`; refusing overlap needs a design); the Tree shows file names, not titles; raw HTML is dropped from the rendering.
- The behavior of the original is in the Retrodoc atlas (`/Users/ymedaghri/Documents/testRetrodocLivingDocByClaude`, `features/*.md`); its source (`../living-documentation`) is read-only. The port's decisions are in `docs/spec/` and the ADRs; where they are silent, the original's behavior applies.
- Vocabulary: `GLOSSARY.md`.
