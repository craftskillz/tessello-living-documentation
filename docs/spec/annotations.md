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
