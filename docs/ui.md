# UI conventions

How the View and the Widget look and behave, so that every panel reads as one product. The settings cog of the Document header (`src/view/Settings.svelte`) is the reference look.

## Colours

Use the theme variables of `src/lib/base.css`: `--bg`, `--panel`, `--ink`, `--muted`, `--line`, `--accent`. They follow the Host's light or dark theme and the White background preference. Error red is `light-dark(#c0392b, #f87171)`.

## Panels, dialogs and forms

Every settings panel, dialog or form puts the `ld-form` class on its root (the popover `div` or the `dialog`). That class, in `src/lib/base.css`, is the single source of the form look:

- one `fieldset` per group, without a border, its `legend` in bold;
- a text field inside `<label class="field">`, its label above it; `class="mono"` for patterns, paths and code;
- checkboxes and radios inside `<label class="check">` (a radio's label needs no class), in the accent colour;
- `<p class="hint muted">` for help under a field or group, `<p class="invalid" role="alert">` for an error.

A dialog too tall for one column (Project settings) lays its fieldsets out in columns, its zones marked by a grey rule (`1px solid var(--line)`) between the columns and above a fieldset that runs across; the fieldsets themselves keep no border. One column in a narrow View.

A component's own `<style>` holds only its layout: position, width, padding, shadow, the actions row. Svelte scopes component styles, so a `dialog` gets nothing from `View.svelte`: give it `color: var(--ink)`, `background: var(--panel)`, `border: 1px solid var(--line)` and `border-radius: 8px` itself. A new form control (`textarea`, `select`, a range…) gets its look in `.ld-form`, so every panel shares it.

## Names

A name the User gave or chose (a Project, a Document, a folder) shows in full: let it wrap with `overflow-wrap: anywhere`, and put the tools next to it on their own line.

## Texts

Every text exists in English and French (`src/lib/i18n.ts`), and every failure shows a translated message.

## Before calling it done

Screenshot the new panel beside the cog panel (a throwaway Playwright test over `openView` in `e2e/`) and compare them.
