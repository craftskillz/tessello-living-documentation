# Frontmatter

Atlas page: `features/frontmatter.md`. Decisions: ADR 0004; atlas answers Q-028, Q-047, Q-072, Q-096 to Q-101.

## Rules

1. **One format:** YAML between `---` lines at the top of the file. The original's bold form (`**name:** value`), its older `date` field and meaningful file names (date prefix, `[Category]` marker) are not read.
2. **Left as written:** the Module changes only the fields it sets (`timestamp` at creation, `language`, `html_template`, `type`), in place or appended at the end of the block, and keeps every other byte of the block. No normalization, no field order, no case change on save.
3. **Displayed title:** frontmatter `title`, else the first top-level `#` heading, else the file name exactly as typed without `.md`. Nothing is written back.
4. **Tags:** a YAML list or a comma-separated string, both shown as one pill per item. Nothing is written back.
5. **Dates:** `timestamp` is the creation time, written only when the Module creates a Document. The modified date is the file's modification time, never written. The Tree shows the creation date, else the modified date; the header shows both. Host locale, reader's time zone.
6. **Type:** free text, present only when written by an agent or set with the header's type pill (**Add type** when none; suggestions from the types already used in the Project; clearing removes the field). Never derived from the folder. Shown as a pill; matched by search; no other behavior.
7. **No status:** `status` has no meaning in the Module: no Validate, no marks. The field stays in the file untouched.
8. **Header:** title, `description` as a subtitle, tag pills, creation and modified dates, type pill.
9. **Search** matches the displayed title, tags, `description`, type and body; never field names or other raw frontmatter, and excerpts never show frontmatter text.
10. **Invalid YAML:** the reading view shows a non-blocking warning with the parser's line. Fields are read line by line (`name: value`) for display only. Actions that write a field are refused with "Fix the frontmatter first", opening the editor. Saving from the raw editor stays allowed.
11. **New Document:** frontmatter with `timestamp` only, then a `# <Name>` heading. Template copies: templates round.
12. **No field form** in v1: fields are edited as raw text in the editor.
