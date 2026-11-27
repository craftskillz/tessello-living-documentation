# 35: Annotations are tasks: status, Replies, and their popup

**What to build:** Every annotation becomes a task for agents (ADR 0012). The Module reads two new optional keys of an entry in `.annotations.json`, `status` (`"todo"` | `"done"`, absent = todo) and `replies` (`[{ author: "agent" | "user", text, createdAt }]`), colors the annotation by status (to do: today's yellow; done: green, highlight and column button), and shows the Replies in its popup with **Reply**, **Mark as done** and **Reopen**. Agents write these keys on disk; the skill `living-documentation` (sibling repository `SKILLS_Repositories/skill-living-documentation`) teaches them how.

**Blocked by:** none

**Status:** built, awaiting the trial in the local Host

- [x] `src/lib/annotations.ts`: `Annotation` carries `status` and `replies` (malformed values read as absent); `replyToAnnotation` (appends a `user` Reply, Refused("empty") for a blank text) and `setAnnotationStatus`, version-checked and re-applied on a conflict like `editAnnotation`; every unknown key kept
- [x] Done annotations are green (highlight and column button); to-do ones keep their yellow; orphans and "surrounding text changed" keep their marks
- [x] Popup: note, Replies ("Agent" / "You", date in the interface language), Reply (Save disabled while blank), Mark as done / Reopen; a User's Reply leaves the status unchanged
- [x] An `.annotations.json` changed by an agent (status, Reply, re-anchored passage) shows without reloading
- [x] Every text in English and French; every failure shows a translated message
- [x] Typecheck, unit and browser suites green; `tessello validate` passes on the built package
- [ ] Tried in the local Host, an agent's change written by hand into `.annotations.json`; differences noted in the ticket

Decision: `docs/adr/0012-annotations-are-tasks-for-agents.md`. Spec: `docs/spec/annotations.md` rules 11–15.

## Settled

- With the User, 2026-11-27: every annotation is a task (no task/note choice); a thread `replies[]`, not a single reply; the agent re-anchors a passage it rewrote; in the popup the User sees the Replies and can Reply, Reopen and Mark as done.
- Retiring Tag markers is a later ticket.

## Comments

- The model keeps `status` and `replies` optional, as in the file: absent means to do and no Replies; nothing is written until the User or an agent acts. `isDone` reads it. `setAnnotationStatus` writes `"todo"` explicitly on Reopen (in place when the key exists, else last) and writes nothing when the status is already the wanted one. A `replies` that is not a list is never overwritten: replying is refused as invalid.
- Mark as done / Reopen keep the popup open on the new status; Reply opens a form like Edit (Escape cancels, Cmd/Ctrl+Enter saves).
- A done orphan keeps its red ⚠ button; a done passage whose surroundings changed keeps the orange button and a green highlight.
- The popup's four actions wrap on two rows in its 320 px.
