# Frontmatter is left as written; no status, no derived type

The original rewrote a Document's whole frontmatter on every save (canonical field order, lower-case names, `type` derived from the folder, `title` from the file name), and reacted to a `status` field with a Validate action and tree marks. Agents now write files directly and Projects live in git repositories, so a rewrite on every save would reorder an agent's frontmatter and pollute diffs. The Module therefore changes only the fields it sets (creation time, reading language, HTML template, type), in place, and keeps the rest of the block byte for byte. It drops status entirely and derives no type from folders: a Document has a type only when one is written, and users build their own folder structure.

## Consequences

- Displayed values are computed when reading, never written back: the title (frontmatter `title`, else the first `#` heading, else the file name exactly as typed, minus `.md`), the modified date (the file's modification time), the tags (a YAML list or a comma-separated string).
- Invalid YAML is warned about and never repaired: app actions that would write a field are refused until the user fixes it.
- One format only: YAML with `timestamp`. The original's older conventions are not read: the bold form (`**name:** value`) is just invalid YAML, an older `date` field is an ordinary unknown field, and file names carry no meaning (no date prefix, no `[Category]` marker).
- A new Document gets only `timestamp` in its Frontmatter and a `# Title` heading in its body; the heading is where its title lives.
- Type is free text set by agents or by the header's type pill, which suggests the types already used in the Project; clearing it removes the field.
- Folders opened by the original still work (ADR 0003): its fields stay in the files; this Module just ignores `status`.
