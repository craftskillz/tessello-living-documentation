# Cross-cutting rules

Rules every feature of the Module follows.

## Storage and Projects

See ADR 0001–0003. Documents are raw Markdown files in Project folders reached through Folder grants; the on-disk format stays compatible with the original. The list of Projects, the last Active Project and the User's view preferences live in the Module's Host storage.

## Language

- Every text follows the Host locale (`en`, `fr`), with the locale's plural rules. No string is fixed in one language: screens, notifications, default snippet texts, skeleton texts, tooltips.
- Dates and times follow the Host locale and the reader's time zone.

## Failures

- **No failure is silent.** Every failed action shows a translated message that says what failed and what to do. Raw server, Host or parser error text is never shown as the message (it may appear as a detail).
- When a feature round meets a "silent failure" question of the atlas, the answer is "defect; this rule applies"; it is asked only when the right message is not obvious.

## Agent edits

- While the View is visible it checks every 5 seconds whether the Project's file list or the open Document changed (version stamps), and re-reads both when it becomes visible again.
- The Tree updates silently. The open Document reloads in place when it is not being edited; while it is being edited, the change is treated as a conflict at once (Compare, Keep mine, Take theirs; below), without waiting for the next save to be refused.
- A save over a file changed since it was read is refused; the editor offers Compare, Keep mine and Take theirs ([reading and editing](documents-reading-and-editing.md) rule 3).

## Navigation

- The View routes by hash: `#/p/<projectId>/doc/<path>`. Reloading reopens the same Document; the Widget and the Host can open a Document directly.
- Opening a Project shows, in order: the deep-linked Document, else the last Document open in that Project, else the top favorite, else the first Document.

## Widget

The Active Project's name and its favorites; a click opens the View on that Document. An Unavailable Project shows **Reconnect**.

## Out of v1

Import and export (opening a folder is the import), printing, MCP, the original's Extra Files and linked files, a frontmatter field form.
