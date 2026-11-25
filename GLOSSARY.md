# Living Documentation (Tessello module)

The documentary part of Living AI Documentation, rebuilt as a Tessello Module: Markdown documentation kept next to the code, read and edited by people in the View and by coding agents directly on disk.

The behavior being ported is described by the Retrodoc atlas (`/Users/ymedaghri/Documents/testRetrodocLivingDocByClaude`); the original application is called **the original** here.

## Language

### Projects

**Project**:
One documentation set: a single folder on the User's disk, chosen by them, holding Documents. The Module can hold several Projects; one is open at a time.
_Avoid_: Workspace, space, repo, docs folder (when meaning the Project itself)

**Project folder**:
The folder on disk a Project lives in, typically a code repository's `docs/`. Two Projects never share or nest their folders: the Host refuses an overlapping one (ADR 0010).
_Avoid_: Root, target folder, documentation directory

**Folder grant**:
The User's permission, given through the Host's own folder picker, for the Module to read and write one Project folder. Revocable; never exposes the folder's absolute path to the Module.
_Avoid_: Mount, access token, folder permission (for one grant)

**Repository grant**:
An optional second Folder grant of a Project, on the git repository root that contains its Project folder, used only to read the repository's history.
_Avoid_: Git config, repo link

**Unavailable Project**:
A Project whose folder is gone, moved, or no longer granted. It stays listed until the User reconnects or removes it.
_Avoid_: Broken project, offline project

**Active Project**:
The Project currently open in the View and summarized by the Widget.
_Avoid_: Current workspace, selected folder

**Project metadata**:
What a Project records about its Documents beyond their text (order, hidden entries, Project settings), kept in files inside the Project folder in the original's format: a project file at the root and a manifest per Folder.
_Avoid_: Config, settings (these name the Module's own preferences)

**Project settings**:
The settings of one Project that the original kept in its Admin page (for example the suggested Tag marker names), stored in the Project's `.living-doc.json` and edited from the Project switcher; the ones about how a Document reads (every newline as a line break) from the settings cog of the Document header.
_Avoid_: Admin, configuration, preferences (the User's own view preferences, kept by the Module)

### Documents

**Document**:
A Markdown file of a Project, identified by its path relative to the Project folder, with an optional YAML frontmatter.
_Avoid_: Page, note, article, entry (for a file)

**Frontmatter**:
The YAML block at the top of a Document holding its fields (title, description, tags, creation time, type, reading language, HTML template, and any others). The Module edits only the fields it sets and leaves the rest as written.
_Avoid_: Metadata (that is Project metadata), header, OKF block

**Type**:
An optional label a Document carries only when written in its Frontmatter, by an agent or by the User. Never inferred from the Folder.
_Avoid_: Kind, category, document class

**Tags**:
The keywords of a Document, listed in its Frontmatter `tags` field and shown as pills in its header.
_Avoid_: Labels, keywords; never "tag" alone for a Tag marker

**Tag marker**:
A lone opening tag written inside a Document's text (`<add-footnote>`, `<rewrite-section in three parts>`), an instruction left for an LLM, shown as a yellow pill in the reading view.
_Avoid_: Tag (alone), annotation, instruction tag

**Annotation**:
A note a User attaches to a passage of a Document in its reading view, kept in the Project's `.annotations.json` with the passage and the text around it, never in the Document's text. Placed where passage and surroundings match; marked "surrounding text changed" when only the passage, occurring once, matches; else an orphan.
_Avoid_: Comment, highlight, Tag marker

**Marker**:
The reading-view button that cycles the annotations through Normal (shown), Active (shown, and a selection opens the creation popup) and Hidden (not shown). Normal and Hidden are remembered.
_Avoid_: Highlighter, annotation mode

**Folder**:
A directory inside a Project folder; Folders and Documents together form the Tree.
_Avoid_: Category, section, directory (in user-facing text)

**Folder manifest**:
The reserved file of a Folder (`liv-doc-main.md`) that gives the order of its entries and the ones hidden from the Tree.
_Avoid_: Index, folder config

**Tree**:
The ordered hierarchy of Folders and Documents of a Project, as the sidebar shows it.
_Avoid_: Sidebar (the screen area, not the structure), index

**Link**:
A standard relative Markdown link from one Document to another, or to an image.
_Avoid_: Reference, wiki-link

**Image**:
An image file stored inside a Project folder and shown by a Document through a Link.
_Avoid_: Asset, attachment, upload

**Attachment**:
A file that is neither a Document nor an Image (a PDF, an archive…), dropped into a Document while editing, saved in the Project's `files/` and shown by the Document through a Link.
_Avoid_: calling an Image an attachment, upload

**Agent edit**:
A change to a Project folder made outside the Module, by a coding agent, an editor or `git`. The Module notices it but never assumes it did not happen.
_Avoid_: External sync, remote change

**Favorite**:
A Document the User starred, listed in the Favorites menu and the Widget in their order. Personal, per Project, kept in the Module's storage (ADR 0007); one whose file is gone stays listed as Missing.
_Avoid_: Bookmark, pin, starred document

**HTML template**:
One of the Module's built-in page layouts (Interview sheet, Article) a Document can be presented with, named in its Frontmatter `html_template` field.
_Avoid_: Template (alone; that is the Template library), theme, export

**HTML view**:
A Document presented with its HTML template, editable in place, inside the View.
_Avoid_: HTML page, preview, export

**Kanban board**:
A Document holding a Kanban block (real Markdown, outside code), shown as its own text followed by its Columns of Cards. The block names the Columns and their colors; the board's state is plain files.
_Avoid_: Board document, project board (for the feature)

**Column**:
One column of a Kanban board: a Folder next to the board Document, named after the column's label (accents removed, other characters `_`), created when missing.
_Avoid_: Lane, swimlane, status

**Card**:
A Document stored directly in a Column's Folder, in that Folder manifest's order then alphabetical. Moving a Card between Columns moves its file.
_Avoid_: Item, task, ticket
