# Several Projects, one folder and one Folder grant each

The original serves a single documentation folder per running hub. The Module instead holds several Projects, each one exactly one Project folder with its own Folder grant, and shows one Active Project at a time. Everything else (Tree, search, favorites, tags, annotations, templates, Links) is scoped to a Project. The list of Projects lives in the Module's Host storage, because only the Host holds folder handles; each Project's own metadata stays in its folder, so it travels with the repository.

## Consequences

- Project folders may not be the same, nested in, or around one another: the Module refuses the second one and names the conflicting Project.
- Removing a Project only forgets it and revokes its grant; it never touches files.
- A Project whose folder is gone or ungranted stays listed as unavailable, with Reconnect and Remove.
- Opening a folder writes nothing: Project metadata is created only when the User first changes something it records.
- Folders are granted at run time, not listed in the Manifest: the Manifest only declares that the Module may ask for folders.
