# Annotations

Atlas page: `features/annotations.md` (business rules R1–R19). Atlas answers: Q-054 to Q-062. Rules of the original not changed here are kept.

## Storage

1. In the Project's `.annotations.json` (compatible with the original; shared through the repository; readable by agents). No author; anyone can delete any annotation.
2. Writes re-read the file and re-apply only their own add, edit or delete on a version conflict, retrying a few times before showing a message.
3. Moves, renames and deletes made in the Module update or remove annotations (R12). Annotations of a Document moved outside the Module stay in the file unused; they reappear if the file comes back. No screen for them in v1.

## Placement

4. Before + passage + after match → placed. Else the passage alone occurs exactly once → placed and marked "surrounding text changed" (orange column button, note in the popup). Else → orphan (red), never attached to a guess.

## Marker and screens

5. Marker cycles Normal → Active → Hidden. Normal and Hidden are remembered in the Module's storage; Active returns to Normal on reload.
6. Shown and creatable only in the reading view of an ordinary Document: not the section preview, the Folder manifest or Kanban boards. Not the HTML view either (HTML generation rule 12).
7. A blank note keeps **Save** disabled.
8. The reading popup offers **✎ Edit** (text area, Save / Cancel; the creation date is kept and `updated` is added) and **🗑 Delete** (confirmation).
9. Column buttons show the popup on hover and scroll to the annotation on click only.
10. Dates and tooltips follow the interface language and its plural rules. Failures show a message.

## Tasks for agents (ADR 0012)

11. **Every annotation is a task.** Entry key `status`: `"todo"` or `"done"`; absent means `"todo"`. A to-do annotation keeps today's yellow; a done one is green, its highlight and its column button alike.
12. **Replies**: entry key `replies`, a list of `{ "author": "agent" | "user", "text": "…", "createdAt": "<ISO date>" }` in the order written, only ever appended to. Absent means none. `author` is a role, never a name (rule 1: no author).
13. **Popup**: the note, then the Replies (author shown as "Agent" or "You", with their date), then **Reply** (a text area; a blank reply keeps Save disabled; written with `author: "user"`) and **Mark as done** or **Reopen** depending on the status. A User's Reply leaves the status as it is.
14. **An agent processing a task** does the work, appends a Reply with `author: "agent"` saying what it did, and sets `status: "done"`. When it cannot or should not do it, it appends a Reply asking its question and leaves the status at `"todo"`. When it rewrote the annotated passage, it replaces `selectedText`, `contextBefore` and `contextAfter` with the new passage and up to 30 characters around it, as the reading view's text (rendered, not Markdown).
15. Writes keep rule 2 (version check, re-apply on a conflict) and every key the Module does not know. A change made by an agent shows without reloading: the View already reads the annotations again when `.annotations.json` changes on disk.
