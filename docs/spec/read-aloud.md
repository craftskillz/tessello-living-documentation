# Read aloud

Atlas page: `features/read-aloud.md` (business rules R1–R16). Atlas answers: Q-072 to Q-078. Decision: ADR 0009. Rules of the original not changed here are kept (R1, R3, R9–R12).

## Speech

1. The browser's own voices (Web Speech API). No network, no packages, no permission. **Listen** is hidden when the browser has no voices.
2. A ⚙ next to Listen chooses a voice per language and a speed (0.75×–2×). Personal, kept in the Module's storage. Defaults: the browser's default voice for the language, 1×.

## Language

3. The Document's language is the first of `language`, `lang`, `locale`, `langue` (any case). `english`/`anglais` → `en`, `french`/`francais`/`français` → `fr`; any other code (`de`, `es-MX`) is accepted as is.
4. No language: the **Reading language** dialog offers the languages that have a voice, the interface language first. The choice writes `language: <code>` in place, version-checked (Frontmatter rules), then reading starts from the start point captured at the click.
5. Every save failure (conflict, invalid Frontmatter, write error) shows a message, in the reading view and the HTML view alike; the dialog stays open with **Retry**.
6. A language with no voice on this computer: "No voice for '<x>' on this computer". The value is never overwritten.
7. Announcements ("Code block.", "Table.", "Image: …", "Diagram.") follow the Document's language when the Module has them (`en`, `fr`), else the interface language.

## Reading

8. Sentences are split by `Intl.Segmenter` in the Document's language, and at line breaks. No length cap: an overlong sentence is spoken in pieces cut at commas or spaces and stays highlighted whole.
9. A collapsible block's summary line is read, then its content. Code, tables, images and diagrams are only announced.
10. Controls: Listen → Pause/Resume, Next section (disabled on the last section), Stop. Yellow sentence highlight, scrolled to the centre. Nothing cached between readings.
11. Offered in the reading view of an ordinary Document and in the HTML view (main content only, highlight inside the generated page). Not while editing, on Kanban boards or on the Folder manifest. Opening another Document, editing, leaving or regenerating the HTML view stops the reading.
